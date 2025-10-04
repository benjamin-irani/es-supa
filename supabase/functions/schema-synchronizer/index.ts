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
    const { sourceProjectUrl, sourceProjectKey, targetProjectUrl, targetProjectKey, dryRun = false } = await req.json();
    console.log(`🔧 Starting schema sync from ${sourceProjectUrl} to ${targetProjectUrl}`);
    console.log(`📋 Dry run: ${dryRun}`);
    // Create clients
    const sourceClient = createClient(sourceProjectUrl, sourceProjectKey);
    const targetClient = createClient(targetProjectUrl, targetProjectKey);
    const result = {
      success: false,
      differences: [],
      appliedChanges: [],
      errors: [],
      summary: {
        tablesCreated: 0,
        columnsAdded: 0,
        totalDifferences: 0
      }
    };
    // Get schema information from both projects
    const sourceSchema = await getSchemaInfo(sourceClient, 'source');
    const targetSchema = await getSchemaInfo(targetClient, 'target');
    console.log(`📊 Source has ${sourceSchema.tables.length} tables, target has ${targetSchema.tables.length} tables`);
    // Compare schemas and find differences
    for (const sourceTable of sourceSchema.tables){
      const targetTable = targetSchema.tables.find((t)=>t.table_name === sourceTable.table_name);
      if (!targetTable) {
        // Table missing in target
        const createSql = await generateCreateTableSql(sourceClient, sourceTable.table_name);
        result.differences.push({
          type: 'missing_table',
          tableName: sourceTable.table_name,
          createSql
        });
      } else {
        // Check for missing columns
        const sourceColumns = await getTableColumns(sourceClient, sourceTable.table_name);
        const targetColumns = await getTableColumns(targetClient, targetTable.table_name);
        for (const sourceCol of sourceColumns){
          const targetCol = targetColumns.find((c)=>c.column_name === sourceCol.column_name);
          if (!targetCol) {
            const alterSql = `ALTER TABLE ${sourceTable.table_name} ADD COLUMN IF NOT EXISTS ${sourceCol.column_name} ${sourceCol.data_type}${sourceCol.is_nullable === 'NO' ? ' NOT NULL' : ''}${sourceCol.column_default ? ` DEFAULT ${sourceCol.column_default}` : ''}`;
            result.differences.push({
              type: 'missing_column',
              tableName: sourceTable.table_name,
              columnName: sourceCol.column_name,
              createSql: alterSql
            });
          }
        }
      }
    }
    result.summary.totalDifferences = result.differences.length;
    console.log(`🔍 Found ${result.differences.length} schema differences`);
    // Apply changes if not dry run
    if (!dryRun && result.differences.length > 0) {
      console.log(`🚀 Applying ${result.differences.length} schema changes...`);
      for (const diff of result.differences){
        if (diff.createSql) {
          try {
            // Use direct SQL execution for schema changes
            const { error } = await targetClient.rpc('execute_sql', {
              query: diff.createSql
            });
            if (error) {
              console.error(`❌ Failed to apply change: ${diff.createSql}`, error);
              result.errors.push(`Failed to ${diff.type} for ${diff.tableName}: ${error.message}`);
            } else {
              console.log(`✅ Applied: ${diff.type} for ${diff.tableName}`);
              result.appliedChanges.push(diff.createSql);
              if (diff.type === 'missing_table') {
                result.summary.tablesCreated++;
              } else if (diff.type === 'missing_column') {
                result.summary.columnsAdded++;
              }
            }
          } catch (err) {
            console.error(`❌ Exception applying change: ${diff.createSql}`, err);
            result.errors.push(`Exception for ${diff.tableName}: ${err.message}`);
          }
        }
      }
    }
    result.success = result.errors.length === 0;
    console.log(`🎉 Schema sync complete. Applied ${result.appliedChanges.length} changes, ${result.errors.length} errors`);
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Schema sync error:', error);
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
async function getSchemaInfo(client, label) {
  console.log(`📋 Getting schema info for ${label}`);
  const { data: tables, error } = await client.from('information_schema.tables').select('table_name, table_schema').eq('table_schema', 'public').eq('table_type', 'BASE TABLE');
  if (error) {
    throw new Error(`Failed to get ${label} schema: ${error.message}`);
  }
  return {
    tables: tables || []
  };
}
async function getTableColumns(client, tableName) {
  const { data: columns, error } = await client.from('information_schema.columns').select('column_name, data_type, is_nullable, column_default').eq('table_schema', 'public').eq('table_name', tableName).order('ordinal_position');
  if (error) {
    console.warn(`Could not get columns for ${tableName}:`, error);
    return [];
  }
  return columns || [];
}
async function generateCreateTableSql(client, tableName) {
  try {
    // Get columns
    const columns = await getTableColumns(client, tableName);
    if (columns.length === 0) {
      return `-- Could not generate CREATE TABLE for ${tableName}: no columns found`;
    }
    const columnDefs = columns.map((col)=>{
      let def = `${col.column_name} ${col.data_type}`;
      if (col.is_nullable === 'NO') def += ' NOT NULL';
      if (col.column_default) def += ` DEFAULT ${col.column_default}`;
      return def;
    }).join(',\n  ');
    return `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${columnDefs}\n);`;
  } catch (err) {
    return `-- Could not generate CREATE TABLE for ${tableName}: ${err.message}`;
  }
}
