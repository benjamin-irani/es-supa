import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('Enhanced storage export function called');
    // SECURITY: Verify admin privileges before accessing service role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    // Create authenticated client to verify permissions
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false
      }
    });
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Invalid authentication'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Call authorization function to verify admin privileges
    const { data: authCheck, error: authCheckError } = await userSupabase.rpc('authorize_storage_export', {
      user_uuid: user.id
    });
    if (authCheckError || !authCheck) {
      return new Response(JSON.stringify({
        error: 'Storage export requires admin privileges',
        details: authCheckError?.message || 'Access denied'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check rate limiting
    const { error: rateLimitError } = await userSupabase.rpc('check_export_rate_limit', {
      user_uuid: user.id
    });
    if (rateLimitError) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        details: rateLimitError.message
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get service role key from environment (now authorized to use it)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not found');
      return new Response(JSON.stringify({
        error: 'Service role key not configured'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create Supabase client with service role (now authorized - bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    // Get all storage buckets dynamically
    console.log('Discovering storage buckets...');
    const { data: buckets, error: bucketsError } = await supabase.rpc('get_storage_buckets');
    if (bucketsError) {
      console.error('Error getting storage buckets:', bucketsError);
      return new Response(JSON.stringify({
        error: 'Failed to discover storage buckets',
        details: bucketsError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const storageBuckets = buckets;
    console.log(`Found ${storageBuckets.length} storage buckets:`, storageBuckets.map((b)=>b.bucket_name));
    const exportData = {
      buckets: {},
      schema: {
        buckets: storageBuckets,
        version: '2.0',
        exportedAt: new Date().toISOString()
      },
      metadata: {
        exportedAt: new Date().toISOString(),
        totalObjects: 0,
        totalSize: 0,
        totalBuckets: storageBuckets.length,
        bucketCounts: {},
        version: '2.0'
      }
    };
    // Helper function to recursively list all files in a bucket
    const listAllObjects = async (bucketId, prefix = '', allObjects = [])=>{
      try {
        const { data: objects, error: listError } = await supabase.storage.from(bucketId).list(prefix, {
          limit: 1000,
          sortBy: {
            column: 'name',
            order: 'asc'
          }
        });
        if (listError) {
          console.warn(`Error listing objects in ${bucketId}/${prefix}:`, listError);
          return allObjects;
        }
        if (!objects || objects.length === 0) {
          return allObjects;
        }
        for (const obj of objects){
          const fullPath = prefix ? `${prefix}/${obj.name}` : obj.name;
          if (obj.metadata === null) {
            // This is a folder, recursively list its contents
            const subObjects = await listAllObjects(bucketId, fullPath, []);
            allObjects.push(...subObjects);
          } else {
            // This is a file
            allObjects.push({
              ...obj,
              name: fullPath,
              path: fullPath
            });
          }
        }
        return allObjects;
      } catch (error) {
        console.warn(`Error in recursive listing for ${bucketId}/${prefix}:`, error);
        return allObjects;
      }
    };
    // Export each bucket
    for (const bucket of storageBuckets){
      const bucketId = bucket.bucket_id;
      try {
        console.log(`Exporting bucket: ${bucketId} (${bucket.is_public ? 'public' : 'private'})`);
        // Get all objects recursively
        const allObjects = await listAllObjects(bucketId);
        if (allObjects.length === 0) {
          console.log(`Bucket ${bucketId} is empty`);
          exportData.buckets[bucketId] = {
            objects: [],
            count: 0,
            totalSize: 0,
            isPublic: bucket.is_public,
            bucketName: bucket.bucket_name
          };
          continue;
        }
        const bucketObjects = [];
        let bucketSize = 0;
        let successCount = 0;
        let errorCount = 0;
        // Process each object
        for (const obj of allObjects){
          try {
            // Create signed URL with longer expiry for large exports
            const { data: signedUrl, error: urlError } = await supabase.storage.from(bucketId).createSignedUrl(obj.path, 7200); // 2 hours expiry
            if (urlError) {
              console.warn(`Error creating signed URL for ${obj.path}:`, urlError);
              errorCount++;
              continue;
            }
            bucketObjects.push({
              name: obj.name,
              path: obj.path,
              size: obj.metadata?.size || 0,
              contentType: obj.metadata?.mimetype || 'application/octet-stream',
              lastModified: obj.updated_at,
              downloadUrl: signedUrl.signedUrl,
              metadata: {
                ...obj.metadata,
                cacheControl: obj.metadata?.cacheControl,
                contentLanguage: obj.metadata?.contentLanguage,
                contentEncoding: obj.metadata?.contentEncoding
              }
            });
            bucketSize += obj.metadata?.size || 0;
            successCount++;
          } catch (objError) {
            console.warn(`Error processing object ${obj.path}:`, objError);
            errorCount++;
          }
        }
        exportData.buckets[bucketId] = {
          objects: bucketObjects,
          count: bucketObjects.length,
          totalSize: bucketSize,
          isPublic: bucket.is_public,
          bucketName: bucket.bucket_name,
          stats: {
            processed: allObjects.length,
            successful: successCount,
            errors: errorCount
          }
        };
        exportData.metadata.bucketCounts[bucketId] = bucketObjects.length;
        exportData.metadata.totalObjects += bucketObjects.length;
        exportData.metadata.totalSize += bucketSize;
        console.log(`Exported ${bucketObjects.length}/${allObjects.length} objects from bucket ${bucketId} (${(bucketSize / 1024 / 1024).toFixed(2)} MB)`);
      } catch (bucketError) {
        console.error(`Error exporting bucket ${bucketId}:`, bucketError);
        exportData.buckets[bucketId] = {
          error: bucketError instanceof Error ? bucketError.message : 'Unknown error',
          objects: [],
          isPublic: bucket.is_public,
          bucketName: bucket.bucket_name
        };
      }
    }
    const totalSizeMB = (exportData.metadata.totalSize / 1024 / 1024).toFixed(2);
    console.log('Enhanced storage export completed:', {
      totalObjects: exportData.metadata.totalObjects,
      totalSizeMB,
      totalBuckets: exportData.metadata.totalBuckets,
      successfulBuckets: Object.keys(exportData.buckets).filter((k)=>!exportData.buckets[k].error).length
    });
    return new Response(JSON.stringify({
      success: true,
      data: exportData,
      message: `Exported ${exportData.metadata.totalObjects} objects (${totalSizeMB} MB) from ${exportData.metadata.totalBuckets} buckets`,
      version: '2.0'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Enhanced storage export error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred during storage export',
      details: error instanceof Error ? error.stack : undefined,
      version: '2.0'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
