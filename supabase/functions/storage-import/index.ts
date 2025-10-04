import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('Enhanced storage import function called');
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
    const { data: authCheck, error: authCheckError } = await userSupabase.rpc('authorize_storage_import', {
      user_uuid: user.id
    });
    if (authCheckError || !authCheck) {
      return new Response(JSON.stringify({
        error: 'Storage import requires admin privileges',
        details: authCheckError?.message || 'Access denied'
      }), {
        status: 403,
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
    // Parse the request body
    const body = await req.json();
    const { exportData, dryRun = false, overwriteExisting = true } = body;
    if (!exportData || !exportData.buckets) {
      return new Response(JSON.stringify({
        error: 'Invalid export data provided'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Starting ${dryRun ? 'DRY RUN' : 'LIVE'} storage import for buckets:`, Object.keys(exportData.buckets));
    const importResults = {
      buckets: {},
      metadata: {
        importedAt: new Date().toISOString(),
        totalImported: 0,
        totalFailed: 0,
        totalSkipped: 0,
        totalSizeImported: 0,
        dryRun: dryRun,
        version: '2.0',
        bucketResults: {}
      }
    };
    // Get current buckets to validate availability
    const { data: currentBuckets } = await supabase.rpc('get_storage_buckets');
    const availableBuckets = new Set(currentBuckets?.map((b)=>b.bucket_id) || []);
    // Helper function to download file with retries
    const downloadFileWithRetry = async (url, fileName)=>{
      let lastError = null;
      for(let attempt = 1; attempt <= MAX_RETRIES; attempt++){
        try {
          console.log(`Downloading ${fileName} (attempt ${attempt}/${MAX_RETRIES})`);
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const fileBlob = await response.blob();
          const fileBuffer = await fileBlob.arrayBuffer();
          return new Uint8Array(fileBuffer);
        } catch (error) {
          lastError = error;
          console.warn(`Download attempt ${attempt} failed for ${fileName}:`, error);
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve)=>setTimeout(resolve, RETRY_DELAY * attempt));
          }
        }
      }
      throw lastError || new Error(`Failed to download ${fileName} after ${MAX_RETRIES} attempts`);
    };
    // Helper function to upload file with retries
    const uploadFileWithRetry = async (bucketId, path, fileData, contentType, metadata)=>{
      let lastError = null;
      for(let attempt = 1; attempt <= MAX_RETRIES; attempt++){
        try {
          const uploadOptions = {
            contentType,
            upsert: overwriteExisting,
            duplex: 'half'
          };
          // Add cache control if available
          if (metadata?.cacheControl) {
            uploadOptions.cacheControl = metadata.cacheControl;
          }
          const { data: uploadData, error: uploadError } = await supabase.storage.from(bucketId).upload(path, fileData, uploadOptions);
          if (uploadError) {
            throw uploadError;
          }
          return uploadData;
        } catch (error) {
          lastError = error;
          console.warn(`Upload attempt ${attempt} failed for ${path}:`, error);
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve)=>setTimeout(resolve, RETRY_DELAY * attempt));
          }
        }
      }
      throw lastError || new Error(`Failed to upload ${path} after ${MAX_RETRIES} attempts`);
    };
    // Import each bucket
    for (const [bucketId, bucketData] of Object.entries(exportData.buckets)){
      try {
        console.log(`Processing bucket: ${bucketId}`);
        const bucketInfo = bucketData;
        // Check if bucket exists in destination
        if (!availableBuckets.has(bucketId)) {
          console.warn(`Bucket ${bucketId} does not exist in destination`);
          importResults.buckets[bucketId] = {
            skipped: true,
            reason: 'Bucket does not exist in destination',
            bucketName: bucketInfo.bucketName
          };
          continue;
        }
        if (bucketInfo.error || !bucketInfo.objects || bucketInfo.objects.length === 0) {
          console.warn(`Skipping bucket ${bucketId}:`, bucketInfo.error || 'No objects to import');
          importResults.buckets[bucketId] = {
            skipped: true,
            reason: bucketInfo.error || 'No objects to import',
            bucketName: bucketInfo.bucketName
          };
          continue;
        }
        const objects = bucketInfo.objects;
        const importedObjects = [];
        const failedObjects = [];
        let totalSizeImported = 0;
        if (dryRun) {
          console.log(`DRY RUN: Would import ${objects.length} objects to bucket ${bucketId}`);
          importResults.buckets[bucketId] = {
            dryRun: true,
            wouldImport: objects.length,
            totalSize: bucketInfo.totalSize,
            bucketName: bucketInfo.bucketName
          };
          importResults.metadata.totalImported += objects.length;
          importResults.metadata.totalSizeImported += bucketInfo.totalSize || 0;
          continue;
        }
        // Process each object
        for(let i = 0; i < objects.length; i++){
          const obj = objects[i];
          const progress = `${i + 1}/${objects.length}`;
          try {
            console.log(`Importing ${obj.path} to bucket ${bucketId} (${progress})`);
            // Download file with retries
            const fileData = await downloadFileWithRetry(obj.downloadUrl, obj.name);
            // Upload file with retries
            const uploadData = await uploadFileWithRetry(bucketId, obj.path, fileData, obj.contentType, obj.metadata);
            console.log(`Successfully imported: ${obj.path} (${(obj.size / 1024).toFixed(1)} KB)`);
            importedObjects.push({
              name: obj.name,
              path: obj.path,
              size: obj.size,
              uploadPath: uploadData.path
            });
            totalSizeImported += obj.size || 0;
            importResults.metadata.totalImported++;
            importResults.metadata.totalSizeImported += obj.size || 0;
          } catch (objError) {
            console.error(`Error importing object ${obj.path}:`, objError);
            failedObjects.push({
              name: obj.name,
              path: obj.path,
              error: objError instanceof Error ? objError.message : 'Unknown error'
            });
            importResults.metadata.totalFailed++;
          }
        }
        importResults.buckets[bucketId] = {
          imported: importedObjects,
          failed: failedObjects,
          importedCount: importedObjects.length,
          failedCount: failedObjects.length,
          totalAttempted: objects.length,
          totalSizeImported: totalSizeImported,
          bucketName: bucketInfo.bucketName,
          isPublic: bucketInfo.isPublic
        };
        importResults.metadata.bucketResults[bucketId] = {
          imported: importedObjects.length,
          failed: failedObjects.length,
          totalSize: totalSizeImported
        };
        const sizeMB = (totalSizeImported / 1024 / 1024).toFixed(2);
        console.log(`Completed bucket ${bucketId}: ${importedObjects.length}/${objects.length} objects imported (${sizeMB} MB)`);
      } catch (bucketError) {
        console.error(`Error importing bucket ${bucketId}:`, bucketError);
        importResults.buckets[bucketId] = {
          error: bucketError instanceof Error ? bucketError.message : 'Unknown error',
          bucketName: bucketData?.bucketName || bucketId
        };
      }
    }
    const totalSizeMB = (importResults.metadata.totalSizeImported / 1024 / 1024).toFixed(2);
    const successMessage = dryRun ? `DRY RUN completed: Would import ${importResults.metadata.totalImported} objects (${totalSizeMB} MB), ${importResults.metadata.totalFailed} would fail` : `Import completed: ${importResults.metadata.totalImported} objects imported (${totalSizeMB} MB), ${importResults.metadata.totalFailed} failed`;
    console.log(successMessage);
    return new Response(JSON.stringify({
      success: true,
      data: importResults,
      message: successMessage,
      version: '2.0'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Enhanced storage import error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred during storage import',
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
