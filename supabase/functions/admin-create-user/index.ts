import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const validRoles = [
  'admin',
  'user',
  'editor',
  'support_agent'
];
const handler = async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  console.log('Admin create user function called');
  console.log('Request method:', req.method);
  console.log('Authorization header present:', !!req.headers.get('authorization'));
  try {
    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    console.log('Auth header format:', authHeader ? `${authHeader.substring(0, 20)}...` : 'missing');
    if (!authHeader) {
      console.error('Missing authorization header');
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
    // Get the JWT token
    const jwt = authHeader.replace('Bearer ', '');
    console.log('JWT token length:', jwt.length);
    // Verify the user and get their session
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      console.error('Auth error details:', {
        error: authError,
        errorMessage: authError?.message,
        hasUser: !!user,
        jwtLength: jwt.length
      });
      return new Response(JSON.stringify({
        error: 'Invalid or expired token',
        details: authError?.message || 'No user found'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('User authenticated:', {
      userId: user.id,
      email: user.email
    });
    // Check if user has admin privileges
    const { data: hasAdminRole, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });
    if (roleError || !hasAdminRole) {
      console.error('Role check error:', roleError);
      return new Response(JSON.stringify({
        error: 'Access denied: Admin privileges required'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { email, password, firstName, lastName, roles, forcePasswordReset } = await req.json();
    // Validate input
    if (!email || !password) {
      return new Response(JSON.stringify({
        error: 'Email and password are required'
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
    if (!emailRegex.test(email)) {
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
    // Validate password strength
    if (password.length < 6) {
      return new Response(JSON.stringify({
        error: 'Password must be at least 6 characters long'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Validate roles
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
    // Create user with admin client
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: !forcePasswordReset,
      user_metadata: {
        first_name: firstName || '',
        last_name: lastName || '',
        force_password_reset: forcePasswordReset || false
      }
    });
    if (createError) {
      console.error('User creation error:', createError);
      return new Response(JSON.stringify({
        error: createError.message
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!newUser.user) {
      return new Response(JSON.stringify({
        error: 'Failed to create user'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('User created successfully:', newUser.user.id);
    // Create profile if first_name or last_name provided
    if (firstName || lastName) {
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: newUser.user.id,
        first_name: firstName || null,
        last_name: lastName || null,
        email: email
      });
      if (profileError) {
        console.error('Profile creation error:', profileError);
      // Don't fail the entire operation for profile creation error
      }
    }
    // Assign roles to the new user
    if (roles.length > 0) {
      const roleInserts = roles.map((role)=>({
          user_id: newUser.user.id,
          role: role
        }));
      const { error: roleError } = await adminClient.from('user_roles').upsert(roleInserts);
      if (roleError) {
        console.error('Role assignment error:', roleError);
        return new Response(JSON.stringify({
          error: 'User created but role assignment failed',
          details: roleError.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Log the admin action
    console.log(`Admin ${user.email} created user ${email} with roles: ${roles.join(', ')}`);
    return new Response(JSON.stringify({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        created_at: newUser.user.created_at
      },
      message: `User ${email} created successfully${roles.length > 0 ? ` with roles: ${roles.join(', ')}` : ''}`
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in admin-create-user function:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
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
