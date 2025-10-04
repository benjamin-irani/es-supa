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
    const { event, data } = await req.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Fetch active webhooks for this event
    const { data: webhooks, error: fetchError } = await supabase.from('migration_webhooks').select('*').eq('is_active', true).contains('trigger_events', [
      event
    ]);
    if (fetchError) {
      throw new Error(`Failed to fetch webhooks: ${fetchError.message}`);
    }
    if (!webhooks || webhooks.length === 0) {
      return new Response(JSON.stringify({
        message: 'No active webhooks for this event'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Trigger all matching webhooks
    const deliveryPromises = webhooks.map(async (webhook)=>{
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data
      };
      let lastError = '';
      let successfulDelivery = false;
      let responseStatus = 0;
      let responseBody = '';
      const retryPolicy = typeof webhook.retry_policy === 'string' ? JSON.parse(webhook.retry_policy) : webhook.retry_policy;
      const customHeaders = typeof webhook.headers === 'string' ? JSON.parse(webhook.headers) : webhook.headers;
      // Retry logic with exponential backoff
      for(let attempt = 0; attempt < retryPolicy.maxRetries; attempt++){
        try {
          // Generate HMAC signature if secret is provided
          const headers = {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            'X-Webhook-Timestamp': payload.timestamp,
            ...customHeaders
          };
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
          responseStatus = response.status;
          responseBody = await response.text();
          if (response.ok) {
            successfulDelivery = true;
            break;
          } else {
            lastError = `HTTP ${responseStatus}: ${responseBody}`;
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : 'Unknown error';
        }
        // Exponential backoff delay before next retry
        if (attempt < retryPolicy.maxRetries - 1) {
          await new Promise((resolve)=>setTimeout(resolve, retryPolicy.backoffMs * Math.pow(2, attempt)));
        }
      }
      // Log delivery attempt
      await supabase.from('webhook_deliveries').insert({
        webhook_id: webhook.id,
        event_type: event,
        payload,
        response_status: responseStatus || null,
        response_body: responseBody || null,
        error_message: successfulDelivery ? null : lastError,
        retry_count: retryPolicy.maxRetries - 1,
        success: successfulDelivery,
        delivered_at: new Date().toISOString()
      });
      // Update webhook statistics
      const updateField = successfulDelivery ? 'success_count' : 'failure_count';
      await supabase.from('migration_webhooks').update({
        [updateField]: webhook[updateField] + 1,
        last_triggered_at: new Date().toISOString()
      }).eq('id', webhook.id);
      return {
        webhook: webhook.name,
        success: successfulDelivery,
        error: lastError
      };
    });
    const results = await Promise.all(deliveryPromises);
    return new Response(JSON.stringify({
      message: 'Webhooks triggered',
      results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error triggering webhooks:', error);
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
