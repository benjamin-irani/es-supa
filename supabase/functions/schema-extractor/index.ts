import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const body = await req.json();
    const { sourceProject, extractFromCurrent = false } = body;
    let supabase;
    let projectId;
    if (extractFromCurrent || !sourceProject) {
      // Extract from current project
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      supabase = createClient(supabaseUrl, supabaseKey);
      projectId = supabaseUrl.match(/https:\/\/([a-zA-Z0-9]+)\.supabase\.co/)?.[1] || 'current';
    } else {
      // Extract from external source project
      const key = sourceProject.serviceKey || sourceProject.anonKey;
      supabase = createClient(sourceProject.projectUrl, key);
      projectId = sourceProject.projectId;
    }
    console.log(`🔍 Starting schema extraction for project: ${projectId}`);
    const result = {
      success: false,
      projectId,
      totalTables: 0,
      schemas: {},
      systemSchemas: [
        'public',
        'auth',
        'storage',
        'realtime',
        'graphql_public',
        'vault'
      ],
      errors: []
    };
    // List of schemas to extract from
    const schemasToExtract = [
      'public',
      'auth',
      'storage',
      'realtime',
      'graphql_public'
    ];
    for (const schemaName of schemasToExtract){
      try {
        console.log(`📊 Extracting schema: ${schemaName}`);
        // Use information_schema query for better compatibility
        const { data: tables, error } = await supabase.from('information_schema.tables').select('table_name, table_schema, table_type').eq('table_schema', schemaName).in('table_type', [
          'BASE TABLE',
          'VIEW'
        ]);
        if (error) {
          console.error(`Error extracting ${schemaName}:`, error);
          result.errors?.push(`Failed to extract ${schemaName}: ${error.message}`);
          continue;
        }
        if (tables && Array.isArray(tables)) {
          const parsedTables = [];
          for (const table of tables){
            // Get row count estimate
            let rowCount = 0;
            try {
              const { count } = await supabase.from(table.table_name).select('*', {
                count: 'exact',
                head: true
              });
              rowCount = count || 0;
            } catch (countError) {
              console.warn(`Could not get row count for ${table.table_name}:`, countError);
            }
            parsedTables.push({
              table_name: table.table_name,
              schema_name: table.table_schema,
              table_type: table.table_type,
              row_count: rowCount
            });
          }
          result.schemas[schemaName] = {
            tableCount: parsedTables.length,
            tables: parsedTables
          };
          result.totalTables += parsedTables.length;
          console.log(`✅ ${schemaName}: Found ${parsedTables.length} tables`);
        } else {
          result.schemas[schemaName] = {
            tableCount: 0,
            tables: []
          };
          console.log(`⚠️ ${schemaName}: No tables found or invalid response`);
        }
      } catch (schemaError) {
        console.error(`Schema extraction error for ${schemaName}:`, schemaError);
        result.errors?.push(`Schema ${schemaName}: ${schemaError.message}`);
        result.schemas[schemaName] = {
          tableCount: 0,
          tables: []
        };
      }
    }
    result.success = result.totalTables > 0;
    console.log(`🎉 Extraction complete: ${result.totalTables} tables across ${Object.keys(result.schemas).length} schemas`);
    // Add version and metadata
    const enhancedResult = {
      ...result,
      version: 'current',
      extractedAt: new Date().toISOString(),
      summary: {
        totalTables: result.totalTables,
        schemasAnalyzed: Object.keys(result.schemas).length,
        errors: result.errors?.length || 0
      }
    };
    return new Response(JSON.stringify(enhancedResult), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Schema extraction error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
