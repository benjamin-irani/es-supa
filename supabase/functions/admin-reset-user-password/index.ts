import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
// Flexible CORS configuration
const getAllowedOrigins = ()=>{
  const requestOrigin = Deno.env.get("REQUEST_ORIGIN");
  const prodOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // If explicit production origin is set, use it
  if (prodOrigin) {
    return prodOrigin;
  }
  // Support common development and production patterns
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://cms.eywa365.net",
    "https://coniunus.co",
    supabaseUrl
  ].filter(Boolean);
  // If request origin is in allowed list, use it
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Default to first production origin or localhost
  return prodOrigin || "https://cms.eywa365.net";
};
const corsHeaders = {
  'Access-Control-Allow-Origin': getAllowedOrigins(),
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
  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Missing Authorization header');
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
    // Create regular client for checking authorization
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    // Create service role client for privileged operations
    const adminClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.log('User authentication failed:', userError);
      return new Response(JSON.stringify({
        error: 'Authentication failed'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Reset password request by user: ${user.id}`);
    // Check if user has admin role using the has_role function
    const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });
    if (roleError) {
      console.error('Error checking admin role:', roleError);
      return new Response(JSON.stringify({
        error: 'Failed to verify admin permissions'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!isAdmin) {
      console.log(`Access denied: User ${user.id} is not an admin`);
      return new Response(JSON.stringify({
        error: 'Access denied. Admin role required.'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { email, user_id, redirectTo } = await req.json();
    let targetEmail = email;
    // If user_id is provided but no email, look up the email
    if (user_id && !email) {
      const { data: profile, error: profileError } = await adminClient.from('profiles').select('email').eq('id', user_id).single();
      if (profileError || !profile?.email) {
        console.error('Failed to find user email:', profileError);
        return new Response(JSON.stringify({
          error: 'User not found'
        }), {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      targetEmail = profile.email;
    }
    if (!targetEmail) {
      return new Response(JSON.stringify({
        error: 'Email is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Set default redirect URL
    const resetRedirectTo = redirectTo || `${new URL(req.url).origin}/reset-password`;
    console.log(`Sending password reset email to: ${targetEmail}, redirect: ${resetRedirectTo}`);
    // Send password reset email using service role client
    const { error: resetError } = await adminClient.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: resetRedirectTo
    });
    if (resetError) {
      console.error('Error sending reset email:', resetError);
      // Try to generate a manual recovery link as a fallback
      try {
        const { data: linkData, error: linkGenError } = await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: targetEmail,
          options: {
            redirectTo: resetRedirectTo
          }
        });
        if (!linkGenError && linkData) {
          const actionLink = linkData.properties?.action_link || linkData.action_link || linkData.user?.action_link || null;
          if (actionLink) {
            console.log('Generated manual recovery link for admin delivery');
            return new Response(JSON.stringify({
              message: 'Password reset link generated (email delivery failed).',
              email: targetEmail,
              manualLink: actionLink,
              emailSent: false
            }), {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        } else if (linkGenError) {
          console.error('Failed to generate manual recovery link:', linkGenError);
        }
      } catch (e) {
        console.error('Exception generating manual recovery link:', e);
      }
      // Provide user-friendly error messages based on error type
      let errorMessage = 'Failed to send password reset email';
      let statusCode = 400;
      if (resetError.message?.includes('Authentication failed') || resetError.message?.includes('SMTP') || resetError.code === 'unexpected_failure') {
        errorMessage = 'Email service configuration error. Please contact system administrator.';
        statusCode = 500;
      } else if (resetError.message?.includes('rate limit')) {
        errorMessage = 'Too many reset requests. Please wait a few minutes before trying again.';
        statusCode = 429;
      } else if (resetError.message?.includes('not found') || resetError.message?.includes('invalid email')) {
        errorMessage = 'User not found or invalid email address.';
        statusCode = 404;
      }
      return new Response(JSON.stringify({
        error: errorMessage,
        details: resetError.message,
        code: resetError.code
      }), {
        status: statusCode,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Password reset email sent successfully to: ${targetEmail}`);
    return new Response(JSON.stringify({
      message: `Password reset email sent to ${targetEmail}`,
      email: targetEmail
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in admin-reset-user-password function:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
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
