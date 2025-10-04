import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Missing authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Verify user is admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
    const isAdmin = roles?.some((r)=>r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({
        error: 'Admin access required'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { webhookId } = await req.json();
    // Fetch webhook config
    const { data: webhook, error: fetchError } = await supabase.from('migration_webhooks').select('*').eq('id', webhookId).single();
    if (fetchError || !webhook) {
      throw new Error('Webhook not found');
    }
    // Send test payload
    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from the Backup & Migration Manager',
        test: true
      }
    };
    const customHeaders = typeof webhook.headers === 'string' ? JSON.parse(webhook.headers) : webhook.headers || {};
    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'test',
      'X-Webhook-Timestamp': payload.timestamp,
      ...customHeaders
    };
    // Generate signature if secret provided
    if (webhook.secret_key) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', encoder.encode(webhook.secret_key), {
        name: 'HMAC',
        hash: 'SHA-256'
      }, false, [
        'sign'
      ]);
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(payload)));
      const signatureHex = Array.from(new Uint8Array(signature)).map((b)=>b.toString(16).padStart(2, '0')).join('');
      headers['X-Webhook-Signature'] = `sha256=${signatureHex}`;
    }
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    const responseStatus = response.status;
    const responseBody = await response.text();
    // Log test delivery
    await supabase.from('webhook_deliveries').insert({
      webhook_id: webhook.id,
      event_type: 'test',
      payload,
      response_status: responseStatus,
      response_body: responseBody,
      error_message: response.ok ? null : `HTTP ${responseStatus}`,
      retry_count: 0,
      success: response.ok,
      delivered_at: new Date().toISOString()
    });
    return new Response(JSON.stringify({
      success: response.ok,
      status: responseStatus,
      body: responseBody
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error testing webhook:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
