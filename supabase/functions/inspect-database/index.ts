import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { projectId, managementToken: providedToken } = await req.json();
    let managementToken = providedToken;
    // If no token provided in body, authenticate via JWT (external call)
    if (!managementToken) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        throw new Error('No authorization header');
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError) throw userError;
      // Create authenticated client for RLS
      const authenticatedClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      });
      // Get user's credentials
      const { data: credentials, error: credentialsError } = await authenticatedClient.from('user_credentials').select('api_credentials').eq('user_id', userData.user.id).maybeSingle();
      if (credentialsError) {
        console.error("❌ Credentials error:", credentialsError.message);
        return new Response(JSON.stringify({
          error: 'Failed to fetch user credentials',
          details: credentialsError.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      managementToken = credentials?.api_credentials?.management_token;
      if (!managementToken) {
        return new Response(JSON.stringify({
          needsCredentials: true
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    console.log('🎯 Inspecting database for project:', projectId);
    // Get target project details from Management API
    const managementUrl = `https://api.supabase.com/v1/projects/${projectId}`;
    const projectResponse = await fetch(managementUrl, {
      headers: {
        'Authorization': `Bearer ${managementToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!projectResponse.ok) {
      const errorText = await projectResponse.text();
      const truncated = errorText?.slice(0, 300) ?? '';
      console.error('❌ Failed to get project details:', projectResponse.status, truncated);
      const needsPermissions = projectResponse.status === 401 || projectResponse.status === 403;
      return new Response(JSON.stringify({
        tables: [],
        policies: [],
        relationships: [],
        schema: 'public',
        accessError: {
          step: 'project-details',
          status: projectResponse.status,
          message: truncated
        },
        needsPermissions
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const projectData = await projectResponse.json();
    console.log('📋 Target project data received:', projectData.name);
    // Get target project's database connection string
    const targetProjectUrl = `https://${projectId}.supabase.co`;
    // Get target project's API keys from Management API
    const keysResponse = await fetch(`https://api.supabase.com/v1/projects/${projectId}/api-keys?reveal=true`, {
      headers: {
        'Authorization': `Bearer ${managementToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!keysResponse.ok) {
      const errorText = await keysResponse.text();
      const truncated = errorText?.slice(0, 300) ?? '';
      console.error('❌ Failed to get project API keys:', keysResponse.status, truncated);
      const needsPermissions = keysResponse.status === 401 || keysResponse.status === 403;
      return new Response(JSON.stringify({
        tables: [],
        policies: [],
        relationships: [],
        schema: 'public',
        accessError: {
          step: 'api-keys',
          status: keysResponse.status,
          message: truncated
        },
        needsPermissions
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const keysData = await keysResponse.json();
    const serviceRoleKeyObj = keysData.find((key)=>key.name === 'service_role');
    if (!serviceRoleKeyObj) {
      console.error('❌ Target project service role key not found');
      return new Response(JSON.stringify({
        tables: [],
        policies: [],
        relationships: [],
        schema: 'public',
        accessError: {
          step: 'api-keys',
          status: 404,
          message: 'Target project service role key not found'
        },
        needsPermissions: false
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const targetServiceRoleKey = serviceRoleKeyObj.api_key;
    console.log('🔑 Target project service role key obtained');
    // Create client for target project's database
    const targetClient = createClient(targetProjectUrl, targetServiceRoleKey);
    // Fetch metadata from target project's pg-meta service using its Service Role key
    console.log('🔗 Fetching database metadata via pg-meta...');
    const pgMetaHeaders = {
      'Authorization': `Bearer ${targetServiceRoleKey}`,
      'apikey': targetServiceRoleKey,
      'Content-Type': 'application/json'
    };
    const fetchWithFallback = async (endpoint)=>{
      // Try new path /pg/meta/* first, then fallback to /pg-meta/*
      const primary = await fetch(`${targetProjectUrl}/pg/meta/${endpoint}`, {
        headers: pgMetaHeaders
      });
      if (primary.ok) return primary;
      if (primary.status !== 404) return primary; // return non-404 errors as-is
      const fallback = await fetch(`${targetProjectUrl}/pg-meta/${endpoint}`, {
        headers: pgMetaHeaders
      });
      return fallback;
    };
    // Enhanced table discovery using multiple methods
    console.log('📋 Fetching tables metadata with multi-method approach...');
    const allTablesMap = new Map();
    let primaryMethod = 'none';
    // Method 1: Try pg-meta (most reliable)
    const tablesRes = await fetchWithFallback('tables?included_schemas=public');
    if (tablesRes.ok) {
      const tablesData = await tablesRes.json();
      console.log(`✅ Method 1 (pg-meta): Found ${tablesData.length} tables`);
      tablesData.forEach((table)=>{
        const tableName = table.name || table.table_name;
        if (tableName && !allTablesMap.has(tableName)) {
          allTablesMap.set(tableName, table);
        }
      });
      primaryMethod = 'pg-meta';
    } else {
      console.warn('⚠️ Method 1 (pg-meta) failed:', tablesRes.status);
    }
    // Method 2: Try direct RPC query
    try {
      const { data: rpcTables, error: rpcError } = await targetClient.rpc('get_tables_info');
      if (!rpcError && rpcTables) {
        console.log(`✅ Method 2 (RPC): Found ${rpcTables.length} tables`);
        rpcTables.forEach((table)=>{
          if (table.name && !allTablesMap.has(table.name)) {
            allTablesMap.set(table.name, {
              name: table.name,
              schema: table.schema || 'public',
              type: table.type || 'BASE TABLE',
              comment: table.comment,
              columns: table.columns || [],
              rls_enabled: table.rls_enabled
            });
          }
        });
        if (primaryMethod === 'none') primaryMethod = 'rpc';
      }
    } catch (rpcError) {
      console.warn('⚠️ Method 2 (RPC) failed:', rpcError);
    }
    // Method 3: Try information_schema directly
    try {
      const { data: schemaTables, error: schemaError } = await targetClient.from('information_schema.tables').select('table_name, table_schema, table_type').eq('table_schema', 'public').eq('table_type', 'BASE TABLE');
      if (!schemaError && schemaTables) {
        console.log(`✅ Method 3 (information_schema): Found ${schemaTables.length} tables`);
        schemaTables.forEach((table)=>{
          if (table.table_name && !allTablesMap.has(table.table_name)) {
            allTablesMap.set(table.table_name, {
              name: table.table_name,
              schema: table.table_schema || 'public',
              type: table.table_type || 'BASE TABLE',
              comment: null,
              columns: [],
              rls_enabled: false
            });
          }
        });
        if (primaryMethod === 'none') primaryMethod = 'information_schema';
      }
    } catch (schemaError) {
      console.warn('⚠️ Method 3 (information_schema) failed:', schemaError);
    }
    // Method 4: Try OpenAPI introspection (fallback for REST-exposed tables only)
    try {
      const openapiRes = await fetch(`${targetProjectUrl}/rest/v1/`, {
        headers: {
          'Authorization': `Bearer ${targetServiceRoleKey}`,
          'apikey': targetServiceRoleKey,
          'Accept': 'application/openapi+json'
        }
      });
      if (openapiRes.ok) {
        const openapi = await openapiRes.json();
        const paths = openapi?.paths || {};
        const tableNames = Object.keys(paths).filter((p)=>p.startsWith('/') && !p.startsWith('/rpc/')).map((p)=>p.replace(/^\//, ''));
        console.log(`✅ Method 4 (OpenAPI): Found ${tableNames.length} REST-exposed tables`);
        tableNames.forEach((tableName)=>{
          if (!allTablesMap.has(tableName)) {
            allTablesMap.set(tableName, {
              name: tableName,
              schema: 'public',
              type: 'BASE TABLE',
              comment: null,
              columns: [],
              rls_enabled: false
            });
          }
        });
        if (primaryMethod === 'none') primaryMethod = 'openapi';
      }
    } catch (openapiError) {
      console.warn('⚠️ Method 4 (OpenAPI) failed:', openapiError);
    }
    const totalTablesFound = allTablesMap.size;
    console.log(`📊 TOTAL UNIQUE TABLES DISCOVERED: ${totalTablesFound} (primary method: ${primaryMethod})`);
    if (totalTablesFound === 0) {
      console.error('❌ No tables found using any method');
      throw new Error('Failed to discover any tables in the project');
    }
    const tablesData = Array.from(allTablesMap.values());
    console.log(`✅ Total tables aggregated: ${tablesData.length}`);
    // Columns - with multiple fallback strategies
    console.log('📋 Fetching columns metadata...');
    let columnsData = [];
    let columnsFetchMethod = 'none';
    // Method 1: Try pg-meta
    const columnsRes = await fetchWithFallback('columns?included_schemas=public');
    if (columnsRes.ok) {
      columnsData = await columnsRes.json();
      columnsFetchMethod = 'pg-meta';
      console.log(`✅ Method 1 (pg-meta): Fetched ${columnsData.length} columns`);
    }
    // If pg-meta failed or returned no columns, try get_tables_info fallback
    if (columnsData.length === 0) {
      console.warn('⚠️ Method 1 (pg-meta) columns unavailable or empty, trying get_tables_info fallback...');
      try {
        const { data: tablesInfo, error: tablesInfoError } = await targetClient.rpc('get_tables_info', {
          included_schemas: [
            'public'
          ]
        });
        if (!tablesInfoError && tablesInfo && Array.isArray(tablesInfo)) {
          // Extract columns from each table's columns JSONB array
          tablesInfo.forEach((table)=>{
            if (table.columns && Array.isArray(table.columns)) {
              table.columns.forEach((col)=>{
                columnsData.push({
                  table_name: table.name,
                  name: col.name,
                  data_type: col.type,
                  is_nullable: col.nullable,
                  column_default: col.default,
                  ordinal_position: col.position,
                  is_primary_key: false
                });
              });
            }
          });
          columnsFetchMethod = 'get_tables_info';
          console.log(`✅ Method 2 (get_tables_info): Extracted ${columnsData.length} columns from tables`);
        } else {
          console.error('❌ get_tables_info fallback failed:', tablesInfoError);
        }
      } catch (fallbackError) {
        console.error('❌ get_tables_info fallback error:', fallbackError);
      }
    }
    // Final check and warning
    if (columnsData.length === 0) {
      console.warn('⚠️ No columns could be fetched - backup will have tables without column details');
    } else {
      console.log(`✅ Total columns fetched: ${columnsData.length} (method: ${columnsFetchMethod})`);
    }
    // Try to fetch primary keys to enrich column data
    try {
      const pkRes = await fetchWithFallback('primary-keys?included_schemas=public');
      if (pkRes.ok) {
        const primaryKeys = await pkRes.json();
        console.log(`✅ Fetched ${primaryKeys.length} primary key definitions`);
        // Mark columns as primary keys
        primaryKeys.forEach((pk)=>{
          const tableName = pk.table_name || pk.table;
          const columnName = pk.column_name || pk.name || pk.columns && pk.columns[0];
          if (tableName && columnName) {
            const column = columnsData.find((c)=>(c.table_name || c.table) === tableName && (c.name || c.column_name) === columnName);
            if (column) {
              column.is_primary_key = true;
            }
          }
        });
      }
    } catch (pkError) {
      console.warn('⚠️ Primary keys fetch failed, continuing without PK flags:', pkError);
    }
    // Foreign keys
    console.log('📋 Fetching foreign keys metadata...');
    let rawFks = [];
    try {
      const fksRes = await fetchWithFallback('foreign-keys?included_schemas=public');
      if (fksRes.ok) {
        rawFks = await fksRes.json();
        console.log(`✅ Fetched ${rawFks.length} foreign keys`);
      } else {
        console.warn('⚠️ Foreign keys fetch not ok:', fksRes.status, await fksRes.text());
      }
    } catch (e) {
      console.error('Foreign keys fetch failed:', e);
    }
    // Policies with robust fallback
    console.log('📋 Fetching RLS policies metadata...');
    let rawPolicies = [];
    let policiesMethod = 'none';
    try {
      // Primary method: pg-meta
      const polRes = await fetchWithFallback('policies?included_schemas=public');
      if (polRes.ok) {
        rawPolicies = await polRes.json();
        console.log(`✅ Method 1 (pg-meta): Fetched ${rawPolicies.length} policies`);
        policiesMethod = 'pg-meta';
      } else {
        console.warn('⚠️ Method 1 (pg-meta) policies fetch not ok:', polRes.status);
      }
    } catch (e) {
      console.warn('⚠️ Method 1 (pg-meta) policies fetch failed:', e);
    }
    // Fallback: Use get_policies_info RPC if pg-meta returned nothing
    if (rawPolicies.length === 0) {
      try {
        console.log('🔄 Method 2 (RPC): Trying get_policies_info fallback...');
        const { data: rpcPolicies, error: rpcError } = await targetClient.rpc('get_policies_info');
        if (!rpcError && rpcPolicies && rpcPolicies.length > 0) {
          // Normalize RPC output to match pg-meta format
          rawPolicies = rpcPolicies.map((p)=>({
              schemaname: 'public',
              tablename: p.tablename,
              policyname: p.policyname,
              permissive: p.permissive,
              roles: p.roles,
              cmd: p.cmd,
              qual: p.qual,
              with_check: p.with_check
            }));
          console.log(`✅ Method 2 (RPC): Fetched ${rawPolicies.length} policies via fallback`);
          policiesMethod = 'rpc-fallback';
        } else if (rpcError) {
          console.warn('⚠️ Method 2 (RPC) fallback failed:', rpcError);
        }
      } catch (e) {
        console.warn('⚠️ Method 2 (RPC) fallback exception:', e);
      }
    }
    console.log(`📊 TOTAL POLICIES FOUND: ${rawPolicies.length} (method: ${policiesMethod})`);
    // Fetch triggers and functions
    console.log('📋 Fetching triggers and functions...');
    let triggersLegacy = [];
    let functions = [];
    // Fetch functions first
    try {
      const { data: functionsData, error: functionsError } = await targetClient.rpc('get_functions_info');
      if (!functionsError && functionsData) {
        functions = functionsData.filter((f)=>!f.is_trigger);
        console.log(`✅ Fetched ${functions.length} database functions`);
      }
    } catch (e) {
      console.warn('⚠️ Functions fetch failed:', e);
    }
    // 🆕 ENHANCED: Fetch triggers using direct PostgreSQL catalog queries (most reliable)
    console.log(`🔎 Inspecting SOURCE project triggers: ${targetProjectUrl}`);
    console.log('📋 Method 1: Querying pg_trigger directly (most reliable)...');
    // Try direct PostgreSQL catalog query first (most reliable)
    try {
      const directTriggerQuery = `
        SELECT 
          t.tgname AS trigger_name,
          ns.nspname AS schema_name,
          c.relname AS table_name,
          p.proname AS function_name,
          CASE t.tgtype::integer & 66
            WHEN 2 THEN 'BEFORE'
            WHEN 64 THEN 'INSTEAD OF'
            ELSE 'AFTER'
          END AS action_timing,
          CASE t.tgtype::integer & 28
            WHEN 4 THEN 'INSERT'
            WHEN 8 THEN 'DELETE'
            WHEN 16 THEN 'UPDATE'
            WHEN 12 THEN 'INSERT OR DELETE'
            WHEN 20 THEN 'INSERT OR UPDATE'
            WHEN 24 THEN 'DELETE OR UPDATE'
            WHEN 28 THEN 'INSERT OR DELETE OR UPDATE'
            ELSE 'UNKNOWN'
          END AS event_manipulation,
          CASE t.tgtype::integer & 1
            WHEN 0 THEN 'STATEMENT'
            ELSE 'ROW'
          END AS action_orientation,
          pg_get_triggerdef(t.oid) AS trigger_definition,
          t.tgenabled != 'D' AS is_enabled,
          obj_description(t.oid, 'pg_trigger') AS description
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace ns ON c.relnamespace = ns.oid
        JOIN pg_proc p ON t.tgfoid = p.oid
        WHERE ns.nspname = 'public'
          AND NOT t.tgisinternal
        ORDER BY c.relname, t.tgname;
      `;
      const { data: directTriggers, error: directError } = await targetClient.rpc('exec_sql', {
        sql: directTriggerQuery
      });
      if (!directError && directTriggers && Array.isArray(directTriggers) && directTriggers.length > 0) {
        console.log(`✅ Direct query: Found ${directTriggers.length} triggers from pg_trigger`);
        console.log('📋 Sample direct trigger:', JSON.stringify(directTriggers[0]));
        triggersLegacy = directTriggers.map((t)=>({
            name: t.trigger_name,
            table_name: t.table_name,
            schema: t.schema_name || 'public',
            event: t.event_manipulation,
            function_name: t.function_name,
            orientation: t.action_orientation,
            activation: t.action_timing,
            enabled: t.is_enabled,
            definition: t.trigger_definition,
            // Legacy format for compatibility
            trigger_name: t.trigger_name,
            event_object_table: t.table_name,
            event_object_schema: t.schema_name || 'public',
            action_timing: t.action_timing,
            event_manipulation: t.event_manipulation,
            action_orientation: t.action_orientation,
            action_statement: `EXECUTE FUNCTION ${t.function_name}()`,
            trigger_definition: t.trigger_definition,
            functionName: t.function_name,
            functionSchema: t.schema_name || 'public'
          }));
        console.log(`✅ Successfully discovered ${triggersLegacy.length} triggers via direct query`);
      } else if (directError) {
        console.warn('⚠️ Direct trigger query failed:', directError.message);
      } else {
        console.log('ℹ️ Direct query returned no triggers');
      }
    } catch (directError) {
      console.error('❌ Direct trigger query exception:', directError);
    }
    // Fallback Method 2: Try pg-meta API if direct query failed
    if (triggersLegacy.length === 0) {
      console.log('🔄 Method 2: Trying pg-meta API...');
      try {
        const res = await fetchWithFallback('triggers?included_schemas=public');
        if (!res || !res.ok) {
          console.warn('⚠️ pg-meta triggers fetch not ok:', res?.status, await res?.text());
        } else {
          const triggersData = await res.json();
          console.log(`📊 pg-meta triggers response (${Array.isArray(triggersData) ? triggersData.length : 0} items)`);
          if (Array.isArray(triggersData) && triggersData.length > 0) {
            console.log('📋 Sample pg-meta trigger:', JSON.stringify(triggersData[0]));
            triggersLegacy = triggersData.filter((t)=>t.schema === 'public' || t.table_schema === 'public').map((t)=>{
              const functionName = t.function_name || (t.definition || t.trigger_definition || '').match(/EXECUTE (?:FUNCTION|PROCEDURE)\s+(\w+)/i)?.[1] || '';
              return {
                name: t.name || t.trigger_name,
                table_name: t.table || t.event_object_table,
                schema: t.schema || t.table_schema || 'public',
                event: Array.isArray(t.events) ? t.events.join(' OR ') : t.event_manipulation || '',
                function_name: functionName,
                orientation: t.orientation || t.action_orientation || 'ROW',
                activation: t.activation || t.action_timing || 'BEFORE',
                enabled: t.enabled_mode !== 'DISABLED' && t.enabled !== false,
                definition: t.definition || t.trigger_definition || '',
                // Legacy format
                trigger_name: t.name || t.trigger_name,
                event_object_table: t.table || t.event_object_table,
                event_object_schema: t.schema || t.table_schema || 'public',
                action_timing: t.activation || t.action_timing || 'BEFORE',
                event_manipulation: Array.isArray(t.events) ? t.events.join(' OR ') : t.event_manipulation || '',
                action_orientation: t.orientation || t.action_orientation || 'ROW',
                action_statement: functionName ? `EXECUTE FUNCTION ${functionName}()` : t.action_statement || '',
                trigger_definition: t.definition || t.trigger_definition || '',
                functionName: functionName,
                functionSchema: t.schema || 'public'
              };
            });
            console.log(`✅ pg-meta: Found ${triggersLegacy.length} triggers`);
          } else {
            console.log('ℹ️ pg-meta returned no triggers');
          }
        }
      } catch (e) {
        console.error('❌ pg-meta triggers fetch exception:', e);
      }
    }
    // Fallback Method 3: Try information_schema.triggers via RPC
    if (triggersLegacy.length === 0) {
      console.log('🔄 Method 3: Trying information_schema via RPC...');
      try {
        const { data: rpcTriggersData, error: rpcError } = await targetClient.rpc('get_triggers_info');
        if (!rpcError && rpcTriggersData && Array.isArray(rpcTriggersData) && rpcTriggersData.length > 0) {
          console.log(`✅ RPC: Found ${rpcTriggersData.length} triggers`);
          console.log('📋 Sample RPC trigger:', JSON.stringify(rpcTriggersData[0]));
          triggersLegacy = rpcTriggersData.filter((t)=>t.event_object_schema === 'public').map((t)=>{
            const functionName = (t.action_statement || t.trigger_definition || '').match(/EXECUTE (?:FUNCTION|PROCEDURE)\s+(\w+)/i)?.[1] || '';
            return {
              name: t.trigger_name,
              table_name: t.event_object_table,
              schema: t.event_object_schema,
              event: t.event_manipulation,
              function_name: functionName,
              orientation: t.action_orientation || 'ROW',
              activation: t.action_timing,
              enabled: true,
              definition: t.trigger_definition || '',
              // Legacy format
              trigger_name: t.trigger_name,
              event_object_table: t.event_object_table,
              event_object_schema: t.event_object_schema,
              action_timing: t.action_timing,
              event_manipulation: t.event_manipulation,
              action_orientation: t.action_orientation,
              action_statement: t.action_statement,
              trigger_definition: t.trigger_definition,
              functionName: functionName,
              functionSchema: t.event_object_schema
            };
          });
          console.log(`✅ RPC: Successfully found ${triggersLegacy.length} triggers`);
        } else if (rpcError) {
          console.warn('⚠️ RPC failed:', rpcError.message);
        } else {
          console.log('ℹ️ RPC returned no triggers');
        }
      } catch (fallbackError) {
        console.error('❌ RPC exception:', fallbackError);
      }
    }
    console.log(`📊 TOTAL TRIGGERS DISCOVERED: ${triggersLegacy.length}`);
    if (triggersLegacy.length === 0) {
      console.warn('⚠️ WARNING: No triggers discovered! If your database has triggers, this is a bug.');
      console.warn('⚠️ Automated table behaviors may be missing after restore.');
    } else {
      console.log(`✅ Trigger discovery successful:`);
      triggersLegacy.forEach((t)=>{
        console.log(`   - ${t.table_name}.${t.name} (${t.activation} ${t.event} → ${t.function_name})`);
      });
    }
    // Fetch custom types and enums
    console.log('📋 Fetching custom types and enums...');
    let customTypes = [];
    try {
      const res = await fetchWithFallback('types?included_schemas=public');
      if (!res || !res.ok) {
        console.warn('⚠️ Types fetch not ok:', res?.status);
      } else {
        const typesData = await res.json();
        console.log(`📊 Raw types data received (${Array.isArray(typesData) ? typesData.length : 0} items)`);
        if (Array.isArray(typesData) && typesData.length > 0) {
          customTypes = typesData.map((t)=>({
              type_name: t.name,
              schema: t.schema || 'public',
              type_kind: t.format,
              enum_values: t.enums || null
            }));
          console.log(`✅ Fetched ${customTypes.length} custom types/enums`);
        } else {
          console.log('ℹ️ No custom types found');
        }
      }
    } catch (e) {
      console.warn('⚠️ Custom types fetch failed:', e);
    }
    // Fetch database extensions
    console.log('📋 Fetching database extensions...');
    let extensions = [];
    try {
      const res = await fetchWithFallback('extensions');
      if (!res || !res.ok) {
        console.warn('⚠️ Extensions fetch not ok:', res?.status);
      } else {
        const extData = await res.json();
        console.log(`📊 Raw extensions data received (${Array.isArray(extData) ? extData.length : 0} items)`);
        if (Array.isArray(extData) && extData.length > 0) {
          extensions = extData.filter((ext)=>ext.name !== 'plpgsql').map((ext)=>({
              extname: ext.name,
              extversion: ext.version || ext.installed_version
            }));
          console.log(`✅ Fetched ${extensions.length} extensions`);
        } else {
          console.log('ℹ️ No extensions found');
        }
      }
    } catch (e) {
      console.warn('⚠️ Extensions fetch failed:', e);
    }
    // Fetch indexes
    console.log('📋 Fetching indexes...');
    let indexes = [];
    try {
      const idxRes = await fetchWithFallback('indexes?included_schemas=public');
      if (idxRes.ok) {
        indexes = await idxRes.json();
        console.log(`✅ Fetched ${indexes.length} indexes`);
      }
    } catch (e) {
      console.warn('⚠️ Indexes fetch failed:', e);
    }
    // 🆕 Fetch views (regular)
    console.log('📋 Fetching views...');
    let views = [];
    try {
      const viewsRes = await fetchWithFallback('views?included_schemas=public');
      if (viewsRes.ok) {
        const viewsData = await viewsRes.json();
        views = viewsData.map((v)=>({
            name: v.name || v.table_name,
            schema: v.schema || 'public',
            definition: v.definition || v.view_definition,
            is_updatable: v.is_updatable || false,
            comment: v.comment || null
          }));
        console.log(`✅ Fetched ${views.length} views`);
      }
    } catch (e) {
      console.warn('⚠️ Views fetch failed:', e);
    }
    // 🆕 Fetch materialized views
    console.log('📋 Fetching materialized views...');
    let materializedViews = [];
    try {
      const matViewsRes = await fetchWithFallback('materialized-views?included_schemas=public');
      if (matViewsRes.ok) {
        const matViewsData = await matViewsRes.json();
        materializedViews = matViewsData.map((mv)=>({
            name: mv.name || mv.matviewname,
            schema: mv.schema || mv.schemaname || 'public',
            definition: mv.definition || mv.view_definition,
            indexes: mv.indexes || [],
            comment: mv.comment || null
          }));
        console.log(`✅ Fetched ${materializedViews.length} materialized views`);
      }
    } catch (e) {
      console.warn('⚠️ Materialized views fetch failed:', e);
    }
    // 🆕 Fetch sequences
    console.log('📋 Fetching sequences...');
    let sequences = [];
    try {
      const seqRes = await fetchWithFallback('sequences?included_schemas=public');
      if (seqRes.ok) {
        const seqData = await seqRes.json();
        sequences = seqData.map((s)=>({
            name: s.name || s.sequence_name,
            schema: s.schema || s.sequence_schema || 'public',
            data_type: s.data_type || 'bigint',
            start_value: s.start_value,
            min_value: s.min_value || s.minimum_value,
            max_value: s.max_value || s.maximum_value,
            increment_by: s.increment || s.increment_by || 1,
            cycle: s.cycle || false,
            cache_size: s.cache_size || s.cache_value || 1,
            last_value: s.last_value,
            is_called: s.is_called
          }));
        console.log(`✅ Fetched ${sequences.length} sequences with current values`);
      }
    } catch (e) {
      console.warn('⚠️ Sequences fetch failed:', e);
    }
    // 🆕 Fetch CHECK constraints
    console.log('📋 Fetching CHECK constraints...');
    let checkConstraints = [];
    try {
      // Try pg-meta first
      const checkRes = await fetchWithFallback('check-constraints?included_schemas=public');
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        checkConstraints = checkData.map((c)=>({
            constraint_name: c.name || c.constraint_name,
            table_name: c.table || c.table_name,
            schema: c.schema || 'public',
            check_clause: c.definition || c.check_clause,
            is_deferrable: c.is_deferrable || false,
            initially_deferred: c.initially_deferred || false
          }));
        console.log(`✅ Fetched ${checkConstraints.length} CHECK constraints`);
      } else {
        // Fallback: Query information_schema
        const { data: checkData, error: checkError } = await targetClient.rpc('get_check_constraints_info');
        if (!checkError && checkData) {
          checkConstraints = checkData;
          console.log(`✅ Fallback: Fetched ${checkConstraints.length} CHECK constraints via RPC`);
        }
      }
    } catch (e) {
      console.warn('⚠️ CHECK constraints fetch failed:', e);
    }
    // 🆕 Fetch UNIQUE constraints
    console.log('📋 Fetching UNIQUE constraints...');
    let uniqueConstraints = [];
    try {
      // Try pg-meta first
      const uniqueRes = await fetchWithFallback('unique-constraints?included_schemas=public');
      if (uniqueRes.ok) {
        const uniqueData = await uniqueRes.json();
        uniqueConstraints = uniqueData.map((u)=>({
            constraint_name: u.name || u.constraint_name,
            table_name: u.table || u.table_name,
            schema: u.schema || 'public',
            columns: u.columns || [],
            is_deferrable: u.is_deferrable || false,
            initially_deferred: u.initially_deferred || false
          }));
        console.log(`✅ Fetched ${uniqueConstraints.length} UNIQUE constraints`);
      } else {
        // Fallback: Query information_schema
        const { data: uniqueData, error: uniqueError } = await targetClient.rpc('get_unique_constraints_info');
        if (!uniqueError && uniqueData) {
          uniqueConstraints = uniqueData;
          console.log(`✅ Fallback: Fetched ${uniqueConstraints.length} UNIQUE constraints via RPC`);
        }
      }
    } catch (e) {
      console.warn('⚠️ UNIQUE constraints fetch failed:', e);
    }
    console.log(`📊 COMPLETENESS SUMMARY:
      - Tables: ${tablesData.length}
      - Views: ${views.length}
      - Materialized Views: ${materializedViews.length}
      - Sequences: ${sequences.length}
      - CHECK Constraints: ${checkConstraints.length}
      - UNIQUE Constraints: ${uniqueConstraints.length}
    `);
    // Normalize relationships for UI and build quick lookup for column FK details
    const relationships = (rawFks || []).map((fk)=>{
      const sourceTable = fk.source_table_name || fk.table_name || fk.table || fk.origin_table_name || fk.table_id || fk.origin_table;
      const targetTable = fk.target_table_name || fk.referenced_table_name || fk.foreign_table_name || fk.target_table || fk.referenced_table;
      const sourceColumn = fk.source_column_name || fk.column_name || fk.columns && fk.columns[0] || fk.origin_column_name || fk.origin_columns && fk.origin_columns[0];
      const targetColumn = fk.target_column_name || fk.referenced_column_name || fk.foreign_column_name || fk.foreign_columns && fk.foreign_columns[0];
      return {
        table_name: sourceTable,
        referenced_table_name: targetTable,
        source_column: sourceColumn,
        referenced_column: targetColumn
      };
    });
    const fkMap = new Map();
    relationships.forEach((r)=>{
      if (r.table_name && r.source_column && r.referenced_table_name) {
        fkMap.set(`${r.table_name}.${r.source_column}`, {
          table: r.referenced_table_name,
          column: r.referenced_column || ''
        });
      }
    });
    // Transform the data to match expected format, filtering out invalid entries
    const transformedTables = (tablesData || []).filter((table)=>{
      const tableName = table.name || table.table || table.table_name;
      if (!tableName || typeof tableName !== 'string' || tableName.trim() === '') {
        console.warn('⚠️ Skipping invalid table entry (no valid name):', table);
        return false;
      }
      return true;
    }).map((table)=>{
      const tableName = table.name || table.table || table.table_name;
      const tableSchema = table.schema || table.schema_name || 'public';
      const tableComment = table.comment || table.description || null;
      // Improved RLS detection: check table.rls_enabled first, then infer from policies
      let rlsEnabled = false;
      let rlsDetectionMethod = 'unknown';
      if (typeof table.rls_enabled === 'boolean') {
        rlsEnabled = table.rls_enabled;
        rlsDetectionMethod = 'pg_meta';
      } else if ((rawPolicies || []).some((p)=>(p.table || p.table_name) === tableName)) {
        rlsEnabled = true;
        rlsDetectionMethod = 'inferred_from_policies';
      }
      console.log(`📊 Table ${tableName}: RLS=${rlsEnabled} (method: ${rlsDetectionMethod})`);
      const cols = (columnsData || []).filter((col)=>(col.table_name || col.table) === tableName).map((col)=>{
        const colName = col.name || col.column_name;
        const dataType = col.data_type || col.format || 'text';
        const isNullable = typeof col.is_nullable === 'boolean' ? col.is_nullable : col.is_nullable === 'YES';
        const defaultValue = col.default_value ?? col.column_default ?? null;
        const ordinal = col.ordinal_position ?? col.position ?? null;
        const isPk = !!(col.is_primary_key || col.primary_key);
        const fk = fkMap.get(`${tableName}.${colName}`);
        return {
          name: colName,
          data_type: dataType,
          is_nullable: isNullable,
          column_default: defaultValue,
          ordinal_position: ordinal,
          is_primary_key: isPk,
          is_foreign_key: !!fk,
          ...fk ? {
            foreign_key: {
              table: fk.table,
              column: fk.column
            }
          } : {}
        };
      });
      return {
        name: tableName,
        schema: tableSchema,
        type: table.table_type || 'BASE TABLE',
        comment: tableComment,
        columns: cols,
        rls_enabled: rlsEnabled,
        rls_detection_method: rlsDetectionMethod
      };
    });
    console.log(`✅ Successfully fetched ${transformedTables.length} tables from target project`);
    // Check if RLS detection is reliable
    const rlsDetectionReliable = transformedTables.some((t)=>t.rls_detection_method === 'pg_meta');
    const tablesWithUnknownRLS = transformedTables.filter((t)=>t.rls_detection_method === 'unknown').length;
    if (tablesWithUnknownRLS > 0) {
      console.warn(`⚠️ ${tablesWithUnknownRLS} tables have unknown RLS status`);
    }
    // 🆕 CRITICAL: Fetch Realtime Publications
    console.log('📡 Fetching Realtime publications...');
    let realtimePublications = [];
    let realtimeEnabled = false;
    try {
      const { data: pubData, error: pubError } = await targetClient.rpc('exec_sql', {
        sql: `
          SELECT 
            p.pubname as publication_name,
            pt.schemaname,
            pt.tablename,
            p.puballtables as all_tables,
            p.pubinsert as publish_insert,
            p.pubupdate as publish_update,
            p.pubdelete as publish_delete,
            p.pubtruncate as publish_truncate
          FROM pg_publication p
          LEFT JOIN pg_publication_tables pt ON p.pubname = pt.pubname
          WHERE p.pubname = 'supabase_realtime'
          ORDER BY pt.schemaname, pt.tablename;
        `
      });
      if (!pubError && pubData && Array.isArray(pubData)) {
        realtimePublications = pubData.filter((p)=>p.tablename !== null);
        realtimeEnabled = pubData.length > 0;
        if (realtimeEnabled) {
          console.log(`✅ Realtime enabled on ${realtimePublications.length} tables`);
          realtimePublications.forEach((pub)=>{
            console.log(`   - ${pub.schemaname}.${pub.tablename}`);
          });
        } else {
          console.log('ℹ️ No Realtime publications found (Realtime not enabled)');
        }
      } else if (pubError) {
        console.warn('⚠️ Realtime publications fetch failed:', pubError.message);
      }
    } catch (e) {
      console.error('❌ Realtime publications fetch exception:', e);
    }
    // 🆕 CRITICAL: Fetch Custom Database Roles & Grants
    console.log('👥 Fetching database roles and grants...');
    let customRoles = [];
    let customGrants = [];
    try {
      // Fetch custom roles (excluding system roles)
      const { data: rolesData, error: rolesError } = await targetClient.rpc('exec_sql', {
        sql: `
          SELECT 
            rolname as role_name,
            rolsuper as is_superuser,
            rolinherit as inherit_privileges,
            rolcreaterole as can_create_role,
            rolcreatedb as can_create_db,
            rolcanlogin as can_login,
            rolreplication as is_replication_role,
            rolconnlimit as connection_limit,
            rolvaliduntil as valid_until,
            rolbypassrls as bypass_rls,
            rolconfig as role_config
          FROM pg_roles
          WHERE rolname NOT LIKE 'pg_%'
            AND rolname NOT IN (
              'postgres', 'supabase_admin', 'anon', 'authenticated', 
              'service_role', 'authenticator', 'pgbouncer', 
              'supabase_auth_admin', 'supabase_storage_admin', 
              'dashboard_user', 'supabase_functions_admin', 
              'supabase_read_only_user', 'pgsodium_keyiduser', 
              'pgsodium_keyholder', 'pgsodium_keymaker'
            )
          ORDER BY rolname;
        `
      });
      if (!rolesError && rolesData && Array.isArray(rolesData) && rolesData.length > 0) {
        customRoles = rolesData;
        console.log(`✅ Found ${customRoles.length} custom roles`);
        customRoles.forEach((role)=>{
          console.log(`   - ${role.role_name}`);
        });
      } else if (rolesError) {
        console.warn('⚠️ Custom roles fetch failed:', rolesError.message);
      } else {
        console.log('ℹ️ No custom roles found');
      }
      // Fetch custom table grants
      const { data: grantsData, error: grantsError } = await targetClient.rpc('exec_sql', {
        sql: `
          SELECT DISTINCT
            grantee,
            table_schema,
            table_name,
            privilege_type,
            is_grantable
          FROM information_schema.table_privileges
          WHERE table_schema = 'public'
            AND grantee NOT IN (
              'postgres', 'anon', 'authenticated', 'service_role',
              'authenticator', 'supabase_admin', 'dashboard_user'
            )
          ORDER BY grantee, table_name, privilege_type;
        `
      });
      if (!grantsError && grantsData && Array.isArray(grantsData) && grantsData.length > 0) {
        customGrants = grantsData;
        console.log(`✅ Found ${customGrants.length} custom grants`);
        console.log(`   Grantees: ${[
          ...new Set(customGrants.map((g)=>g.grantee))
        ].join(', ')}`);
      } else if (grantsError) {
        console.warn('⚠️ Custom grants fetch failed:', grantsError.message);
      } else {
        console.log('ℹ️ No custom grants found');
      }
    } catch (e) {
      console.error('❌ Roles/grants fetch exception:', e);
    }
    // 🆕 Check for multi-schema usage
    console.log('🗂️ Checking for multi-schema usage...');
    let allSchemas = [];
    try {
      const { data: schemasData, error: schemasError } = await targetClient.rpc('exec_sql', {
        sql: `
          SELECT 
            schema_name,
            (SELECT count(*) FROM information_schema.tables WHERE table_schema = schema_name) as table_count,
            (SELECT count(*) FROM information_schema.views WHERE table_schema = schema_name) as view_count,
            (SELECT count(*) FROM information_schema.routines WHERE routine_schema = schema_name) as function_count
          FROM information_schema.schemata
          WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast', 'pg_temp_1')
            AND schema_name NOT LIKE 'pg_%'
          ORDER BY schema_name;
        `
      });
      if (!schemasError && schemasData && Array.isArray(schemasData)) {
        allSchemas = schemasData;
        const nonEmptySchemas = allSchemas.filter((s)=>s.table_count > 0 || s.view_count > 0 || s.function_count > 0);
        if (nonEmptySchemas.length > 1) {
          console.warn(`⚠️ MULTI-SCHEMA DETECTED: Found ${nonEmptySchemas.length} schemas with objects`);
          console.warn(`⚠️ WARNING: Currently only 'public' schema is fully captured!`);
          nonEmptySchemas.forEach((s)=>{
            console.log(`   - ${s.schema_name}: ${s.table_count} tables, ${s.view_count} views, ${s.function_count} functions`);
          });
        } else {
          console.log(`✅ Single schema usage (public only)`);
        }
      }
    } catch (e) {
      console.warn('⚠️ Schema check failed:', e);
    }
    return new Response(JSON.stringify({
      tables: transformedTables,
      policies: rawPolicies,
      relationships,
      functions,
      triggers: triggersLegacy,
      customTypes,
      extensions,
      indexes,
      views,
      materializedViews,
      sequences,
      checkConstraints,
      uniqueConstraints,
      realtimePublications,
      customRoles,
      customGrants,
      schemas: allSchemas,
      schema: 'public',
      metaSource: 'pg_meta',
      rlsDetectionReliable,
      tablesWithUnknownRLS,
      // 🆕 Enhanced completeness metadata
      completeness: {
        views: views.length,
        materializedViews: materializedViews.length,
        sequences: sequences.length,
        checkConstraints: checkConstraints.length,
        uniqueConstraints: uniqueConstraints.length,
        realtimePublications: realtimePublications.length,
        realtimeEnabled: realtimeEnabled,
        customRoles: customRoles.length,
        customGrants: customGrants.length,
        schemasDetected: allSchemas.length,
        schemasWithObjects: allSchemas.filter((s)=>s.table_count > 0 || s.view_count > 0 || s.function_count > 0).length,
        captureVersion: '2.1.0',
        gaps: [
          ...allSchemas.filter((s)=>s.schema_name !== 'public' && (s.table_count > 0 || s.view_count > 0)).length > 0 ? [
            'multi_schema_objects_not_fully_captured'
          ] : []
        ],
        warnings: [
          ...realtimePublications.length > 0 ? [
            'Realtime publications captured - will need reconfiguration after restore'
          ] : [],
          ...customRoles.length > 0 ? [
            'Custom roles captured - will need recreation after restore'
          ] : [],
          ...allSchemas.length > 1 ? [
            'Multiple schemas detected - only public schema fully captured'
          ] : []
        ]
      }
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in inspect-database function:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'An error occurred'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
