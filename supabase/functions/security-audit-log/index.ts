import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
// Standard CORS headers for web app edge functions
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
const handler = async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Create admin client with service role key for audit logging
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  // Create regular client for auth verification
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY'));
  try {
    // REQUIRE authentication - no anonymous access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Authorization header required'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Invalid or expired token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const userId = user.id;
    const body = await req.json();
    // Validate required fields
    if (!body.action || !body.table_name) {
      return new Response(JSON.stringify({
        error: 'Action and table_name are required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get client IP and user agent for security context
    // Handle multiple IPs in x-forwarded-for header
    let clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'unknown';
    // Take only the first IP if multiple are present
    if (clientIP.includes(',')) {
      clientIP = clientIP.split(',')[0].trim();
    }
    const userAgent = req.headers.get('user-agent') || 'unknown';
    // Use secure function with rate limiting and enhanced logging
    const { data: success, error: auditError } = await adminClient.rpc('log_sensitive_operation_with_limits', {
      operation_type: body.action.substring(0, 100),
      table_name: body.table_name.substring(0, 100),
      record_id: body.record_id?.substring(0, 100),
      user_id: userId,
      ip_address: clientIP.substring(0, 45),
      user_agent: userAgent.substring(0, 500)
    });
    // Enhanced classification of non-critical actions that should not surface 429s to the UI
    const actionLower = (body.action || '').toLowerCase();
    const nonCriticalAuth = [
      'user_login',
      'user_logout',
      'user_logout_initiated',
      'token_refresh',
      'session_refresh',
      'auth_state_change',
      'initial_session'
    ].some((a)=>actionLower.includes(a));
    const nonCriticalGeneral = [
      'list_view',
      'team_member',
      'contact_view',
      'contact_submissions_hr_access_secure',
      'contact_submission_hr_view',
      'admin_event_registrations_access',
      'forced_logout',
      'admin_access',
      'admin_dashboard_access',
      'profile_data_access',
      'security_dashboard',
      'sensitive_data_access',
      'routine_view',
      'navigation'
    ].some((a)=>actionLower.includes(a));
    const treatAsNonCritical = nonCriticalAuth || nonCriticalGeneral;
    if (auditError) {
      console.error('Failed to log security audit:', auditError);
      const isRateLimit = auditError.message?.toLowerCase().includes('rate limit');
      const isInet = auditError.message?.includes('invalid input syntax for type inet');
      // For non-critical actions, avoid surfacing 429s to the client
      if (isRateLimit && treatAsNonCritical) {
        return new Response(JSON.stringify({
          success: false,
          throttled: true,
          retryAfter: 60,
          message: 'Audit logging throttled for non-critical action'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const errorMessage = isRateLimit ? 'Rate limited - please slow down requests' : isInet ? 'Invalid IP address format' : 'Failed to log audit event';
      return new Response(JSON.stringify({
        error: errorMessage,
        details: auditError.message,
        retryAfter: isRateLimit ? 60 : undefined
      }), {
        status: isRateLimit ? 429 : 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          ...isRateLimit ? {
            'Retry-After': '60'
          } : {}
        }
      });
    }
    if (!success) {
      // For non-critical actions, avoid surfacing 429s to the client
      if (treatAsNonCritical) {
        return new Response(JSON.stringify({
          success: false,
          throttled: true,
          retryAfter: 60,
          message: 'Audit logging throttled for non-critical action'
        }), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      return new Response(JSON.stringify({
        error: 'Rate limited - too many requests',
        retryAfter: 60,
        message: 'Security audit logging is rate limited to prevent spam'
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '60'
        }
      });
    }
    console.log(`Security audit logged: ${body.action} on ${body.table_name} by user ${userId}`);
    return new Response(JSON.stringify({
      success: true,
      message: 'Security event logged'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in security-audit-log:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
};
serve(handler);
