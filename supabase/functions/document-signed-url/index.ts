import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    const { documentId, action = 'view' } = await req.json();
    if (!documentId) {
      return new Response(JSON.stringify({
        error: 'Document ID is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get document details
    const { data: document, error: docError } = await supabaseClient.from('documents').select('*').eq('id', documentId).single();
    if (docError || !document) {
      console.error('Document not found:', docError);
      return new Response(JSON.stringify({
        error: 'Document not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check permissions based on visibility
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (document.visibility === 'authenticated' && !user) {
      return new Response(JSON.stringify({
        error: 'Authentication required'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (document.visibility === 'role_restricted') {
      if (!user) {
        return new Response(JSON.stringify({
          error: 'Authentication required'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      // Check if user has required role
      const { data: userRoles } = await supabaseClient.from('user_roles').select('role').eq('user_id', user.id);
      const hasRequiredRole = userRoles?.some((ur)=>document.allowed_roles?.includes(ur.role));
      if (!hasRequiredRole) {
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
    }
    // Generate signed URL
    const expiresIn = action === 'view' ? 3600 : 300; // 1 hour for view, 5 min for download
    const { data: signedUrlData, error: urlError } = await supabaseClient.storage.from(document.bucket_id).createSignedUrl(document.object_path, expiresIn, {
      download: action === 'download' ? document.title : undefined
    });
    if (urlError || !signedUrlData) {
      console.error('Error creating signed URL:', urlError);
      return new Response(JSON.stringify({
        error: 'Failed to generate access URL'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    return new Response(JSON.stringify({
      url: signedUrlData.signedUrl,
      expires_at: expiresAt
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in document-signed-url function:', error);
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
});
