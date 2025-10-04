import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// 🆕 Helper function for retry logic with exponential backoff
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError = null;
  for(let attempt = 0; attempt <= maxRetries; attempt++){
    try {
      const response = await fetch(url, options);
      // If rate limited, respect Retry-After header
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        console.warn(`⚠️ Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise((resolve)=>setTimeout(resolve, waitTime));
        continue;
      }
      // Success or client error (don't retry 4xx except 429)
      if (response.ok || response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response;
      }
      // Server error (5xx) - retry with backoff
      if (response.status >= 500) {
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s
        console.warn(`⚠️ Server error ${response.status}. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise((resolve)=>setTimeout(resolve, waitTime));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`⚠️ Network error: ${lastError.message}. Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve)=>setTimeout(resolve, waitTime));
      }
    }
  }
  throw lastError || new Error('Max retries exceeded');
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  // Parse request body once and store it
  let requestBody;
  try {
    requestBody = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Invalid request body'
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  const { backupOperationId } = requestBody;
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log(`📦 Starting export for backup: ${backupOperationId}`);
    // Get backup operation details
    const { data: backupOp, error: fetchError } = await supabase.from('backup_operations').select('*').eq('id', backupOperationId).single();
    if (fetchError || !backupOp) {
      throw new Error('Backup operation not found');
    }
    // Update status to running
    await supabase.from('backup_operations').update({
      status: 'running',
      started_at: new Date().toISOString(),
      progress_percentage: 5
    }).eq('id', backupOperationId);
    // Get user credentials for Management API access
    const { data: credentials } = await supabase.from('user_credentials').select('api_credentials').eq('user_id', backupOp.user_id).single();
    const managementToken = credentials?.api_credentials?.management_token;
    if (!managementToken) {
      throw new Error('Management API token not found');
    }
    const backupData = {
      version: '2.1.0',
      timestamp: new Date().toISOString(),
      projectId: backupOp.source_project_id,
      captureVersion: '2.1.0' // 🆕 Capture version with realtime/roles support
    };
    const components = backupOp.components_included || [];
    // Progress allocation per component
    const PROGRESS_RANGES = {
      start: 5,
      schema: {
        start: 5,
        end: 15
      },
      data: {
        start: 15,
        end: 70
      },
      storage: {
        start: 70,
        end: 80
      },
      functions: {
        start: 80,
        end: 85
      },
      auth: {
        start: 85,
        end: 90
      },
      projectConfig: {
        start: 90,
        end: 95
      },
      finalize: {
        start: 95,
        end: 100
      } // 5% range
    };
    // Get authorization header for inspect functions
    const authHeader = req.headers.get('authorization') || '';
    // Export database schema
    if (components.includes('schema')) {
      console.log('📋 Exporting database schema...');
      await supabase.from('backup_operations').update({
        progress_percentage: PROGRESS_RANGES.schema.start
      }).eq('id', backupOperationId);
      try {
        const schemaResponse = await supabase.functions.invoke('inspect-database', {
          body: {
            projectId: backupOp.source_project_id
          },
          headers: {
            Authorization: authHeader
          }
        });
        console.log('Schema response status:', schemaResponse.error ? 'error' : 'success');
        if (schemaResponse.error) {
          console.error('❌ Schema export error:', schemaResponse.error);
          throw new Error(`Schema export failed: ${schemaResponse.error.message}`);
        }
        if (schemaResponse.data) {
          console.log('✅ Schema data structure:', Object.keys(schemaResponse.data));
          backupData.schema = schemaResponse.data;
          // 🆕 Extract and store new components separately for better organization
          if (schemaResponse.data.views) {
            backupData.views = schemaResponse.data.views;
            console.log(`  📊 Captured ${backupData.views.length} views`);
          }
          if (schemaResponse.data.materializedViews) {
            backupData.materializedViews = schemaResponse.data.materializedViews;
            console.log(`  📊 Captured ${backupData.materializedViews.length} materialized views`);
          }
          if (schemaResponse.data.sequences) {
            backupData.sequences = schemaResponse.data.sequences;
            console.log(`  📊 Captured ${backupData.sequences.length} sequences with current values`);
          }
          if (schemaResponse.data.checkConstraints) {
            backupData.checkConstraints = schemaResponse.data.checkConstraints;
            console.log(`  📊 Captured ${backupData.checkConstraints.length} CHECK constraints`);
          }
          if (schemaResponse.data.uniqueConstraints) {
            backupData.uniqueConstraints = schemaResponse.data.uniqueConstraints;
            console.log(`  📊 Captured ${backupData.uniqueConstraints.length} UNIQUE constraints`);
          }
          if (schemaResponse.data.triggers) {
            backupData.triggers = schemaResponse.data.triggers;
            console.log(`  📊 Captured ${backupData.triggers.length} triggers`);
          }
          if (schemaResponse.data.customTypes) {
            backupData.customTypes = schemaResponse.data.customTypes;
            console.log(`  📊 Captured ${backupData.customTypes.length} custom types`);
          }
          if (schemaResponse.data.extensions) {
            backupData.extensions = schemaResponse.data.extensions;
            console.log(`  📊 Captured ${backupData.extensions.length} extensions`);
          }
          // 🆕 CRITICAL: Capture realtime publications
          if (schemaResponse.data.realtimePublications) {
            backupData.realtimePublications = schemaResponse.data.realtimePublications;
            console.log(`  📡 Captured ${backupData.realtimePublications.length} realtime publications`);
            if (backupData.realtimePublications.length > 0) {
              console.log(`  ⚠️  WARNING: Realtime will need reconfiguration after restore`);
            }
          }
          // 🆕 CRITICAL: Capture custom roles
          if (schemaResponse.data.customRoles) {
            backupData.customRoles = schemaResponse.data.customRoles;
            console.log(`  👥 Captured ${backupData.customRoles.length} custom database roles`);
            if (backupData.customRoles.length > 0) {
              console.log(`  ⚠️  WARNING: Custom roles will need recreation after restore`);
            }
          }
          // 🆕 CRITICAL: Capture custom grants
          if (schemaResponse.data.customGrants) {
            backupData.customGrants = schemaResponse.data.customGrants;
            console.log(`  🔐 Captured ${backupData.customGrants.length} custom grants`);
          }
          // 🆕 Capture all schemas (for multi-schema detection)
          if (schemaResponse.data.schemas) {
            backupData.schemas = schemaResponse.data.schemas;
            const schemasWithObjects = schemaResponse.data.schemas.filter((s)=>s.table_count > 0 || s.view_count > 0 || s.function_count > 0);
            console.log(`  🗂️  Detected ${schemasWithObjects.length} schemas with objects`);
            if (schemasWithObjects.length > 1) {
              console.warn(`  ⚠️  WARNING: Multi-schema detected but only 'public' fully captured!`);
            }
          }
          await supabase.from('backup_operations').update({
            progress_percentage: PROGRESS_RANGES.schema.end
          }).eq('id', backupOperationId);
        }
      } catch (error) {
        console.error('❌ Failed to export schema:', error);
        // Continue with backup but log the error
        backupData.schema = {
          error: error instanceof Error ? error.message : 'Failed to export schema'
        };
      }
    }
    // Export database data
    if (components.includes('data')) {
      console.log('💾 Exporting database data...');
      await supabase.from('backup_operations').update({
        progress_percentage: PROGRESS_RANGES.data.start
      }).eq('id', backupOperationId);
      // Get project API keys using the dedicated endpoint
      console.log('🔑 Fetching API keys for data export...');
      const keysResponse = await fetchWithRetry(`https://api.supabase.com/v1/projects/${backupOp.source_project_id}/api-keys?reveal=true`, {
        headers: {
          'Authorization': `Bearer ${managementToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!keysResponse.ok) {
        const errorText = await keysResponse.text();
        console.error(`❌ Failed to fetch API keys. Status: ${keysResponse.status}, Response: ${errorText}`);
        throw new Error(`Failed to retrieve project API keys: ${keysResponse.status}`);
      }
      const keysData = await keysResponse.json();
      console.log(`✅ Retrieved ${keysData.length} API keys`);
      const serviceRoleKey = keysData.find((k)=>k.name === 'service_role')?.api_key;
      if (!serviceRoleKey) {
        console.error('❌ Service role key not found in API keys response');
        throw new Error('Failed to retrieve service role key from project');
      }
      console.log('✅ Service role key retrieved successfully');
      const sourceClient = createClient(`https://${backupOp.source_project_id}.supabase.co`, serviceRoleKey);
      // Export data from all tables
      console.log('📊 Schema structure:', JSON.stringify(backupData.schema, null, 2).substring(0, 500));
      // Extract tables from schema - handle different possible structures
      let tables = [];
      if (backupData.schema?.tables && Array.isArray(backupData.schema.tables)) {
        tables = backupData.schema.tables;
      } else if (backupData.schema?.metadata?.tables && Array.isArray(backupData.schema.metadata.tables)) {
        tables = backupData.schema.metadata.tables;
      } else if (typeof backupData.schema === 'object') {
        // Try to find tables in any property that's an array
        for (const key of Object.keys(backupData.schema)){
          const value = backupData.schema[key];
          if (Array.isArray(value) && value.length > 0 && value[0]?.name) {
            tables = value;
            console.log(`✅ Found tables in schema.${key}`);
            break;
          }
        }
      }
      // Filter out any invalid table entries (undefined, null, or without names)
      tables = tables.filter((t)=>{
        const tableName = typeof t === 'string' ? t : t?.name;
        return tableName && tableName !== 'undefined' && tableName.trim() !== '';
      });
      console.log(`📋 Found ${tables.length} valid tables to export`);
      const dataExport = {};
      const totalTables = tables.length;
      const progressRange = PROGRESS_RANGES.data.end - PROGRESS_RANGES.data.start;
      // 🆕 Helper function to export table with pagination (prevents timeout/OOM on large tables)
      async function exportTableWithPagination(client, tableName) {
        const BATCH_SIZE = 1000; // Fetch 1000 rows at a time
        let offset = 0;
        let allData = [];
        let batchCount = 0;
        while(true){
          const { data, error, count } = await client.from(tableName).select('*', {
            count: 'exact'
          }).range(offset, offset + BATCH_SIZE - 1);
          if (error) {
            throw new Error(`Failed to fetch data from ${tableName}: ${error.message}`);
          }
          if (!data || data.length === 0) {
            break;
          }
          allData.push(...data);
          batchCount++;
          offset += BATCH_SIZE;
          // Log progress for large tables
          if (batchCount % 5 === 0 || allData.length >= 10000) {
            console.log(`    📊 Fetched ${allData.length} rows from ${tableName}... (batch ${batchCount})`);
          }
          // If we got less than BATCH_SIZE, we're done
          if (data.length < BATCH_SIZE) {
            break;
          }
          // Safety limit: stop at 1 million rows (prevent infinite loops)
          if (allData.length >= 1000000) {
            console.warn(`    ⚠️ Reached 1M row limit for ${tableName}. Stopping pagination.`);
            break;
          }
        }
        return allData;
      }
      for(let i = 0; i < tables.length; i++){
        const table = tables[i];
        const tableName = typeof table === 'string' ? table : table.name;
        // Double-check table name is valid before attempting export
        if (!tableName || tableName === 'undefined' || tableName.trim() === '') {
          console.warn(`  ⚠️ Skipping invalid table at index ${i}`);
          continue;
        }
        console.log(`  📄 Exporting table ${i + 1}/${totalTables}: ${tableName}`);
        try {
          // 🆕 Use pagination for all tables (handles large tables safely)
          const tableData = await exportTableWithPagination(sourceClient, tableName);
          console.log(`  ✅ Exported ${tableData.length} rows from ${tableName}`);
          dataExport[tableName] = tableData;
          // 🆕 Warn if table is very large
          if (tableData.length > 100000) {
            console.warn(`  ⚠️ Large table detected: ${tableName} has ${tableData.length} rows`);
          }
        } catch (error) {
          console.error(`  ❌ Exception exporting ${tableName}:`, error);
          dataExport[tableName] = {
            _export_error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
        // Update progress after each table
        const tableProgress = PROGRESS_RANGES.data.start + Math.floor((i + 1) / totalTables * progressRange);
        await supabase.from('backup_operations').update({
          progress_percentage: tableProgress
        }).eq('id', backupOperationId);
      }
      backupData.data = dataExport;
      console.log(`✅ Data export completed. Total tables: ${Object.keys(dataExport).length}`);
      await supabase.from('backup_operations').update({
        progress_percentage: PROGRESS_RANGES.data.end
      }).eq('id', backupOperationId);
    }
    // Export storage buckets
    if (components.includes('storage')) {
      console.log('🗄️ Exporting storage...');
      await supabase.from('backup_operations').update({
        progress_percentage: PROGRESS_RANGES.storage.start
      }).eq('id', backupOperationId);
      try {
        const storageResponse = await supabase.functions.invoke('inspect-storage', {
          body: {
            projectId: backupOp.source_project_id
          },
          headers: {
            Authorization: authHeader
          }
        });
        console.log('Storage response status:', storageResponse.error ? 'error' : 'success');
        if (storageResponse.error) {
          console.error('❌ Storage export error:', storageResponse.error);
          backupData.storage = {
            error: storageResponse.error.message
          };
        } else if (storageResponse.data) {
          console.log('✅ Storage exported successfully');
          backupData.storage = storageResponse.data;
        }
        await supabase.from('backup_operations').update({
          progress_percentage: PROGRESS_RANGES.storage.end
        }).eq('id', backupOperationId);
      } catch (error) {
        console.error('❌ Failed to export storage:', error);
        backupData.storage = {
          error: error instanceof Error ? error.message : 'Failed to export storage'
        };
      }
    }
    // Export edge functions
    if (components.includes('functions')) {
      console.log('⚡ Exporting edge functions...');
      await supabase.from('backup_operations').update({
        progress_percentage: PROGRESS_RANGES.functions.start
      }).eq('id', backupOperationId);
      try {
        const functionsResponse = await supabase.functions.invoke('inspect-functions', {
          body: {
            projectId: backupOp.source_project_id
          },
          headers: {
            Authorization: authHeader
          }
        });
        console.log('Functions response status:', functionsResponse.error ? 'error' : 'success');
        if (functionsResponse.error) {
          console.error('❌ Functions export error:', functionsResponse.error);
          backupData.functions = {
            error: functionsResponse.error.message
          };
        } else if (functionsResponse.data) {
          console.log('✅ Functions exported successfully');
          backupData.functions = functionsResponse.data;
        }
        await supabase.from('backup_operations').update({
          progress_percentage: PROGRESS_RANGES.functions.end
        }).eq('id', backupOperationId);
      } catch (error) {
        console.error('❌ Failed to export functions:', error);
        backupData.functions = {
          error: error instanceof Error ? error.message : 'Failed to export functions'
        };
      }
    }
    // Export auth configuration
    console.log('🔐 Exporting auth configuration...');
    await supabase.from('backup_operations').update({
      progress_percentage: PROGRESS_RANGES.auth.start
    }).eq('id', backupOperationId);
    try {
      const authResponse = await supabase.functions.invoke('inspect-auth-config', {
        body: {
          projectId: backupOp.source_project_id
        },
        headers: {
          Authorization: authHeader
        }
      });
      if (authResponse.error) {
        console.error('❌ Auth config export error:', authResponse.error);
        backupData.authConfig = {
          error: authResponse.error.message
        };
      } else if (authResponse.data) {
        console.log('✅ Auth config exported successfully');
        backupData.authConfig = authResponse.data;
      }
      await supabase.from('backup_operations').update({
        progress_percentage: PROGRESS_RANGES.auth.end
      }).eq('id', backupOperationId);
    } catch (error) {
      console.error('❌ Failed to export auth config:', error);
      backupData.authConfig = {
        error: error instanceof Error ? error.message : 'Failed to export auth config'
      };
    }
    // Export project configuration
    console.log('⚙️ Exporting project configuration...');
    await supabase.from('backup_operations').update({
      progress_percentage: PROGRESS_RANGES.projectConfig.start
    }).eq('id', backupOperationId);
    try {
      const configResponse = await supabase.functions.invoke('inspect-project-config', {
        body: {
          projectId: backupOp.source_project_id
        },
        headers: {
          Authorization: authHeader
        }
      });
      if (configResponse.error) {
        console.error('❌ Project config export error:', configResponse.error);
        backupData.projectConfig = {
          error: configResponse.error.message
        };
      } else if (configResponse.data) {
        console.log('✅ Project config exported successfully');
        backupData.projectConfig = configResponse.data;
      }
      await supabase.from('backup_operations').update({
        progress_percentage: PROGRESS_RANGES.projectConfig.end
      }).eq('id', backupOperationId);
    } catch (error) {
      console.error('❌ Failed to export project config:', error);
      backupData.projectConfig = {
        error: error instanceof Error ? error.message : 'Failed to export project config'
      };
    }
    // Extract enhanced database components from schema
    if (backupData.schema) {
      backupData.triggers = backupData.schema.triggers || [];
      backupData.customTypes = backupData.schema.customTypes || [];
      backupData.extensions = backupData.schema.extensions || [];
      console.log(`📊 Enhanced schema: ${backupData.triggers?.length || 0} triggers, ${backupData.customTypes?.length || 0} types, ${backupData.extensions?.length || 0} extensions`);
    }
    // Create backup file
    console.log('📦 Creating comprehensive backup package...');
    console.log('📊 Complete Backup Summary:');
    console.log(`  - Schema: ${backupData.schema ? 'included' : 'not included'}`);
    console.log(`  - Data: ${backupData.data ? Object.keys(backupData.data).length + ' tables' : 'not included'}`);
    console.log(`  - Storage: ${backupData.storage ? 'included' : 'not included'}`);
    console.log(`  - Functions: ${backupData.functions ? 'included' : 'not included'}`);
    console.log(`  - Auth Config: ${backupData.authConfig ? 'included' : 'not included'}`);
    console.log(`  - Project Config: ${backupData.projectConfig ? 'included' : 'not included'}`);
    console.log(`  - Triggers: ${backupData.triggers?.length || 0}`);
    console.log(`  - Custom Types: ${backupData.customTypes?.length || 0}`);
    console.log(`  - Extensions: ${backupData.extensions?.length || 0}`);
    const backupJson = JSON.stringify(backupData, null, 2);
    const backupBlob = new TextEncoder().encode(backupJson);
    const backupSizeMB = backupBlob.length / 1024 / 1024;
    console.log(`📦 Backup size: ${backupSizeMB.toFixed(2)} MB`);
    // 🆕 Validate backup size and warn about potential issues
    const warnings = [];
    if (backupSizeMB > 5) {
      console.warn(`⚠️ Large backup (${backupSizeMB.toFixed(2)} MB). May take longer to upload/download.`);
      warnings.push(`Large backup size: ${backupSizeMB.toFixed(2)} MB`);
    }
    if (backupSizeMB > 50) {
      console.warn(`⚠️ Very large backup (${backupSizeMB.toFixed(2)} MB). May hit storage limits on free tier.`);
      warnings.push(`Very large backup: ${backupSizeMB.toFixed(2)} MB - may hit storage limits`);
    }
    if (backupSizeMB > 500) {
      throw new Error(`Backup too large (${backupSizeMB.toFixed(2)} MB). Maximum supported size is 500MB. Consider excluding data or large tables.`);
    }
    // 🆕 Validate backup structure before upload
    const missingComponents = [];
    if (!backupData.schema) missingComponents.push('schema');
    if (!backupData.version) missingComponents.push('version');
    if (!backupData.timestamp) missingComponents.push('timestamp');
    if (missingComponents.length > 0) {
      console.warn(`⚠️ Backup is missing components: ${missingComponents.join(', ')}`);
      warnings.push(`Missing components: ${missingComponents.join(', ')}`);
    }
    // Log warnings to backup operation
    if (warnings.length > 0) {
      await supabase.from('backup_operations').update({
        warnings: warnings,
        updated_at: new Date().toISOString()
      }).eq('id', backupOperationId);
    }
    // Upload to storage
    const fileName = `${backupOp.user_id}/backup_${backupOperationId}_${Date.now()}.json`;
    console.log(`📤 Uploading backup to storage: ${fileName}`);
    const { error: uploadError } = await supabase.storage.from('backups').upload(fileName, backupBlob, {
      contentType: 'application/json',
      upsert: false
    });
    if (uploadError) {
      console.error(`❌ Upload failed:`, uploadError);
      throw new Error(`Failed to upload backup: ${uploadError.message}`);
    }
    console.log(`✅ Backup uploaded successfully (${backupSizeMB.toFixed(2)} MB)`);
    // Calculate comprehensive statistics for backup report
    const backupReport = {
      version: backupData.version,
      timestamp: backupData.timestamp,
      captureVersion: backupData.captureVersion,
      database: {
        tables: 0,
        columns: 0,
        rows: 0,
        policies: 0,
        functions: 0,
        triggers: 0,
        views: 0,
        materializedViews: 0,
        sequences: 0,
        checkConstraints: 0,
        uniqueConstraints: 0,
        customTypes: 0,
        extensions: 0,
        tableDetails: []
      },
      storage: {
        buckets: 0,
        objects: 0,
        policies: 0,
        totalSize: 0,
        bucketDetails: []
      },
      edgeFunctions: {
        count: 0,
        functions: []
      },
      auth: {
        providers: 0,
        providerList: []
      },
      projectConfig: {
        present: !!backupData.projectConfig
      }
    };
    // Parse schema data
    if (backupData.schema && !backupData.schema.error) {
      const schema = backupData.schema;
      // Count tables and columns
      if (schema.tables && Array.isArray(schema.tables)) {
        backupReport.database.tables = schema.tables.length;
        backupReport.database.columns = schema.tables.reduce((sum, table)=>{
          return sum + (table.columns?.length || 0);
        }, 0);
        backupReport.database.tableDetails = schema.tables.map((table)=>({
            name: table.name,
            columns: table.columns?.length || 0
          }));
      } else if (schema.metadata?.tables) {
        backupReport.database.tables = schema.metadata.tables.length;
        backupReport.database.columns = schema.metadata.tables.reduce((sum, table)=>{
          return sum + (table.columns?.length || 0);
        }, 0);
      }
      // Count policies
      if (schema.policies && Array.isArray(schema.policies)) {
        backupReport.database.policies = schema.policies.length;
      }
      // Count functions
      if (schema.functions && Array.isArray(schema.functions)) {
        backupReport.database.functions = schema.functions.length;
      }
      // Count triggers
      if (backupData.triggers && Array.isArray(backupData.triggers)) {
        backupReport.database.triggers = backupData.triggers.length;
      }
      // Count custom types
      if (backupData.customTypes && Array.isArray(backupData.customTypes)) {
        backupReport.database.customTypes = backupData.customTypes.length;
      }
      // Count extensions
      if (backupData.extensions && Array.isArray(backupData.extensions)) {
        backupReport.database.extensions = backupData.extensions.length;
      }
      // Count views
      if (schema.views && Array.isArray(schema.views)) {
        backupReport.database.views = schema.views.length;
      }
      // 🆕 Count materialized views
      if (backupData.materializedViews && Array.isArray(backupData.materializedViews)) {
        backupReport.database.materializedViews = backupData.materializedViews.length;
      }
      // 🆕 Count sequences
      if (backupData.sequences && Array.isArray(backupData.sequences)) {
        backupReport.database.sequences = backupData.sequences.length;
      }
      // 🆕 Count CHECK constraints
      if (backupData.checkConstraints && Array.isArray(backupData.checkConstraints)) {
        backupReport.database.checkConstraints = backupData.checkConstraints.length;
      }
      // 🆕 Count UNIQUE constraints
      if (backupData.uniqueConstraints && Array.isArray(backupData.uniqueConstraints)) {
        backupReport.database.uniqueConstraints = backupData.uniqueConstraints.length;
      }
    }
    // Parse data export to count rows
    if (backupData.data) {
      backupReport.database.rows = Object.entries(backupData.data).reduce((sum, [tableName, tableData])=>{
        if (Array.isArray(tableData)) {
          const tableDetail = backupReport.database.tableDetails.find((t)=>t.name === tableName);
          if (tableDetail) {
            tableDetail.rows = tableData.length;
          }
          return sum + tableData.length;
        }
        return sum;
      }, 0);
    }
    // Parse storage data
    if (backupData.storage && !backupData.storage.error) {
      const storage = backupData.storage;
      if (storage.buckets && Array.isArray(storage.buckets)) {
        backupReport.storage.buckets = storage.buckets.length;
        // Count total objects from storage.objects array (the actual list of files)
        let totalObjects = 0;
        if (storage.objects && Array.isArray(storage.objects)) {
          totalObjects = storage.objects.length;
        }
        // Build bucket details with file counts
        backupReport.storage.bucketDetails = storage.buckets.map((bucket)=>{
          const bucketId = bucket.id || bucket.name;
          // Count objects in this bucket
          const bucketObjectCount = storage.objects ? storage.objects.filter((obj)=>obj.bucket_id === bucketId).length : bucket.file_count || 0;
          return {
            id: bucketId,
            name: bucket.name,
            public: bucket.public || false,
            fileCount: bucketObjectCount
          };
        });
        backupReport.storage.objects = totalObjects;
        console.log(`📊 Storage: ${storage.buckets.length} buckets, ${totalObjects} total objects`);
      }
      if (storage.policies && Array.isArray(storage.policies)) {
        backupReport.storage.policies = storage.policies.length;
      }
    }
    // Parse edge functions
    if (backupData.functions && !backupData.functions.error) {
      const functions = backupData.functions;
      if (functions.functions && Array.isArray(functions.functions)) {
        backupReport.edgeFunctions.count = functions.functions.length;
        backupReport.edgeFunctions.functions = functions.functions.map((fn)=>({
            slug: fn.slug,
            name: fn.name,
            status: fn.status,
            verifyJwt: fn.verify_jwt
          }));
      }
    }
    // Parse auth configuration
    if (backupData.authConfig && !backupData.authConfig.error) {
      const auth = backupData.authConfig;
      if (auth.providers && Array.isArray(auth.providers)) {
        backupReport.auth.providers = auth.providers.length;
        backupReport.auth.providerList = auth.providers;
      } else if (auth.external_providers) {
        const enabledProviders = Object.entries(auth.external_providers).filter(([_, enabled])=>enabled === true).map(([provider])=>provider);
        backupReport.auth.providers = enabledProviders.length;
        backupReport.auth.providerList = enabledProviders;
      }
    }
    // Update backup operation as completed with comprehensive report
    await supabase.from('backup_operations').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress_percentage: 100,
      file_path: fileName,
      file_size: backupBlob.length,
      backup_metadata: backupReport
    }).eq('id', backupOperationId);
    console.log(`✅ Backup completed: ${fileName}`);
    return new Response(JSON.stringify({
      success: true,
      backupOperationId,
      filePath: fileName
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Error in export-project-snapshot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    // Update backup operation as failed using stored backupOperationId
    if (backupOperationId) {
      try {
        const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
        await supabase.from('backup_operations').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_logs: [
            {
              timestamp: new Date().toISOString(),
              message: errorMessage,
              phase: 'export'
            }
          ]
        }).eq('id', backupOperationId);
      } catch (updateError) {
        console.error('❌ Failed to update backup operation status:', updateError);
      }
    }
    return new Response(JSON.stringify({
      error: errorMessage
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
