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
    const { tables, targetUrl, validateTargetSchema = false, targetKey } = await req.json();
    console.log(`🚀 Starting enhanced data export for ${tables?.length || 'all'} tables to ${extractProjectId(targetUrl || 'unknown')}`);
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    // Initialize target client for schema validation if requested
    let targetClient = null;
    if (validateTargetSchema && targetUrl) {
      try {
        const resolvedTargetKey = targetKey || Deno.env.get('SUPABASE_ANON_KEY');
        targetClient = createClient(targetUrl, resolvedTargetKey);
        console.log(`🔍 Target schema validation enabled`);
      } catch (err) {
        console.warn(`⚠️ Could not initialize target client for validation:`, err);
      }
    }
    let tablesToProcess = tables || await getAllTables(supabase);
    // Order tables to respect dependencies (independent tables first)
    tablesToProcess = orderTablesByDependencies(tablesToProcess);
    console.log(`📊 Processing ${tablesToProcess.length} tables in dependency order`);
    let migrationSql = '-- Enhanced Data Migration SQL Generated at ' + new Date().toISOString() + '\n\n';
    let totalRecords = 0;
    let processedTables = 0;
    const skippedTables = [];
    const failedTables = [];
    const recordCounts = {};
    // Sensitive tables to exclude from data extraction
    const sensitiveExclusions = [
      'payments',
      'security_audit_log',
      'security_sessions'
    ];
    // Validate target schema if requested
    const targetSchemaInfo = targetClient ? await getTargetSchemaInfo(targetClient) : null;
    for (const tableName of tablesToProcess){
      // Skip sensitive tables completely
      if (sensitiveExclusions.includes(tableName)) {
        console.log(`🔒 Skipping sensitive table: ${tableName}`);
        skippedTables.push(tableName);
        continue;
      }
      // Skip tables that don't exist in target (if validation enabled)
      if (targetSchemaInfo && !targetSchemaInfo.tables.includes(tableName)) {
        console.log(`⚠️ Skipping ${tableName}: not found in target schema`);
        skippedTables.push(tableName);
        migrationSql += `-- Skipped ${tableName}: table not found in target schema\n\n`;
        continue;
      }
      try {
        console.log(`📊 Extracting data from ${tableName}...`);
        const { data, error } = await supabase.from(tableName).select('*').limit(10000);
        if (error) {
          console.error(`❌ Error extracting ${tableName}:`, error);
          failedTables.push(tableName);
          migrationSql += `-- Error extracting ${tableName}: ${error.message}\n\n`;
          continue;
        }
        if (!data || data.length === 0) {
          console.log(`📭 No data found in ${tableName}`);
          recordCounts[tableName] = 0;
          migrationSql += `-- No data found in ${tableName}\n\n`;
          continue;
        }
        console.log(`✅ Extracted ${data.length} records from ${tableName}`);
        recordCounts[tableName] = data.length;
        // Generate column-intersected INSERT statements if target schema provided
        const insertStatements = targetSchemaInfo ? generateSafeInsertStatements(tableName, data, targetSchemaInfo.columnsByTable[tableName] || [], targetSchemaInfo.arrayColumnsByTable[tableName] || new Set()) : generateInsertStatements(tableName, data);
        migrationSql += insertStatements + '\n\n';
        totalRecords += data.length;
        processedTables++;
      } catch (tableError) {
        console.error(`❌ Exception processing ${tableName}:`, tableError);
        failedTables.push(tableName);
        migrationSql += `-- Exception processing ${tableName}: ${tableError.message}\n\n`;
      }
    }
    console.log(`✅ Enhanced data extraction complete: ${totalRecords} records from ${processedTables} tables`);
    console.log(`⚠️ Skipped ${skippedTables.length} tables, ${failedTables.length} failed`);
    // Generate sequence updates for tables that have data
    const processedTableNames = tablesToProcess.filter((t)=>!sensitiveExclusions.includes(t) && !skippedTables.includes(t) && !failedTables.includes(t));
    migrationSql += generateSequenceUpdates(processedTableNames);
    const result = {
      success: true,
      migrationSql,
      totalRecords,
      processedTables,
      skippedTables,
      failedTables,
      recordCounts,
      extractionSummary: {
        tablesProcessed: processedTables,
        tablesSkipped: skippedTables.length,
        tablesFailed: failedTables.length,
        totalRecords,
        timestamp: new Date().toISOString(),
        projectId: extractProjectId(targetUrl || ''),
        targetSchemaValidated: !!targetSchemaInfo,
        sensitiveTablesExcluded: sensitiveExclusions.length
      }
    };
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Enhanced data export error:', error);
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
async function getAllTables(supabase) {
  try {
    const { data, error } = await supabase.rpc('get_public_tables');
    if (error || !data) {
      console.warn('Using predefined table list as fallback');
      return getPredefinedTables();
    }
    return data.map((row)=>row.table_name);
  } catch (err) {
    console.warn('Exception getting tables, using predefined list:', err);
    return getPredefinedTables();
  }
}
function getPredefinedTables() {
  return [
    'site_pages',
    'site_posts',
    'site_post_categories',
    'site_menus',
    'site_menu_items',
    'articles',
    'countries',
    'provinces',
    'sectors',
    'team_members',
    'stakeholders',
    'stakeholder_types',
    'projects',
    'project_types',
    'project_partners',
    'project_outcomes',
    'project_objectives',
    'project_province_locations',
    'project_registry',
    'project_sections',
    'publications',
    'publication_types',
    'publication_categories',
    'resources',
    'resource_types',
    'services',
    'support_departments',
    'support_categories',
    'user_roles',
    'schema_versions',
    'events',
    'documents',
    'products',
    'job_postings',
    'news_articles',
    'news_article_types',
    'policy_documents',
    'e_service_portals',
    'investment_opportunities',
    'clients'
  ];
}
function orderTablesByDependencies(tables) {
  const dependencies = {
    'site_post_categories': [
      'site_posts',
      'site_categories'
    ],
    'project_partners': [
      'projects',
      'stakeholders'
    ],
    'project_outcomes': [
      'projects'
    ],
    'project_objectives': [
      'projects'
    ],
    'project_province_locations': [
      'projects',
      'provinces'
    ],
    'publication_categories': [
      'publications',
      'site_categories'
    ],
    'user_roles': [
      'profiles'
    ]
  };
  const ordered = [];
  const remaining = [
    ...tables
  ];
  while(remaining.length > 0){
    const canProcess = remaining.filter((table)=>{
      const deps = dependencies[table] || [];
      return deps.every((dep)=>ordered.includes(dep) || !remaining.includes(dep));
    });
    if (canProcess.length === 0) {
      ordered.push(...remaining);
      break;
    }
    ordered.push(...canProcess);
    canProcess.forEach((table)=>{
      const index = remaining.indexOf(table);
      if (index > -1) remaining.splice(index, 1);
    });
  }
  return ordered;
}
function generateInsertStatements(tableName, data) {
  if (!data || data.length === 0) return `-- No data to insert for ${tableName}\n`;
  const columns = Object.keys(data[0]);
  const columnList = columns.join(', ');
  let insertSql = `-- Insert data into ${tableName}\n`;
  // Process in batches to avoid huge statements
  const batchSize = 100;
  for(let i = 0; i < data.length; i += batchSize){
    const batch = data.slice(i, i + batchSize);
    const values = batch.map((row)=>{
      const formattedValues = columns.map((col)=>{
        const value = row[col];
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        // Format arrays as PostgreSQL array literals (not JSON)
        if (Array.isArray(value)) return formatArrayValue(value);
        if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        return String(value);
      });
      return `(${formattedValues.join(', ')})`;
    }).join(',\n  ');
    insertSql += `INSERT INTO ${tableName} (${columnList}) VALUES\n  ${values}\nON CONFLICT (id) DO UPDATE SET\n`;
    insertSql += columns.filter((col)=>col !== 'id').map((col)=>`  ${col} = EXCLUDED.${col}`).join(',\n');
    insertSql += ';\n\n';
  }
  return insertSql;
}
function generateSafeInsertStatements(tableName, data, targetColumns, arrayColumns = new Set()) {
  if (!data || data.length === 0) return `-- No data to insert for ${tableName}\n`;
  // Intersect source data columns with target columns
  const sourceColumns = Object.keys(data[0]);
  const safeColumns = sourceColumns.filter((col)=>targetColumns.includes(col));
  if (safeColumns.length === 0) {
    return `-- No matching columns found for ${tableName} (source: ${sourceColumns.length}, target: ${targetColumns.length})\n`;
  }
  console.log(`🔄 ${tableName}: Using ${safeColumns.length}/${sourceColumns.length} columns that exist in target`);
  if (arrayColumns.size > 0) {
    console.log(`📊 ${tableName}: ${arrayColumns.size} array columns will use PostgreSQL array format`);
  }
  const columnList = safeColumns.join(', ');
  let insertSql = `-- Safe insert for ${tableName} (${safeColumns.length} matched columns)\n`;
  // Process in batches to avoid huge statements
  const batchSize = 100;
  for(let i = 0; i < data.length; i += batchSize){
    const batch = data.slice(i, i + batchSize);
    const values = batch.map((row)=>{
      const safeValues = safeColumns.map((col)=>{
        const value = row[col];
        if (value === null || value === undefined) return 'NULL';
        if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        // Use PostgreSQL array literal format for array columns
        if (Array.isArray(value)) {
          if (arrayColumns.has(col)) {
            return formatArrayValue(value);
          } else {
            // Non-array column with array value - treat as JSONB
            return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
          }
        }
        if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
        return String(value);
      });
      return `(${safeValues.join(', ')})`;
    }).join(',\n  ');
    insertSql += `INSERT INTO ${tableName} (${columnList}) VALUES\n  ${values}\nON CONFLICT (id) DO UPDATE SET\n`;
    insertSql += safeColumns.filter((col)=>col !== 'id').map((col)=>`  ${col} = EXCLUDED.${col}`).join(',\n');
    insertSql += ';\n\n';
  }
  return insertSql;
}
function generateSequenceUpdates(tableNames) {
  let sql = '-- Update sequences for tables with data\n';
  for (const tableName of tableNames){
    sql += `SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM ${tableName}), 1), false);\n`;
  }
  return sql + '\n';
}
function extractProjectId(url) {
  const match = url.match(/https:\/\/([a-zA-Z0-9]+)\.supabase\.co/);
  return match ? match[1] : 'unknown';
}
async function getTargetSchemaInfo(targetClient) {
  try {
    const { data: tables, error: tablesError } = await targetClient.from('information_schema.tables').select('table_name').eq('table_schema', 'public').eq('table_type', 'BASE TABLE');
    if (tablesError) {
      console.warn(`Could not get target schema info:`, tablesError);
      return null;
    }
    const tableNames = (tables || []).map((t)=>t.table_name);
    const columnsByTable = {};
    const arrayColumnsByTable = {};
    // Get columns and their data types for each table
    for (const tableName of tableNames){
      const { data: columns, error: colError } = await targetClient.from('information_schema.columns').select('column_name, data_type, udt_name').eq('table_schema', 'public').eq('table_name', tableName).order('ordinal_position');
      if (!colError && columns) {
        columnsByTable[tableName] = columns.map((c)=>c.column_name);
        // Identify array columns (data_type is 'ARRAY' or udt_name starts with '_')
        arrayColumnsByTable[tableName] = new Set(columns.filter((c)=>c.data_type === 'ARRAY' || c.udt_name?.startsWith('_')).map((c)=>c.column_name));
        if (arrayColumnsByTable[tableName].size > 0) {
          console.log(`🔍 ${tableName}: Found ${arrayColumnsByTable[tableName].size} array columns`);
        }
      }
    }
    return {
      tables: tableNames,
      columnsByTable,
      arrayColumnsByTable
    };
  } catch (err) {
    console.warn(`Exception getting target schema:`, err);
    return null;
  }
}
// Helper function to format array values as PostgreSQL array literals
function formatArrayValue(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return "'{}'"; // Empty PostgreSQL array
  }
  // Check if array contains numbers or booleans (no quotes needed)
  const isNumericArray = value.every((item)=>typeof item === 'number' || typeof item === 'boolean');
  if (isNumericArray) {
    // Numeric array: {1,2,3}
    return `'{${value.join(',')}}'`;
  }
  // Text/UUID array: {"item1","item2"} - escape quotes and backslashes
  const escapedItems = value.map((item)=>{
    if (item === null || item === undefined) return '';
    const str = String(item);
    // Escape backslashes first, then quotes
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  });
  return `'{"${escapedItems.join('","')}"}'`;
}
