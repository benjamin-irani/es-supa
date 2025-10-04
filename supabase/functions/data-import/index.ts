import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const BATCH_SIZE = 100; // Process records in batches
const MAX_RETRIES = 3;
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
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
  try {
    console.log('Enhanced data import function called');
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
    const { data: authCheck, error: authCheckError } = await userSupabase.rpc('authorize_data_import', {
      user_uuid: user.id
    });
    if (authCheckError || !authCheck) {
      return new Response(JSON.stringify({
        error: 'Data import requires admin privileges',
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
    // Parse request body
    const body = await req.json();
    const { exportData, dryRun = false, overwriteExisting = true } = body;
    if (!exportData || !exportData.tables) {
      return new Response(JSON.stringify({
        error: 'Invalid export data format'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Starting ${dryRun ? 'DRY RUN' : 'LIVE'} data import for ${Object.keys(exportData.tables).length} tables`);
    const importResults = {
      imported: {},
      failed: {},
      skipped: {},
      metadata: {
        importedAt: new Date().toISOString(),
        totalImported: 0,
        totalFailed: 0,
        totalSkipped: 0,
        dryRun: dryRun,
        version: '2.0'
      }
    };
    // Get current schema to validate compatibility
    const { data: currentSchema } = await supabase.rpc('get_user_tables_with_dependencies');
    const currentTables = new Set(currentSchema?.map((t)=>t.table_name) || []);
    // Sort tables by dependency level from the export data
    const tablesToImport = Object.entries(exportData.tables).filter(([tableName, tableData])=>{
      // Skip tables that don't exist in current schema
      if (!currentTables.has(tableName)) {
        console.warn(`Skipping table ${tableName} - does not exist in current schema`);
        importResults.skipped[tableName] = {
          reason: 'Table does not exist in current schema'
        };
        importResults.metadata.totalSkipped += tableData.records?.length || 0;
        return false;
      }
      // Skip tables with errors or no records
      if (tableData.error || !tableData.records || tableData.records.length === 0) {
        console.log(`Skipping table ${tableName} - no valid records`);
        importResults.skipped[tableName] = {
          reason: tableData.error || 'No records to import'
        };
        return false;
      }
      return true;
    }).sort(([, a], [, b])=>(a.level || 0) - (b.level || 0)).map(([tableName])=>tableName);
    console.log(`Import order (${tablesToImport.length} tables):`, tablesToImport);
    // Import tables in dependency order
    for (const tableName of tablesToImport){
      const tableData = exportData.tables[tableName];
      const records = tableData.records;
      if (dryRun) {
        console.log(`DRY RUN: Would import ${records.length} records to table: ${tableName}`);
        importResults.imported[tableName] = {
          recordCount: records.length,
          batches: Math.ceil(records.length / BATCH_SIZE),
          dryRun: true
        };
        importResults.metadata.totalImported += records.length;
        continue;
      }
      try {
        console.log(`Importing ${records.length} records to table: ${tableName} (level ${tableData.level || 0})`);
        let importedCount = 0;
        let failedCount = 0;
        const errors = [];
        // Process in batches to handle large datasets
        for(let i = 0; i < records.length; i += BATCH_SIZE){
          const batch = records.slice(i, i + BATCH_SIZE);
          let retries = 0;
          while(retries < MAX_RETRIES){
            try {
              console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)} for ${tableName}`);
              const upsertOptions = {
                onConflict: tableData.primaryKey || 'id',
                ignoreDuplicates: !overwriteExisting
              };
              const { data, error: batchError } = await supabase.from(tableName).upsert(batch, upsertOptions).select(tableData.primaryKey || 'id');
              if (batchError) {
                throw batchError;
              }
              importedCount += batch.length;
              break; // Success, exit retry loop
            } catch (batchError) {
              retries++;
              console.warn(`Batch import error for ${tableName} (attempt ${retries}/${MAX_RETRIES}):`, batchError);
              if (retries >= MAX_RETRIES) {
                failedCount += batch.length;
                errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError?.message || 'Batch import failed'}`);
              } else {
                // Wait before retry
                await new Promise((resolve)=>setTimeout(resolve, 1000 * retries));
              }
            }
          }
        }
        if (failedCount > 0) {
          importResults.failed[tableName] = {
            recordCount: failedCount,
            importedCount,
            errors: errors
          };
          importResults.metadata.totalFailed += failedCount;
        } else {
          importResults.imported[tableName] = {
            recordCount: importedCount,
            batches: Math.ceil(records.length / BATCH_SIZE),
            level: tableData.level || 0
          };
        }
        importResults.metadata.totalImported += importedCount;
        console.log(`Completed ${tableName}: ${importedCount} imported, ${failedCount} failed`);
      } catch (tableError) {
        console.error(`Error processing table ${tableName}:`, tableError);
        importResults.failed[tableName] = {
          error: tableError instanceof Error ? tableError.message : 'Unknown error',
          recordCount: records.length
        };
        importResults.metadata.totalFailed += records.length;
      }
    }
    // Reset sequences to maintain ID consistency (only in live mode)
    if (!dryRun && importResults.metadata.totalImported > 0) {
      try {
        console.log('Resetting database sequences...');
        const { data: sequenceResets } = await supabase.rpc('reset_table_sequences');
        importResults.metadata.sequenceResets = sequenceResets;
        console.log('Sequence reset completed:', sequenceResets);
      } catch (seqError) {
        console.warn('Sequence reset failed:', seqError);
        importResults.metadata.sequenceResetError = seqError?.message || 'Sequence reset failed';
      }
    }
    const successMessage = dryRun ? `DRY RUN completed: Would import ${importResults.metadata.totalImported} records, ${importResults.metadata.totalFailed} would fail` : `Import completed: ${importResults.metadata.totalImported} records imported, ${importResults.metadata.totalFailed} failed, ${importResults.metadata.totalSkipped} skipped`;
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
    console.error('Enhanced data import error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred during data import',
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
