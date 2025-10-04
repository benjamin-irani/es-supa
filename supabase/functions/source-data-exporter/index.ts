import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const { tables, targetUrl } = await req.json();
    // Use environment variables for source project credentials
    const sourceUrl = Deno.env.get('SUPABASE_URL');
    const sourceServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!sourceUrl || !sourceServiceKey) {
      throw new Error('Source URL and service key are required');
    }
    console.log(`🔄 Starting secure data extraction from source project...`);
    // Create Supabase client with service role privileges
    const sourceSupabase = createClient(sourceUrl, sourceServiceKey, {
      auth: {
        persistSession: false
      }
    });
    let totalRecords = 0;
    let extractedTables = 0;
    const recordCounts = {};
    let migrationSql = `-- =============================================================================
-- PRODUCTION DATA MIGRATION - EXTRACTED FROM SOURCE PROJECT
-- Generated on: ${new Date().toISOString()}
-- Target: ${targetUrl}
-- =============================================================================

`;
    // Get all tables from the source database if not specified
    const tablesToExtract = tables || await getAllTables(sourceSupabase);
    console.log(`📊 Found ${tablesToExtract.length} tables to extract data from`);
    console.log(`📋 Tables to process: ${tablesToExtract.join(', ')}`);
    // Extract data from each table with dependency ordering
    const orderedTables = orderTablesByDependencies(tablesToExtract);
    console.log(`🔄 Processing tables in dependency order: ${orderedTables.join(', ')}`);
    for (const tableName of orderedTables){
      try {
        console.log(`📊 Extracting data from ${tableName}...`);
        // Skip sensitive tables that should never be extracted
        if ([
          'payments',
          'security_audit_log',
          'security_sessions'
        ].includes(tableName)) {
          console.log(`🔒 Skipping sensitive table: ${tableName}`);
          continue;
        }
        const { data, error } = await sourceSupabase.from(tableName).select('*');
        if (error) {
          console.warn(`⚠️ Could not extract ${tableName}: ${error.message}`);
          continue;
        }
        if (!data || data.length === 0) {
          console.log(`📭 No data found in ${tableName}`);
          continue;
        }
        console.log(`✅ Extracted ${data.length} records from ${tableName}`);
        // Generate INSERT statements with conflict resolution
        const insertSql = generateInsertStatements(tableName, data);
        migrationSql += insertSql + '\n\n';
        totalRecords += data.length;
        extractedTables++;
        recordCounts[tableName] = data.length;
      } catch (error) {
        console.warn(`⚠️ Error extracting ${tableName}: ${error.message}`);
        continue;
      }
    }
    // Add sequence updates with existence checks
    migrationSql += generateSequenceUpdates(Object.keys(recordCounts));
    console.log(`✅ Extracted production data: ${totalRecords} records from ${extractedTables} tables`);
    const result = {
      success: true,
      totalRecords,
      tableCount: extractedTables,
      recordCounts,
      migrationSql,
      extractionDetails: {
        extractedAt: new Date().toISOString(),
        sourceProject: extractProjectId(sourceUrl),
        targetProject: extractProjectId(targetUrl),
        tablesProcessed: orderedTables.length,
        tablesWithData: extractedTables
      }
    };
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in source-data-exporter:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      migrationSql: null
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
async function getAllTables(supabase) {
  try {
    // Use RPC call to get table names securely
    const { data, error } = await supabase.rpc('get_public_tables');
    if (error) {
      console.warn('Could not fetch table list via RPC, using predefined tables:', error.message);
      return getPredefinedTables();
    }
    const tableNames = data?.map((row)=>row.table_name) || [];
    console.log(`📋 Found ${tableNames.length} tables via RPC:`, tableNames);
    return tableNames.length > 0 ? tableNames : getPredefinedTables();
  } catch (err) {
    console.warn('RPC call failed, using predefined tables:', err);
    return getPredefinedTables();
  }
}
function getPredefinedTables() {
  // Safe public content tables (excluding sensitive tables like payments, security_audit_log)
  return [
    'site_settings',
    'site_categories',
    'site_pages',
    'site_menu_items',
    'site_post_categories',
    'articles',
    'resources',
    'documents',
    'document_versions',
    'document_links',
    'policy_documents',
    'publications',
    'sectors',
    'countries',
    'projects',
    'project_milestones',
    'project_documents',
    'project_partners',
    'project_outcomes',
    'stakeholders',
    'team_members',
    'events',
    'news_articles',
    'job_postings',
    'investment_opportunities',
    'opportunity_documents',
    'e_service_portals',
    'support_departments',
    'support_tickets',
    'contact_submissions',
    'services',
    'project_types',
    'project_province_locations',
    'clients'
  ];
}
function orderTablesByDependencies(tables) {
  // Basic dependency ordering - independent tables first
  const independentTables = [
    'site_settings',
    'site_categories',
    'sectors',
    'countries'
  ];
  const dependentTables = tables.filter((t)=>!independentTables.includes(t));
  return [
    ...independentTables.filter((t)=>tables.includes(t)),
    ...dependentTables
  ];
}
function generateInsertStatements(tableName, data) {
  if (!data || data.length === 0) return '';
  const columns = Object.keys(data[0]);
  let sql = `-- Inserting ${data.length} records into ${tableName}\n`;
  // Generate batch INSERT statements
  const batchSize = 100;
  for(let i = 0; i < data.length; i += batchSize){
    const batch = data.slice(i, i + batchSize);
    sql += `INSERT INTO public.${tableName} (${columns.map((c)=>`"${c}"`).join(', ')})\nVALUES\n`;
    const values = batch.map((row)=>{
      const rowValues = columns.map((col)=>{
        const value = row[col];
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (Array.isArray(value)) return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        return value.toString();
      });
      return `  (${rowValues.join(', ')})`;
    }).join(',\n');
    sql += values;
    sql += `\nON CONFLICT (id) DO UPDATE SET\n`;
    sql += columns.filter((c)=>c !== 'id').map((c)=>`  "${c}" = EXCLUDED."${c}"`).join(',\n');
    sql += ';\n\n';
  }
  return sql;
}
function generateSequenceUpdates(tableNames) {
  let sql = `-- Update sequences for tables with data\n`;
  for (const tableName of tableNames){
    sql += `-- Guarded sequence update for ${tableName}\n`;
    sql += `DO $$\nBEGIN\n`;
    sql += `  -- Check if table exists and has an id column with a sequence\n`;
    sql += `  IF to_regclass('public.${tableName}') IS NOT NULL AND \n`;
    sql += `     pg_get_serial_sequence('public.${tableName}', 'id') IS NOT NULL THEN\n`;
    sql += `    BEGIN\n`;
    sql += `      PERFORM setval(pg_get_serial_sequence('public.${tableName}', 'id'), \n`;
    sql += `                     COALESCE((SELECT MAX(id) FROM public.${tableName}), 1), true);\n`;
    sql += `      RAISE NOTICE 'Updated sequence for table: %', '${tableName}';\n`;
    sql += `    EXCEPTION WHEN OTHERS THEN\n`;
    sql += `      RAISE NOTICE 'Failed to update sequence for table %: %', '${tableName}', SQLERRM;\n`;
    sql += `    END;\n`;
    sql += `  ELSE\n`;
    sql += `    RAISE NOTICE 'Skipping sequence update for table % (table or sequence not found)', '${tableName}';\n`;
    sql += `  END IF;\n`;
    sql += `END $$;\n\n`;
  }
  return sql;
}
function extractProjectId(url) {
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : 'unknown';
}
