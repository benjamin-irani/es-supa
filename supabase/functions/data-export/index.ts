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
    console.log('Enhanced data export function called');
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
    const { data: authCheck, error: authCheckError } = await userSupabase.rpc('authorize_data_export', {
      user_uuid: user.id
    });
    if (authCheckError || !authCheck) {
      return new Response(JSON.stringify({
        error: 'Data export requires admin privileges',
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
    // Get table dependencies dynamically
    console.log('Discovering database schema...');
    const { data: tableDependencies, error: schemaError } = await supabase.rpc('get_user_tables_with_dependencies');
    if (schemaError) {
      console.error('Error getting table dependencies:', schemaError);
      return new Response(JSON.stringify({
        error: 'Failed to analyze database schema',
        details: schemaError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const tables = tableDependencies;
    console.log(`Found ${tables.length} tables to export:`, tables.map((t)=>t.table_name));
    const exportData = {
      tables: {},
      schema: {
        dependencies: tables,
        version: '2.0',
        exportedAt: new Date().toISOString()
      },
      metadata: {
        exportedAt: new Date().toISOString(),
        totalRecords: 0,
        totalTables: tables.length,
        tableStats: {},
        schemaVersion: '2.0'
      }
    };
    // Export tables in dependency order to ensure referential integrity
    for (const tableInfo of tables){
      const tableName = tableInfo.table_name;
      try {
        console.log(`Exporting table: ${tableName} (level ${tableInfo.dependency_level})`);
        // Get all records from table, ordering by primary key for consistency
        const { data: records, error: selectError } = await supabase.from(tableName).select('*').order(tableInfo.primary_key, {
          ascending: true
        });
        if (selectError) {
          console.warn(`Error selecting from table ${tableName}:`, selectError);
          exportData.tables[tableName] = {
            error: selectError.message,
            records: [],
            primaryKey: tableInfo.primary_key,
            dependencies: tableInfo.dependencies,
            level: tableInfo.dependency_level
          };
          continue;
        }
        if (!records || records.length === 0) {
          console.log(`Table ${tableName} is empty`);
          exportData.tables[tableName] = {
            records: [],
            count: 0,
            primaryKey: tableInfo.primary_key,
            dependencies: tableInfo.dependencies,
            level: tableInfo.dependency_level
          };
          continue;
        }
        // Store records with metadata
        exportData.tables[tableName] = {
          records: records,
          count: records.length,
          primaryKey: tableInfo.primary_key,
          dependencies: tableInfo.dependencies,
          level: tableInfo.dependency_level,
          schema: {
            columns: records.length > 0 ? Object.keys(records[0]) : []
          }
        };
        exportData.metadata.tableStats[tableName] = {
          count: records.length,
          level: tableInfo.dependency_level,
          primaryKey: tableInfo.primary_key
        };
        exportData.metadata.totalRecords += records.length;
        console.log(`Exported ${records.length} records from table ${tableName}`);
      } catch (tableError) {
        console.error(`Error exporting table ${tableName}:`, tableError);
        exportData.tables[tableName] = {
          error: tableError instanceof Error ? tableError.message : 'Unknown error',
          records: [],
          primaryKey: tableInfo.primary_key,
          dependencies: tableInfo.dependencies,
          level: tableInfo.dependency_level
        };
      }
    }
    console.log('Enhanced data export completed:', {
      totalRecords: exportData.metadata.totalRecords,
      totalTables: exportData.metadata.totalTables,
      successfulTables: Object.keys(exportData.tables).filter((k)=>!exportData.tables[k].error).length
    });
    return new Response(JSON.stringify({
      success: true,
      data: exportData,
      message: `Exported ${exportData.metadata.totalRecords} records from ${exportData.metadata.totalTables} tables`,
      version: '2.0'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Enhanced data export error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred during data export',
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
