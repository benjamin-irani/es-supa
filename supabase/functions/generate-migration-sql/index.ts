import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
// Simple CORS headers - allow all origins
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, x-supabase-api-version, content-type',
  'Access-Control-Max-Age': '86400'
};
serve(async (req)=>{
  const origin = req.headers.get('origin');
  console.log(`[${req.method}] Request from origin: ${origin}`);
  // CORS ping endpoint for testing
  const url = new URL(req.url);
  if (url.searchParams.get('cors') === 'ping') {
    console.log('CORS ping request - returning test response');
    return new Response(JSON.stringify({
      ok: true,
      origin
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS preflight - returning 200 with CORS headers');
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { data: hasAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });
    if (!hasAdmin) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin access required'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Create authenticated client with user's JWT token
    const authenticatedSupabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    // Helper function for SELECT queries
    const q = async (sql)=>{
      const { data, error } = await authenticatedSupabase.rpc('query_sql', {
        sql
      });
      if (error) {
        console.error(`Query failed: ${sql}`, error);
        throw new Error(`Query failed: ${error.message}`);
      }
      return data || [];
    };
    const options = await req.json();
    const { includeSchema = true, includeFunctions = true, includeRLS = true, includeStorage = true, includeData = false, dataTables = [] } = options;
    console.log('Generating migration SQL with options:', options);
    const files = {};
    const stats = {
      tables: 0,
      functions: 0,
      policies: 0,
      indexes: 0,
      triggers: 0,
      buckets: 0,
      dataRecords: 0,
      extensions: 0
    };
    // 01-schema-foundation.sql
    if (includeSchema) {
      let schemaSql = `-- Migration SQL: Schema Foundation
-- Generated: ${new Date().toISOString()}
-- Generator: Backup & Migration Manager

-- Enable required extensions
`;
      // Get extensions
      const extensions = await q(`SELECT extname FROM pg_extension WHERE extname NOT IN ('plpgsql')`);
      extensions?.forEach((ext)=>{
        schemaSql += `CREATE EXTENSION IF NOT EXISTS "${ext.extname}";\n`;
        stats.extensions++;
      });
      schemaSql += `\n-- Create custom types (ENUMs)\n`;
      // Get all ENUMs
      const enums = await q(`
        SELECT t.typname, e.enumlabel 
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid 
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public'
        ORDER BY t.typname, e.enumsortorder
      `);
      const enumMap = new Map();
      enums?.forEach((row)=>{
        if (!enumMap.has(row.typname)) {
          enumMap.set(row.typname, []);
        }
        enumMap.get(row.typname).push(row.enumlabel);
      });
      enumMap.forEach((labels, typeName)=>{
        schemaSql += `CREATE TYPE IF NOT EXISTS public.${typeName} AS ENUM (${labels.map((l)=>`'${l}'`).join(', ')});\n`;
      });
      // Get all tables with their definitions
      const tables = await q(`
        SELECT table_name
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      stats.tables = tables?.length || 0;
      schemaSql += `\n-- Create tables\n`;
      for (const table of tables || []){
        const columns = await q(`
          SELECT 
            column_name, 
            data_type, 
            is_nullable,
            column_default,
            character_maximum_length,
            udt_name
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
            AND table_name = '${table.table_name}'
          ORDER BY ordinal_position
        `);
        schemaSql += `\nCREATE TABLE IF NOT EXISTS public.${table.table_name} (\n`;
        const columnDefs = columns?.map((col)=>{
          let def = `  ${col.column_name} ${col.udt_name}`;
          if (col.character_maximum_length) {
            def += `(${col.character_maximum_length})`;
          }
          if (col.is_nullable === 'NO') {
            def += ' NOT NULL';
          }
          if (col.column_default) {
            def += ` DEFAULT ${col.column_default}`;
          }
          return def;
        }).join(',\n');
        schemaSql += columnDefs + '\n);\n';
      }
      // Add RLS enable statements
      schemaSql += `\n-- Enable Row Level Security\n`;
      for (const table of tables || []){
        schemaSql += `ALTER TABLE public.${table.table_name} ENABLE ROW LEVEL SECURITY;\n`;
      }
      files['01-schema-foundation.sql'] = btoa(schemaSql);
    }
    // 02-functions.sql
    if (includeFunctions) {
      const functions = await q(`
        SELECT p.proname as function_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.prokind = 'f'
        ORDER BY p.proname
      `);
      stats.functions = functions?.length || 0;
      let functionsSql = `-- Migration SQL: Database Functions
-- Generated: ${new Date().toISOString()}

`;
      for (const func of functions || []){
        const funcDef = await q(`
          SELECT pg_get_functiondef(p.oid) AS definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public' AND p.proname = '${func.function_name}'
          LIMIT 1
        `);
        if (funcDef?.[0]?.definition) {
          functionsSql += funcDef[0].definition + ';\n\n';
        }
      }
      files['02-functions.sql'] = btoa(functionsSql);
    }
    // 03-indexes-triggers.sql
    if (includeSchema) {
      const indexes = await q(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        AND indexname NOT LIKE '%_pkey'
        ORDER BY tablename, indexname
      `);
      stats.indexes = indexes?.length || 0;
      const triggers = await q(`
        SELECT 
          t.tgname as trigger_name,
          c.relname as table_name,
          pg_get_triggerdef(t.oid) as trigger_def
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
        AND NOT t.tgisinternal
        ORDER BY c.relname, t.tgname
      `);
      stats.triggers = triggers?.length || 0;
      let indexTriggerSql = `-- Migration SQL: Indexes and Triggers
-- Generated: ${new Date().toISOString()}

-- Create indexes
`;
      for (const idx of indexes || []){
        indexTriggerSql += `${idx.indexdef};\n`;
      }
      indexTriggerSql += `\n-- Create triggers\n`;
      for (const trg of triggers || []){
        indexTriggerSql += `${trg.trigger_def};\n\n`;
      }
      files['03-indexes-triggers.sql'] = btoa(indexTriggerSql);
    }
    // 04-security-storage.sql
    if (includeRLS || includeStorage) {
      let securitySql = `-- Migration SQL: Security and Storage
-- Generated: ${new Date().toISOString()}

`;
      if (includeRLS) {
        const policies = await q(`
          SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname IN ('public', 'storage')
          ORDER BY schemaname, tablename, policyname
        `);
        stats.policies = policies?.length || 0;
        securitySql += `-- RLS Policies\n`;
        for (const policy of policies || []){
          const permissive = policy.permissive === 'PERMISSIVE' ? 'AS PERMISSIVE' : 'AS RESTRICTIVE';
          const roles = policy.roles && policy.roles.length > 0 ? policy.roles.join(', ') : 'PUBLIC';
          securitySql += `CREATE POLICY IF NOT EXISTS "${policy.policyname}"\n`;
          securitySql += `  ON ${policy.schemaname}.${policy.tablename}\n`;
          securitySql += `  ${permissive}\n`;
          securitySql += `  FOR ${policy.cmd}\n`;
          securitySql += `  TO ${roles}\n`;
          if (policy.qual) {
            securitySql += `  USING (${policy.qual})\n`;
          }
          if (policy.with_check) {
            securitySql += `  WITH CHECK (${policy.with_check})\n`;
          }
          securitySql += `;\n\n`;
        }
      }
      if (includeStorage) {
        const buckets = await q(`SELECT id, name, public FROM storage.buckets`);
        stats.buckets = buckets?.length || 0;
        securitySql += `\n-- Storage Buckets\n`;
        for (const bucket of buckets || []){
          securitySql += `INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket.id}', '${bucket.name}', ${bucket.public}) ON CONFLICT (id) DO NOTHING;\n`;
        }
      }
      files['04-security-storage.sql'] = btoa(securitySql);
    }
    // 05-data-migration.sql (optional)
    if (includeData && dataTables.length > 0) {
      let dataSql = `-- Migration SQL: Data Migration
-- Generated: ${new Date().toISOString()}
-- WARNING: This file may be very large

`;
      for (const tableName of dataTables){
        try {
          const { data: rows, count } = await authenticatedSupabase.from(tableName).select('*', {
            count: 'exact'
          });
          if (rows && rows.length > 0) {
            stats.dataRecords += rows.length;
            dataSql += `\n-- Data for table: ${tableName} (${rows.length} records)\n`;
            for (const row of rows){
              const columns = Object.keys(row);
              const values = Object.values(row).map((v)=>v === null ? 'NULL' : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : JSON.stringify(v));
              dataSql += `INSERT INTO public.${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;\n`;
            }
          }
        } catch (error) {
          console.error(`Failed to fetch data for table ${tableName}:`, error);
        }
      }
      files['05-data-migration.sql'] = btoa(dataSql);
    }
    const totalLines = Object.values(files).reduce((sum, content)=>{
      return sum + atob(content).split('\n').length;
    }, 0);
    const estimatedSize = Object.values(files).reduce((sum, content)=>{
      return sum + new Blob([
        atob(content)
      ]).size;
    }, 0);
    // Log to audit
    await authenticatedSupabase.rpc('log_sensitive_operation_with_limits', {
      _operation: 'sql_generation',
      _table_name: 'migration_files',
      _record_id: 'generation',
      _user_id: user.id
    });
    // Trigger webhooks
    const result = {
      success: true,
      files,
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: user.email,
        totalLines,
        estimatedSize: `${(estimatedSize / 1024 / 1024).toFixed(2)} MB`,
        stats
      }
    };
    try {
      await authenticatedSupabase.functions.invoke('trigger-webhook', {
        body: {
          event: 'generation_complete',
          data: result
        }
      });
    } catch (webhookError) {
      console.error('Webhook trigger failed:', webhookError);
    }
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error generating migration SQL:', error);
    // Trigger failure webhook
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      await supabase.functions.invoke('trigger-webhook', {
        body: {
          event: 'generation_failed',
          data: {
            error: error.message
          }
        }
      });
    } catch (webhookError) {
      console.error('Webhook trigger failed:', webhookError);
    }
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
