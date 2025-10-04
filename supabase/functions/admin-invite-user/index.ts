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
const validRoles = [
  'admin',
  'editor',
  'support_agent',
  'user'
];
const handler = async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  // Create admin client with service role key
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);
  // Create regular client for auth verification
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY'));
  try {
    // Verify user is authenticated and has admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'No authorization header'
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
        error: 'Invalid token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check if user has admin role
    const { data: adminCheck, error: adminError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });
    if (adminError || !adminCheck) {
      return new Response(JSON.stringify({
        error: 'Insufficient permissions'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const body = await req.json();
    // Validate input
    if (!body.email || typeof body.email !== 'string') {
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
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return new Response(JSON.stringify({
        error: 'Invalid email format'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Validate roles if provided
    const roles = body.roles || [
      'user'
    ];
    const invalidRoles = roles.filter((role)=>!validRoles.includes(role));
    if (invalidRoles.length > 0) {
      return new Response(JSON.stringify({
        error: `Invalid roles: ${invalidRoles.join(', ')}`
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Limit input lengths
    const firstName = body.first_name?.substring(0, 100) || '';
    const lastName = body.last_name?.substring(0, 100) || '';
    const email = body.email.substring(0, 320).toLowerCase().trim();
    let userId = null;
    // Try to invite the user first
    try {
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name: firstName,
          last_name: lastName
        },
        redirectTo: `${new URL(req.url).origin}/auth`
      });
      if (inviteData?.user?.id) {
        userId = inviteData.user.id;
        console.log(`Successfully invited user: ${email} with ID: ${userId}`);
      } else if (inviteError) {
        throw inviteError;
      }
    } catch (inviteError) {
      console.log(`Invite error: ${inviteError.message}`);
      // If invite fails, try to find existing user by email using admin client
      const { data: existingProfile, error: profileError } = await adminClient.from('profiles').select('id').eq('email', email).single();
      if (profileError || !existingProfile) {
        console.error('Profile lookup error:', profileError);
        return new Response(JSON.stringify({
          error: `Failed to invite user: ${inviteError.message}`
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      userId = existingProfile.id;
      console.log(`Found existing user: ${email} with ID: ${userId}`);
    }
    if (!userId) {
      return new Response(JSON.stringify({
        error: 'Failed to create or find user'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Assign roles using admin client to bypass RLS restrictions
    const roleInserts = roles.map((role)=>({
        user_id: userId,
        role: role
      }));
    const { error: rolesError } = await adminClient.from('user_roles').upsert(roleInserts, {
      onConflict: 'user_id,role'
    });
    if (rolesError) {
      console.error('Error assigning roles with admin client:', rolesError);
      return new Response(JSON.stringify({
        error: 'User created but failed to assign roles'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Successfully assigned roles to user ${userId}: ${roles.join(', ')}`);
    return new Response(JSON.stringify({
      success: true,
      userId,
      message: `User ${email} has been ${userId ? 'invited' : 'updated'} with roles: ${roles.join(', ')}`
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error in admin-invite-user:', error);
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
