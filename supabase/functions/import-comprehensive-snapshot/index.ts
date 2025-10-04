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
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let restoreOperationId;
  // 🆕 CRITICAL: Helper function for fetch with timeout (used throughout)
  const fetchWithTimeout = async (url, options, timeout = 30000)=>{
    const controller = new AbortController();
    const timeoutId = setTimeout(()=>controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout / 1000} seconds`);
      }
      throw error;
    }
  };
  try {
    const body = await req.json();
    restoreOperationId = body.restoreOperationId;
    console.log(`🔄 Starting comprehensive restore for operation: ${restoreOperationId}`);
    // Helper function to check if operation was cancelled
    const checkCancellation = async ()=>{
      const { data: currentOp } = await supabase.from('restore_operations').select('status').eq('id', restoreOperationId).single();
      if (currentOp?.status === 'cancelled') {
        throw new Error('RESTORE_CANCELLED');
      }
    };
    // Get restore operation details
    const { data: restoreOp, error: fetchError } = await supabase.from('restore_operations').select('*').eq('id', restoreOperationId).single();
    if (fetchError || !restoreOp) {
      throw new Error('Restore operation not found');
    }
    console.log(`📋 Restore operation found. Target: ${restoreOp.target_project_id}`);
    // Log audit entry
    await supabase.from('operation_audit_logs').insert({
      operation_type: 'restore',
      operation_id: restoreOperationId,
      user_id: restoreOp.user_id,
      action: 'restore_started',
      details: {
        target_project_id: restoreOp.target_project_id
      }
    });
    // Update status to running
    await supabase.from('restore_operations').update({
      status: 'running',
      started_at: new Date().toISOString(),
      progress_percentage: 5
    }).eq('id', restoreOperationId);
    // Get the associated backup operation to find the file path
    console.log('🔍 Fetching backup operation details...');
    const { data: backupOp, error: backupFetchError } = await supabase.from('backup_operations').select('file_path').eq('id', restoreOp.backup_operation_id).single();
    if (backupFetchError || !backupOp || !backupOp.file_path) {
      throw new Error('Backup operation or file path not found');
    }
    console.log(`📥 Downloading backup file from: ${backupOp.file_path}`);
    // Update progress to show download started
    await supabase.from('restore_operations').update({
      progress_percentage: 6,
      restore_log: [
        'Downloading backup file...'
      ],
      updated_at: new Date().toISOString()
    }).eq('id', restoreOperationId);
    // Create checkpoint for backup download phase
    await supabase.from('restore_checkpoints').insert({
      restore_operation_id: restoreOperationId,
      phase: 'download',
      checkpoint_data: {
        file_path: backupOp.file_path
      }
    });
    const downloadStartTime = Date.now();
    const { data: backupFile, error: downloadError } = await supabase.storage.from('backups').download(backupOp.file_path);
    if (downloadError || !backupFile) {
      throw new Error(`Failed to download backup: ${downloadError?.message || 'Unknown error'}`);
    }
    const downloadDuration = ((Date.now() - downloadStartTime) / 1000).toFixed(1);
    const fileSizeMB = (backupFile.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Downloaded ${fileSizeMB} MB in ${downloadDuration}s`);
    console.log('📋 Parsing backup data...');
    const backupText = await backupFile.text();
    const backupData = JSON.parse(backupText);
    console.log(`✅ Backup loaded. Version: ${backupData.version}, Capture: ${backupData.captureVersion || 'unknown'}`);
    // Get user credentials for Management API
    const { data: credentials } = await supabase.from('user_credentials').select('api_credentials').eq('user_id', restoreOp.user_id).single();
    const managementToken = credentials?.api_credentials?.management_token;
    if (!managementToken) {
      throw new Error('Management API token not found');
    }
    // Get target project API keys (with 30-second timeout)
    console.log('🔑 Fetching target project API keys...');
    const keysResponse = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/api-keys?reveal=true`, {
      headers: {
        'Authorization': `Bearer ${managementToken}`,
        'Content-Type': 'application/json'
      }
    }, 30000);
    if (!keysResponse.ok) {
      const errorText = await keysResponse.text();
      throw new Error(`Failed to retrieve project API keys: ${errorText}`);
    }
    const keysData = await keysResponse.json();
    const serviceRoleKey = keysData.find((k)=>k.name === 'service_role')?.api_key;
    if (!serviceRoleKey) {
      throw new Error('Service role key not found');
    }
    const targetClient = createClient(`https://${restoreOp.target_project_id}.supabase.co`, serviceRoleKey);
    let progress = 10;
    // Phase 1: Restore Extensions (must be first)
    await checkCancellation();
    if (backupData.extensions && backupData.extensions.length > 0) {
      console.log('🔌 Restoring database extensions...');
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'extensions',
        checkpoint_data: {
          count: backupData.extensions.length
        }
      });
      for (const ext of backupData.extensions){
        try {
          await targetClient.rpc('exec_sql', {
            query: `CREATE EXTENSION IF NOT EXISTS "${ext.extname}" VERSION '${ext.extversion}'`
          });
          console.log(`✅ Extension ${ext.extname} restored`);
        } catch (e) {
          console.warn(`⚠️ Could not restore extension ${ext.extname}:`, e);
        }
      }
      progress = 20;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        updated_at: new Date().toISOString()
      }).eq('id', restoreOperationId);
    }
    // Phase 2: Restore Custom Types/Enums
    await checkCancellation();
    let typesCreated = 0;
    if (backupData.customTypes && backupData.customTypes.length > 0) {
      console.log(`📐 Restoring custom types and enums (${backupData.customTypes.length} types)...`);
      // Batch enum creations to avoid migration collisions
      const enumStatements = [];
      for (const type of backupData.customTypes){
        if (type.type_kind === 'e' && type.enum_values && type.type_name) {
          const enumValues = type.enum_values.map((v)=>`'${v.replace(/'/g, "''")}'`).join(', ');
          const schema = type.schema || 'public';
          // Use DO block to check existence before creating
          const statement = `
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${type.type_name}') THEN
    CREATE TYPE ${schema}."${type.type_name}" AS ENUM (${enumValues});
  END IF;
END $$;`;
          enumStatements.push(statement);
        }
      }
      // Create types in batches of 5 with throttling
      const batchSize = 5;
      for(let i = 0; i < enumStatements.length; i += batchSize){
        const batch = enumStatements.slice(i, i + batchSize);
        const combinedQuery = batch.join('\n\n');
        try {
          const migrationResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${managementToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: `restore_enums_batch_${Math.floor(i / batchSize)}_${Date.now()}`,
              query: combinedQuery
            })
          });
          if (migrationResponse.ok) {
            typesCreated += batch.length;
            console.log(`✅ Created ${batch.length} enum types (${typesCreated}/${enumStatements.length})`);
          } else {
            const errorText = await migrationResponse.text();
            console.error(`❌ Failed to create enum batch: ${errorText}`);
          }
          // Throttle between batches to avoid version collisions
          if (i + batchSize < enumStatements.length) {
            await new Promise((resolve)=>setTimeout(resolve, 1500));
          }
        } catch (e) {
          console.error(`❌ Error creating enum batch:`, e);
        }
      }
      console.log(`📊 Custom types phase: ${typesCreated}/${enumStatements.length} types created`);
      progress = 25;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        restore_log: [
          `Created ${typesCreated} custom types/enums`
        ],
        updated_at: new Date().toISOString()
      }).eq('id', restoreOperationId);
    }
    // Helper function to format and sanitize default values
    const formatDefault = (value, dataType, typeKind)=>{
      if (!value) return '';
      const valStr = String(value);
      // Keep these special values as-is
      const keepAsIs = [
        'now()',
        'current_timestamp',
        'gen_random_uuid()',
        'uuid_generate_v4()',
        'true',
        'false',
        'null',
        'NULL'
      ];
      if (keepAsIs.some((kw)=>valStr.toLowerCase().includes(kw.toLowerCase()))) {
        return valStr;
      }
      // Keep nextval() functions as-is
      if (valStr.includes('nextval(')) {
        return valStr;
      }
      // Keep array literals as-is
      if (valStr.match(/^'{.*}'$/) || valStr.match(/^ARRAY\[/i)) {
        return valStr;
      }
      // Keep numeric values as-is
      if (!isNaN(Number(valStr)) && valStr.trim() !== '') {
        return valStr;
      }
      // If it's already quoted or has a cast, keep it
      if (valStr.includes("'") || valStr.includes('::')) {
        return valStr;
      }
      // For text, enums, or special values like hex colors, wrap in single quotes
      if (dataType.toLowerCase().includes('text') || dataType.toLowerCase().includes('char') || typeKind === 'e' || valStr.match(/^#[0-9a-fA-F]{6}$/) || valStr.match(/^[A-Z_]+$/)) {
        return `'${valStr.replace(/'/g, "''")}'`;
      }
      // Default: keep as-is
      return valStr;
    };
    // Phase 3: Restore Schema (tables, functions)
    await checkCancellation();
    const schemaErrors = [];
    const skippedTables = [];
    let successfulSchemaCreations = 0;
    if (backupData.schema?.tables && backupData.schema.tables.length > 0) {
      console.log(`🏗️ Restoring database schema (${backupData.schema.tables.length} tables)...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'schema',
        checkpoint_data: {
          table_count: backupData.schema.tables.length
        }
      });
      // Filter out invalid tables and sort by dependencies
      const validTables = backupData.schema.tables.filter((table)=>{
        const tableName = table.name || table.table_name;
        if (!tableName || tableName.trim() === '') {
          skippedTables.push(`<unnamed table: ${JSON.stringify(table).substring(0, 100)}>`);
          console.warn(`⚠️ Skipping table with no name`);
          return false;
        }
        return true;
      });
      const sortedTables = [
        ...validTables
      ].sort((a, b)=>{
        const aHasFk = a.columns?.some((col)=>col.foreign_key);
        const bHasFk = b.columns?.some((col)=>col.foreign_key);
        if (aHasFk && !bHasFk) return 1;
        if (!aHasFk && bHasFk) return -1;
        return 0;
      });
      // Build all table creation statements
      const tableStatements = [];
      const tableCreationAttempts = new Map();
      for (const table of sortedTables){
        const tableName = table.name || table.table_name;
        const schema = table.schema || 'public';
        try {
          const columnDefs = [];
          const constraints = [];
          for (const col of table.columns || []){
            const colName = col.name || col.column_name;
            if (!colName) {
              console.warn(`⚠️ Skipping column with no name in table ${tableName}`);
              continue;
            }
            let colDef = `"${colName}" ${col.data_type || 'text'}`;
            // Nullable
            if (col.is_nullable === false || col.is_nullable === 'NO') {
              colDef += ' NOT NULL';
            }
            // Default value with sanitization
            const defaultVal = col.column_default ?? col.defaultValue ?? col.default;
            if (defaultVal) {
              const formatted = formatDefault(defaultVal, col.data_type, col.type_kind);
              if (formatted) {
                colDef += ` DEFAULT ${formatted}`;
              }
            }
            columnDefs.push(colDef);
          }
          if (columnDefs.length === 0) {
            skippedTables.push(tableName);
            console.warn(`⚠️ Skipping table ${tableName}: no valid columns`);
            continue;
          }
          // Primary key constraint (support composite keys)
          const pkCols = (table.columns || []).filter((c)=>c.is_primary_key || c.is_primary).map((c)=>`"${c.name || c.column_name}"`).filter((n)=>n && n !== '""');
          if (pkCols.length > 0) {
            constraints.push(`PRIMARY KEY (${pkCols.join(', ')})`);
          }
          const allDefs = [
            ...columnDefs,
            ...constraints
          ].join(',\n  ');
          const createTableSQL = `CREATE TABLE IF NOT EXISTS ${schema}."${tableName}" (\n  ${allDefs}\n);`;
          tableStatements.push({
            sql: createTableSQL,
            name: tableName
          });
        } catch (e) {
          const error = `Failed to build schema for ${tableName}: ${e}`;
          console.error(`❌ ${error}`);
          schemaErrors.push(error);
          skippedTables.push(tableName);
        }
      }
      console.log(`📝 Built ${tableStatements.length} table statements, ${skippedTables.length} skipped`);
      // Execute table creations in batches with improved error recovery
      const batchSize = 10;
      for(let i = 0; i < tableStatements.length; i += batchSize){
        const batch = tableStatements.slice(i, i + batchSize);
        const combinedQuery = batch.map((t)=>t.sql).join('\n\n');
        const tableNames = batch.map((t)=>t.name).join(', ');
        try {
          console.log(`Creating batch of ${batch.length} tables: ${tableNames}`);
          const migrationResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${managementToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: `restore_tables_batch_${Math.floor(i / batchSize)}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              query: combinedQuery
            })
          });
          if (migrationResponse.ok) {
            successfulSchemaCreations += batch.length;
            batch.forEach((t)=>tableCreationAttempts.set(t.name, 1));
            console.log(`✅ Created ${batch.length} tables (${successfulSchemaCreations}/${tableStatements.length})`);
          } else {
            const errorData = await migrationResponse.text();
            const error = `Batch migration failed: ${migrationResponse.status} - ${errorData}`;
            console.error(`❌ ${error}`);
            schemaErrors.push(error);
            // Try failed tables individually for better error recovery
            console.log(`🔄 Retrying failed batch tables individually...`);
            for (const tableStmt of batch){
              const retryAttempts = tableCreationAttempts.get(tableStmt.name) || 0;
              if (retryAttempts < 2) {
                try {
                  const retryResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${managementToken}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      name: `restore_table_retry_${tableStmt.name}_${Date.now()}`,
                      query: tableStmt.sql
                    })
                  });
                  if (retryResponse.ok) {
                    successfulSchemaCreations++;
                    tableCreationAttempts.set(tableStmt.name, retryAttempts + 1);
                    console.log(`✅ Successfully created ${tableStmt.name} on retry`);
                  } else {
                    const retryError = await retryResponse.text();
                    console.error(`❌ Failed to create ${tableStmt.name}: ${retryError}`);
                    schemaErrors.push(`${tableStmt.name}: ${retryError}`);
                    tableCreationAttempts.set(tableStmt.name, retryAttempts + 1);
                  }
                  await new Promise((resolve)=>setTimeout(resolve, 500));
                } catch (retryErr) {
                  console.error(`❌ Retry error for ${tableStmt.name}:`, retryErr);
                  tableCreationAttempts.set(tableStmt.name, retryAttempts + 1);
                }
              }
            }
          }
          // Update progress after each batch
          progress = 25 + Math.floor(successfulSchemaCreations / tableStatements.length * 15);
          await supabase.from('restore_operations').update({
            progress_percentage: progress,
            restore_log: [
              `Created ${successfulSchemaCreations}/${tableStatements.length} tables`
            ],
            updated_at: new Date().toISOString()
          }).eq('id', restoreOperationId);
          // Throttle between batches to avoid version collisions
          if (i + batchSize < tableStatements.length) {
            await new Promise((resolve)=>setTimeout(resolve, 2000));
          }
        } catch (e) {
          const error = `Exception creating table batch: ${e}`;
          console.error(`❌ ${error}`);
          schemaErrors.push(error);
          await supabase.from('operation_audit_logs').insert({
            operation_type: 'restore',
            operation_id: restoreOperationId,
            user_id: restoreOp.user_id,
            action: 'schema_restore_error',
            details: {
              batch: tableNames,
              error: String(e)
            }
          });
        }
      }
      console.log(`📊 Schema restoration: ${successfulSchemaCreations}/${tableStatements.length} tables created, ${skippedTables.length} skipped, ${schemaErrors.length} errors`);
      // Only fail if we have zero success
      if (successfulSchemaCreations === 0 && tableStatements.length > 0) {
        throw new Error(`Schema restoration completely failed: 0 of ${tableStatements.length} tables created. First error: ${schemaErrors[0] || 'Unknown error'}`);
      }
      // Warn but don't fail if majority failed
      if (schemaErrors.length > tableStatements.length * 0.5) {
        console.warn(`⚠️ Schema restoration mostly failed: Only ${successfulSchemaCreations} of ${tableStatements.length} tables created`);
      }
      progress = 40;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        restore_log: [
          `Schema phase complete: ${successfulSchemaCreations} tables created`,
          skippedTables.length > 0 ? `Skipped ${skippedTables.length} invalid tables` : '',
          schemaErrors.length > 0 ? `${schemaErrors.length} errors encountered` : ''
        ].filter(Boolean),
        updated_at: new Date().toISOString()
      }).eq('id', restoreOperationId);
    }
    // 🆕 Phase 3.5: Restore Sequences (CRITICAL for auto-increment to work)
    await checkCancellation();
    let sequencesRestored = 0;
    const sequenceErrors = [];
    if (backupData.sequences && backupData.sequences.length > 0) {
      console.log(`🔢 Restoring ${backupData.sequences.length} sequences with current values...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'sequences',
        checkpoint_data: {
          sequence_count: backupData.sequences.length
        }
      });
      for (const seq of backupData.sequences){
        try {
          const seqName = seq.name || seq.sequence_name;
          const schema = seq.schema || 'public';
          // Create sequence
          const createSeqSQL = `
            CREATE SEQUENCE IF NOT EXISTS ${schema}.${seqName}
            AS ${seq.data_type || 'bigint'}
            INCREMENT BY ${seq.increment_by || 1}
            MINVALUE ${seq.min_value || 1}
            MAXVALUE ${seq.max_value || 9223372036854775807}
            START WITH ${seq.start_value || 1}
            ${seq.cycle ? 'CYCLE' : 'NO CYCLE'}
            CACHE ${seq.cache_size || 1};
          `;
          const { error: createError } = await targetClient.rpc('exec_sql', {
            sql: createSeqSQL
          });
          if (createError) {
            console.warn(`  ⚠️ Sequence ${seqName} creation warning:`, createError.message);
          }
          // 🔥 CRITICAL: Set current value to match source
          if (seq.last_value) {
            const setValueSQL = `SELECT setval('${schema}.${seqName}', ${seq.last_value}, ${seq.is_called !== false});`;
            const { error: setError } = await targetClient.rpc('exec_sql', {
              sql: setValueSQL
            });
            if (setError) {
              console.error(`  ❌ Failed to set sequence ${seqName} value:`, setError.message);
              sequenceErrors.push(`${seqName}: ${setError.message}`);
            } else {
              console.log(`  ✅ Sequence ${seqName} restored with value ${seq.last_value}`);
              sequencesRestored++;
            }
          } else {
            sequencesRestored++;
          }
        } catch (error) {
          console.error(`  ❌ Error restoring sequence ${seq.name}:`, error.message);
          sequenceErrors.push(`${seq.name}: ${error.message}`);
        }
      }
      console.log(`✅ Sequences restored: ${sequencesRestored}/${backupData.sequences.length}`);
      await supabase.from('restore_operations').update({
        progress_percentage: 38,
        restore_log: [
          ...restoreOp.restore_log || [],
          `✅ Restored ${sequencesRestored} sequences with current values`
        ].filter(Boolean)
      }).eq('id', restoreOperationId);
    }
    // 🆕 Phase 3.6: Restore CHECK Constraints
    await checkCancellation();
    let checkConstraintsRestored = 0;
    const checkConstraintErrors = [];
    if (backupData.checkConstraints && backupData.checkConstraints.length > 0) {
      console.log(`🔍 Restoring ${backupData.checkConstraints.length} CHECK constraints...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'check_constraints',
        checkpoint_data: {
          constraint_count: backupData.checkConstraints.length
        }
      });
      for (const constraint of backupData.checkConstraints){
        try {
          const constraintName = constraint.constraint_name || constraint.name;
          const tableName = constraint.table_name || constraint.table;
          const checkClause = constraint.check_clause || constraint.definition;
          const schema = constraint.schema || 'public';
          if (!tableName || !checkClause) {
            console.warn(`  ⚠️ Skipping invalid CHECK constraint`);
            continue;
          }
          const addConstraintSQL = `
            ALTER TABLE ${schema}.${tableName}
            ADD CONSTRAINT ${constraintName}
            ${checkClause};
          `;
          const { error } = await targetClient.rpc('exec_sql', {
            sql: addConstraintSQL
          });
          if (error) {
            console.warn(`  ⚠️ CHECK constraint ${constraintName} warning:`, error.message);
            checkConstraintErrors.push(`${constraintName}: ${error.message}`);
          } else {
            console.log(`  ✅ CHECK constraint ${constraintName} restored`);
            checkConstraintsRestored++;
          }
        } catch (error) {
          console.error(`  ❌ Error restoring CHECK constraint:`, error.message);
          checkConstraintErrors.push(`${constraint.constraint_name}: ${error.message}`);
        }
      }
      console.log(`✅ CHECK constraints restored: ${checkConstraintsRestored}/${backupData.checkConstraints.length}`);
    }
    // 🆕 Phase 3.7: Restore UNIQUE Constraints
    await checkCancellation();
    let uniqueConstraintsRestored = 0;
    const uniqueConstraintErrors = [];
    if (backupData.uniqueConstraints && backupData.uniqueConstraints.length > 0) {
      console.log(`🔑 Restoring ${backupData.uniqueConstraints.length} UNIQUE constraints...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'unique_constraints',
        checkpoint_data: {
          constraint_count: backupData.uniqueConstraints.length
        }
      });
      for (const constraint of backupData.uniqueConstraints){
        try {
          const constraintName = constraint.constraint_name || constraint.name;
          const tableName = constraint.table_name || constraint.table;
          const columns = constraint.columns || [];
          const schema = constraint.schema || 'public';
          if (!tableName || !columns || columns.length === 0) {
            console.warn(`  ⚠️ Skipping invalid UNIQUE constraint`);
            continue;
          }
          const addConstraintSQL = `
            ALTER TABLE ${schema}.${tableName}
            ADD CONSTRAINT ${constraintName}
            UNIQUE (${columns.join(', ')});
          `;
          const { error } = await targetClient.rpc('exec_sql', {
            sql: addConstraintSQL
          });
          if (error) {
            console.warn(`  ⚠️ UNIQUE constraint ${constraintName} warning:`, error.message);
            uniqueConstraintErrors.push(`${constraintName}: ${error.message}`);
          } else {
            console.log(`  ✅ UNIQUE constraint ${constraintName} restored`);
            uniqueConstraintsRestored++;
          }
        } catch (error) {
          console.error(`  ❌ Error restoring UNIQUE constraint:`, error.message);
          uniqueConstraintErrors.push(`${constraint.constraint_name}: ${error.message}`);
        }
      }
      console.log(`✅ UNIQUE constraints restored: ${uniqueConstraintsRestored}/${backupData.uniqueConstraints.length}`);
    }
    // 🆕 Phase 3.8: Restore Indexes (CRITICAL for performance!)
    await checkCancellation();
    let indexesRestored = 0;
    const indexErrors = [];
    if (backupData.schema?.indexes && backupData.schema.indexes.length > 0) {
      console.log(`📊 Restoring ${backupData.schema.indexes.length} indexes for performance...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'indexes',
        checkpoint_data: {
          index_count: backupData.schema.indexes.length
        }
      });
      // Filter out primary key and unique constraint indexes (auto-created)
      const manualIndexes = backupData.schema.indexes.filter((idx)=>{
        const indexName = idx.name || idx.indexname;
        // Skip system-generated constraint indexes
        if (indexName?.endsWith('_pkey') || indexName?.includes('_key')) {
          console.log(`  ⏭️ Skipping auto-generated index: ${indexName}`);
          return false;
        }
        return true;
      });
      console.log(`  📋 ${manualIndexes.length} custom indexes to restore (${backupData.schema.indexes.length - manualIndexes.length} auto-generated skipped)`);
      for (const idx of manualIndexes){
        try {
          const indexName = idx.name || idx.indexname;
          const tableName = idx.table || idx.table_name || idx.tablename;
          const schema = idx.schema || idx.schemaname || 'public';
          if (!indexName || !tableName) {
            console.warn(`  ⚠️ Skipping invalid index (missing name or table)`);
            continue;
          }
          // Build CREATE INDEX statement
          let createIndexSQL = '';
          // Check if we have a full definition
          if (idx.definition) {
            // Use the full definition (most reliable)
            createIndexSQL = idx.definition;
            // Ensure it ends with semicolon
            if (!createIndexSQL.trim().endsWith(';')) {
              createIndexSQL += ';';
            }
          } else {
            // Build index from components
            const isUnique = idx.is_unique || idx.unique || false;
            const indexMethod = idx.index_type || idx.index_method || 'btree';
            const columns = idx.columns || idx.column_names || [];
            if (!columns || columns.length === 0) {
              console.warn(`  ⚠️ Skipping index ${indexName}: no columns defined`);
              continue;
            }
            // Handle different column formats
            let columnList = '';
            if (Array.isArray(columns)) {
              // Handle expression indexes vs simple column indexes
              columnList = columns.map((col)=>{
                if (typeof col === 'string') {
                  // Simple column name - quote it
                  return col.includes('(') ? col : `"${col}"`;
                } else if (col.name) {
                  return `"${col.name}"`;
                } else if (col.expression) {
                  return col.expression;
                }
                return col;
              }).join(', ');
            } else if (typeof columns === 'string') {
              columnList = columns;
            }
            // Build the CREATE INDEX statement
            const uniqueKeyword = isUnique ? 'UNIQUE ' : '';
            const methodClause = indexMethod && indexMethod.toLowerCase() !== 'btree' ? ` USING ${indexMethod.toUpperCase()}` : '';
            // Handle partial indexes (WHERE clause)
            const whereClause = idx.where || idx.predicate || idx.condition || '';
            const whereSQL = whereClause ? ` WHERE ${whereClause}` : '';
            createIndexSQL = `CREATE ${uniqueKeyword}INDEX IF NOT EXISTS "${indexName}" ON ${schema}."${tableName}"${methodClause} (${columnList})${whereSQL};`;
          }
          console.log(`  🔨 Creating index: ${indexName} on ${tableName}`);
          // Execute index creation
          const { error } = await targetClient.rpc('exec_sql', {
            sql: createIndexSQL
          });
          if (error) {
            console.warn(`  ⚠️ Index ${indexName} warning:`, error.message);
            indexErrors.push(`${indexName}: ${error.message}`);
          // Don't fail the entire restore for index errors
          // Indexes are performance, not functionality
          } else {
            console.log(`  ✅ Index ${indexName} created`);
            indexesRestored++;
          }
        } catch (error) {
          console.error(`  ❌ Error restoring index ${idx.name}:`, error.message);
          indexErrors.push(`${idx.name}: ${error.message}`);
        // Continue with other indexes
        }
      }
      console.log(`✅ Indexes restored: ${indexesRestored}/${manualIndexes.length}`);
      if (indexErrors.length > 0) {
        console.warn(`⚠️ Index errors (${indexErrors.length}):`, indexErrors.slice(0, 5));
      }
      await supabase.from('restore_operations').update({
        progress_percentage: 40,
        restore_log: [
          ...restoreOp.restore_log || [],
          `✅ Restored ${indexesRestored} indexes for performance`,
          ...indexErrors.length > 0 ? [
            `⚠️ ${indexErrors.length} indexes had warnings`
          ] : []
        ].filter(Boolean)
      }).eq('id', restoreOperationId);
    } else {
      console.log(`ℹ️ No custom indexes to restore`);
    }
    // Phase 4: Restore RLS Policies
    await checkCancellation();
    let rlsPoliciesCreated = 0;
    const rlsErrors = [];
    if (backupData.schema?.policies && backupData.schema.policies.length > 0) {
      console.log(`🔒 Restoring RLS policies (${backupData.schema.policies.length} policies)...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'rls_policies',
        checkpoint_data: {
          policy_count: backupData.schema.policies.length
        }
      });
      // First, enable RLS on all tables that have policies
      const tablesWithPolicies = new Set();
      backupData.schema.policies.forEach((policy)=>{
        if (policy.tablename) {
          tablesWithPolicies.add(policy.tablename);
        }
      });
      // Also include tables marked as rls_enabled in backup
      if (backupData.schema?.tables) {
        backupData.schema.tables.forEach((table)=>{
          if (table.rls_enabled && table.name) {
            tablesWithPolicies.add(table.name);
          }
        });
      }
      if (tablesWithPolicies.size > 0) {
        console.log(`🔐 Enabling RLS on ${tablesWithPolicies.size} tables...`);
        const rlsEnableStatements = Array.from(tablesWithPolicies).map((tableName)=>`ALTER TABLE public."${tableName}" ENABLE ROW LEVEL SECURITY;`).join('\n');
        try {
          const rlsEnableResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${managementToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: `restore_enable_rls_${Date.now()}`,
              query: rlsEnableStatements
            })
          });
          if (rlsEnableResponse.ok) {
            console.log(`✅ Successfully enabled RLS on ${tablesWithPolicies.size} tables`);
          } else {
            const errorText = await rlsEnableResponse.text();
            console.warn(`⚠️ RLS enable had issues: ${errorText}`);
            rlsErrors.push(`RLS enable warning: ${errorText}`);
          }
        } catch (e) {
          console.warn(`⚠️ Failed to enable RLS:`, e);
          rlsErrors.push(`RLS enable error: ${e}`);
        }
      }
      // Batch RLS policy creations
      const policyStatements = [];
      for (const policy of backupData.schema.policies){
        if (!policy.tablename || !policy.policyname) continue;
        try {
          const schema = policy.schemaname || 'public';
          const roles = policy.roles?.join(', ') || 'public';
          const command = policy.cmd || 'ALL';
          let policySQL = `CREATE POLICY "${policy.policyname}"
ON ${schema}."${policy.tablename}"
AS ${policy.permissive || 'PERMISSIVE'}
FOR ${command}
TO ${roles}`;
          if (policy.qual) {
            policySQL += `\nUSING (${policy.qual})`;
          }
          if (policy.with_check) {
            policySQL += `\nWITH CHECK (${policy.with_check})`;
          }
          policySQL += ';';
          policyStatements.push(policySQL);
        } catch (e) {
          const errorMsg = `Error building policy ${policy.policyname}: ${e}`;
          console.error(`❌ ${errorMsg}`);
          rlsErrors.push(errorMsg);
        }
      }
      // Create policies in batches
      const batchSize = 15;
      for(let i = 0; i < policyStatements.length; i += batchSize){
        const batch = policyStatements.slice(i, i + batchSize);
        const combinedQuery = batch.join('\n\n');
        try {
          const migrationResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${managementToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: `restore_policies_batch_${Math.floor(i / batchSize)}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              query: combinedQuery
            })
          });
          if (migrationResponse.ok) {
            rlsPoliciesCreated += batch.length;
            console.log(`✅ Created ${batch.length} RLS policies (${rlsPoliciesCreated}/${policyStatements.length})`);
          } else {
            const errorText = await migrationResponse.text();
            const error = `Policy batch failed: ${errorText}`;
            console.error(`❌ ${error}`);
            rlsErrors.push(error);
          }
          if (i + batchSize < policyStatements.length) {
            await new Promise((resolve)=>setTimeout(resolve, 1500));
          }
        } catch (e) {
          const error = `Exception creating policy batch: ${e}`;
          console.error(`❌ ${error}`);
          rlsErrors.push(error);
        }
      }
      console.log(`📊 RLS policies: ${rlsPoliciesCreated}/${policyStatements.length} created, ${rlsErrors.length} errors`);
      progress = 45;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        restore_log: [
          `RLS policies: ${rlsPoliciesCreated}/${policyStatements.length} created`
        ],
        updated_at: new Date().toISOString()
      }).eq('id', restoreOperationId);
    }
    // Phase 5: Restore Database Functions (OPTIMIZED with batching & timeouts)
    await checkCancellation();
    let dbFunctionsCreated = 0;
    const dbFuncErrors = [];
    if (backupData.schema?.functions && backupData.schema.functions.length > 0) {
      console.log(`⚙️ Restoring database functions (${backupData.schema.functions.length} functions)...`);
      console.log(`🚀 Using BATCHED mode for faster restoration`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'database_functions',
        checkpoint_data: {
          function_count: backupData.schema.functions.length
        }
      });
      const functionsToRestore = backupData.schema.functions.filter((f)=>f.name && !f.is_trigger);
      const totalFunctions = functionsToRestore.length;
      // 🆕 SUPER-AGGRESSIVE BATCHING: Create 50 functions per API call for speed
      // Note: Large batches risk migration failures, but we have individual retry fallback
      const BATCH_SIZE = 50;
      for(let batchStart = 0; batchStart < totalFunctions; batchStart += BATCH_SIZE){
        await checkCancellation();
        const batch = functionsToRestore.slice(batchStart, batchStart + BATCH_SIZE);
        const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(totalFunctions / BATCH_SIZE);
        console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} functions)`);
        // Build batch SQL
        const batchSQL = [];
        const batchFunctionNames = [];
        for (const func of batch){
          try {
            const schema = func.schema || 'public';
            const args = func.arguments || '';
            const returnType = func.return_type || 'void';
            const language = func.language || 'sql';
            const definition = func.definition || '';
            const securityDefiner = func.security_definer ? 'SECURITY DEFINER' : '';
            const functionSQL = `CREATE OR REPLACE FUNCTION ${schema}."${func.name}"(${args})
RETURNS ${returnType}
LANGUAGE ${language}
${securityDefiner}
AS $$
${definition}
$$;`;
            batchSQL.push(functionSQL);
            batchFunctionNames.push(func.name);
          } catch (e) {
            console.error(`❌ Error building function ${func.name}: ${e}`);
            dbFuncErrors.push(`${func.name}: build error`);
          }
        }
        if (batchSQL.length === 0) {
          console.warn(`⚠️ Batch ${batchNum} had no valid functions`);
          continue;
        }
        // Execute batch with timeout
        try {
          const combinedSQL = batchSQL.join('\n\n');
          const migrationResponse = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${managementToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: `restore_functions_batch_${batchNum}_${Date.now()}`,
              query: combinedSQL
            })
          }, 30000 // 30 second timeout
          );
          if (migrationResponse.ok) {
            dbFunctionsCreated += batchSQL.length;
            console.log(`✅ Batch ${batchNum} created ${batchSQL.length} functions (${dbFunctionsCreated}/${totalFunctions})`);
          } else {
            const errorText = await migrationResponse.text();
            console.error(`❌ Batch ${batchNum} failed: ${errorText}`);
            // Try functions individually in this batch
            console.log(`🔄 Retrying batch ${batchNum} functions individually...`);
            for(let i = 0; i < batchSQL.length; i++){
              try {
                const individualResponse = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${managementToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    name: `restore_function_retry_${batchFunctionNames[i]}_${Date.now()}`,
                    query: batchSQL[i]
                  })
                }, 30000);
                if (individualResponse.ok) {
                  dbFunctionsCreated++;
                  console.log(`  ✅ ${batchFunctionNames[i]} restored individually`);
                } else {
                  const indivError = await individualResponse.text();
                  dbFuncErrors.push(`${batchFunctionNames[i]}: ${indivError.substring(0, 100)}`);
                  console.warn(`  ⚠️ ${batchFunctionNames[i]} failed: ${indivError.substring(0, 100)}`);
                }
                await new Promise((resolve)=>setTimeout(resolve, 150));
              } catch (e) {
                dbFuncErrors.push(`${batchFunctionNames[i]}: ${e.message}`);
                console.error(`  ❌ ${batchFunctionNames[i]} exception: ${e.message}`);
              }
            }
          }
        } catch (e) {
          console.error(`❌ Batch ${batchNum} exception: ${e.message}`);
          batchFunctionNames.forEach((name)=>{
            dbFuncErrors.push(`${name}: batch exception - ${e.message}`);
          });
        }
        // Update progress
        const funcProgress = 45 + Math.floor(dbFunctionsCreated / totalFunctions * 10); // 45% to 55%
        await supabase.from('restore_operations').update({
          progress_percentage: funcProgress,
          restore_log: [
            `Restoring database functions: ${dbFunctionsCreated}/${totalFunctions} (batch ${batchNum}/${totalBatches})`
          ],
          updated_at: new Date().toISOString()
        }).eq('id', restoreOperationId);
        // Minimal delay between batches (aggressive optimization for speed)
        if (batchStart + BATCH_SIZE < totalFunctions) {
          await new Promise((resolve)=>setTimeout(resolve, 200));
        }
      }
      console.log(`📊 Database functions: ${dbFunctionsCreated}/${totalFunctions} created, ${dbFuncErrors.length} errors`);
      if (dbFuncErrors.length > 0) {
        console.log(`⚠️ First 5 function errors:`, dbFuncErrors.slice(0, 5));
      }
      progress = 55;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        restore_log: [
          `Database functions complete: ${dbFunctionsCreated}/${totalFunctions} created, ${dbFuncErrors.length} errors`
        ],
        updated_at: new Date().toISOString()
      }).eq('id', restoreOperationId);
    }
    // 🆕 Phase 5.5: Restore Views (depends on tables and functions)
    await checkCancellation();
    let viewsRestored = 0;
    const viewErrors = [];
    if (backupData.views && backupData.views.length > 0) {
      console.log(`👁️ Restoring ${backupData.views.length} views...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'views',
        checkpoint_data: {
          view_count: backupData.views.length
        }
      });
      for (const view of backupData.views){
        try {
          const viewName = view.name || view.table_name;
          const schema = view.schema || 'public';
          const definition = view.definition || view.view_definition;
          if (!viewName || !definition) {
            console.warn(`  ⚠️ Skipping invalid view`);
            continue;
          }
          // Create view
          const createViewSQL = `CREATE OR REPLACE VIEW ${schema}.${viewName} AS ${definition};`;
          const { error } = await targetClient.rpc('exec_sql', {
            sql: createViewSQL
          });
          if (error) {
            console.warn(`  ⚠️ View ${viewName} warning:`, error.message);
            viewErrors.push(`${viewName}: ${error.message}`);
          } else {
            console.log(`  ✅ View ${viewName} restored`);
            viewsRestored++;
          }
          // Add comment if exists
          if (view.comment) {
            const commentSQL = `COMMENT ON VIEW ${schema}.${viewName} IS ${view.comment};`;
            await targetClient.rpc('exec_sql', {
              sql: commentSQL
            });
          }
        } catch (error) {
          console.error(`  ❌ Error restoring view ${view.name}:`, error.message);
          viewErrors.push(`${view.name}: ${error.message}`);
        }
      }
      console.log(`✅ Views restored: ${viewsRestored}/${backupData.views.length}`);
      await supabase.from('restore_operations').update({
        progress_percentage: 57,
        restore_log: [
          ...restoreOp.restore_log || [],
          `✅ Restored ${viewsRestored} views`
        ].filter(Boolean)
      }).eq('id', restoreOperationId);
    }
    // 🆕 Phase 5.6: Restore Materialized Views
    await checkCancellation();
    let materializedViewsRestored = 0;
    const materializedViewErrors = [];
    if (backupData.materializedViews && backupData.materializedViews.length > 0) {
      console.log(`💎 Restoring ${backupData.materializedViews.length} materialized views...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'materialized_views',
        checkpoint_data: {
          view_count: backupData.materializedViews.length
        }
      });
      for (const view of backupData.materializedViews){
        try {
          const viewName = view.name || view.matviewname;
          const schema = view.schema || view.schemaname || 'public';
          const definition = view.definition || view.view_definition;
          if (!viewName || !definition) {
            console.warn(`  ⚠️ Skipping invalid materialized view`);
            continue;
          }
          // Create materialized view
          const createMatViewSQL = `CREATE MATERIALIZED VIEW IF NOT EXISTS ${schema}.${viewName} AS ${definition};`;
          const { error } = await targetClient.rpc('exec_sql', {
            sql: createMatViewSQL
          });
          if (error) {
            console.warn(`  ⚠️ Materialized view ${viewName} warning:`, error.message);
            materializedViewErrors.push(`${viewName}: ${error.message}`);
          } else {
            console.log(`  ✅ Materialized view ${viewName} restored`);
            // Refresh the materialized view to populate it
            try {
              const refreshSQL = `REFRESH MATERIALIZED VIEW ${schema}.${viewName};`;
              await targetClient.rpc('exec_sql', {
                sql: refreshSQL
              });
              console.log(`  🔄 Materialized view ${viewName} refreshed`);
            } catch (refreshError) {
              console.warn(`  ⚠️ Could not refresh materialized view ${viewName}:`, refreshError.message);
            }
            materializedViewsRestored++;
          }
          // Add comment if exists
          if (view.comment) {
            const commentSQL = `COMMENT ON MATERIALIZED VIEW ${schema}.${viewName} IS ${view.comment};`;
            await targetClient.rpc('exec_sql', {
              sql: commentSQL
            });
          }
        } catch (error) {
          console.error(`  ❌ Error restoring materialized view ${view.name}:`, error.message);
          materializedViewErrors.push(`${view.name}: ${error.message}`);
        }
      }
      console.log(`✅ Materialized views restored: ${materializedViewsRestored}/${backupData.materializedViews.length}`);
      await supabase.from('restore_operations').update({
        progress_percentage: 59,
        restore_log: [
          ...restoreOp.restore_log || [],
          `✅ Restored ${materializedViewsRestored} materialized views`
        ].filter(Boolean)
      }).eq('id', restoreOperationId);
    }
    // Phase 6: Restore Triggers with enhanced error handling and validation
    await checkCancellation();
    let triggersCreated = 0;
    let triggersFailed = 0;
    const triggerErrors = [];
    const triggerValidation = [];
    if (backupData.triggers && backupData.triggers.length > 0) {
      console.log(`⚡ Restoring triggers (${backupData.triggers.length} triggers)...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'triggers',
        checkpoint_data: {
          trigger_count: backupData.triggers.length
        }
      });
      // Group triggers by their function dependencies
      const triggersByFunction = new Map();
      for (const trigger of backupData.triggers){
        const funcKey = `${trigger.functionSchema || 'public'}.${trigger.functionName || 'unknown'}`;
        if (!triggersByFunction.has(funcKey)) {
          triggersByFunction.set(funcKey, []);
        }
        triggersByFunction.get(funcKey).push(trigger);
      }
      console.log(`📋 Grouped ${backupData.triggers.length} triggers by ${triggersByFunction.size} functions`);
      for(let i = 0; i < backupData.triggers.length; i++){
        await checkCancellation();
        const trigger = backupData.triggers[i];
        const triggerKey = `${trigger.schema}.${trigger.table}.${trigger.name}`;
        const triggerProgress = 48 + Math.floor(i / backupData.triggers.length * 2);
        await supabase.from('restore_operations').update({
          progress_percentage: triggerProgress,
          restore_log: [
            `Creating trigger ${i + 1}/${backupData.triggers.length}: ${triggerKey}`
          ],
          updated_at: new Date().toISOString()
        }).eq('id', restoreOperationId);
        console.log(`⚡ Processing trigger ${i + 1}/${backupData.triggers.length}: ${triggerKey}`);
        try {
          // Validate trigger function exists first
          const funcName = trigger.functionName || 'unknown';
          const funcSchema = trigger.functionSchema || 'public';
          const checkFunctionQuery = `
            SELECT EXISTS (
              SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON p.pronamespace = n.oid
              WHERE p.proname = '${funcName}' AND n.nspname = '${funcSchema}'
            ) as exists;
          `;
          const funcCheckResult = await targetClient.rpc('exec_read_only_sql', {
            sql: checkFunctionQuery
          });
          const funcCheck = funcCheckResult.error ? {
            data: [
              {
                exists: false
              }
            ]
          } : funcCheckResult;
          if (!funcCheck?.data?.[0]?.exists) {
            triggersFailed++;
            const error = `Function ${funcSchema}.${funcName}() does not exist`;
            triggerErrors.push({
              trigger: triggerKey,
              error,
              phase: 'validation'
            });
            triggerValidation.push({
              trigger: triggerKey,
              valid: false,
              reason: error
            });
            console.warn(`⚠️ Validation failed for ${triggerKey}: ${error}`);
            continue;
          }
          // Use pg_get_triggerdef if available, otherwise reconstruct
          const triggerDef = trigger.definition || `CREATE TRIGGER ${trigger.name} ${trigger.timing} ${trigger.event} ON ${trigger.schema}.${trigger.table} FOR EACH ROW EXECUTE FUNCTION ${funcSchema}.${funcName}()`;
          // Attempt creation with retry logic
          let attempt = 0;
          let success = false;
          let lastError = null;
          while(attempt < 3 && !success){
            attempt++;
            try {
              const migrationResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${managementToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  name: `restore_trigger_${trigger.name}_${Date.now()}`,
                  query: triggerDef
                })
              });
              if (!migrationResponse.ok) {
                const errorText = await migrationResponse.text();
                lastError = new Error(errorText);
                // Check if it's a transient error worth retrying
                const isTransient = errorText.includes('temporarily unavailable') || errorText.includes('timeout') || errorText.includes('connection');
                if (isTransient && attempt < 3) {
                  const delay = Math.pow(2, attempt) * 1000;
                  console.log(`⏳ Retry ${attempt}/3 for ${triggerKey} after ${delay}ms...`);
                  await new Promise((resolve)=>setTimeout(resolve, delay));
                  continue;
                }
                throw lastError;
              }
              success = true;
              triggersCreated++;
              triggerValidation.push({
                trigger: triggerKey,
                valid: true
              });
              console.log(`✅ Created trigger ${triggerKey}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
            } catch (error) {
              lastError = error;
              if (attempt >= 3) break;
            }
          }
          if (!success && lastError) {
            throw lastError;
          }
          await new Promise((resolve)=>setTimeout(resolve, 500));
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.warn(`⚠️ Could not restore trigger ${trigger.trigger_name}: ${errorMsg}`);
          triggerErrors.push(`${trigger.trigger_name}: ${errorMsg}`);
          continue;
        }
      }
      console.log(`📊 Triggers: ${triggersCreated}/${backupData.triggers.length} created, ${triggerErrors.length} errors`);
      // Mark triggers phase as complete
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'triggers_complete',
        checkpoint_data: {
          triggers_created: triggersCreated,
          total_triggers: backupData.triggers.length,
          errors: triggerErrors.length
        },
        completed_at: new Date().toISOString()
      });
      progress = 50;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        restore_log: [
          `Triggers: ${triggersCreated}/${backupData.triggers.length} created, ${triggerErrors.length} errors`
        ]
      }).eq('id', restoreOperationId);
    }
    // Phase 7: Restore Data (only if schema phase had minimal success)
    await checkCancellation();
    const dataErrors = [];
    let successfulTables = 0;
    let totalRowsRestored = 0;
    if (backupData.data && successfulSchemaCreations > 0) {
      console.log('💾 Restoring data...');
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'data',
        checkpoint_data: {
          table_count: Object.keys(backupData.data).length
        }
      });
      const tables = Object.keys(backupData.data);
      for(let i = 0; i < tables.length; i++){
        const tableName = tables[i];
        const tableData = backupData.data[tableName];
        if (!tableData._export_error && Array.isArray(tableData)) {
          try {
            // First verify table exists in target
            const { data: tableExists } = await targetClient.from(tableName).select('*').limit(0);
            if (tableExists !== null) {
              const { error } = await targetClient.from(tableName).insert(tableData);
              if (error) {
                const errorMsg = `Error restoring data to ${tableName}: ${error.message}`;
                console.error(`❌ ${errorMsg}`);
                dataErrors.push(errorMsg);
                await supabase.from('operation_audit_logs').insert({
                  operation_type: 'restore',
                  operation_id: restoreOperationId,
                  user_id: restoreOp.user_id,
                  action: 'data_restore_error',
                  details: {
                    table: tableName,
                    error: error.message,
                    rows: tableData.length
                  }
                });
              } else {
                successfulTables++;
                totalRowsRestored += tableData.length;
                console.log(`✅ Restored ${tableData.length} rows to ${tableName}`);
              }
            } else {
              const errorMsg = `Table ${tableName} does not exist in target project`;
              console.error(`❌ ${errorMsg}`);
              dataErrors.push(errorMsg);
            }
          } catch (e) {
            const errorMsg = `Exception restoring ${tableName}: ${e}`;
            console.error(`❌ ${errorMsg}`);
            dataErrors.push(errorMsg);
          }
        }
        // Only update progress after each table attempt
        progress = 50 + Math.floor(successfulTables / tables.length * 30);
        await supabase.from('restore_operations').update({
          progress_percentage: progress,
          restore_log: [
            `Data phase: ${successfulTables}/${tables.length} tables restored, ${totalRowsRestored} rows total`
          ]
        }).eq('id', restoreOperationId);
      }
      console.log(`📊 Data restoration summary: ${successfulTables}/${tables.length} tables, ${totalRowsRestored} rows, ${dataErrors.length} errors`);
      // Fail if no tables were restored successfully
      if (successfulTables === 0 && tables.length > 0) {
        throw new Error(`Data restoration completely failed: 0 of ${tables.length} tables restored. Errors: ${dataErrors.slice(0, 3).join('; ')}`);
      }
      // Warn if significant data loss
      if (dataErrors.length > tables.length * 0.3) {
        console.warn(`⚠️ High error rate: ${dataErrors.length} errors out of ${tables.length} tables`);
      }
    }
    // Phase 8: Restore Storage
    await checkCancellation();
    let bucketsCreated = 0;
    let policiesCreated = 0;
    const storageErrors = [];
    if (backupData.storage && backupData.storage.buckets && !backupData.storage.error) {
      console.log(`🗄️ Restoring storage (${backupData.storage.buckets.length} buckets)...`);
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'storage',
        checkpoint_data: {
          bucket_count: backupData.storage.buckets.length
        }
      });
      for (const bucket of backupData.storage.buckets){
        try {
          // Create bucket in target project
          const { error: bucketError } = await targetClient.storage.createBucket(bucket.id, {
            public: bucket.public,
            fileSizeLimit: bucket.file_size_limit,
            allowedMimeTypes: bucket.allowed_mime_types
          });
          if (bucketError && !bucketError.message.includes('already exists')) {
            const errorMsg = `Failed to create bucket ${bucket.id}: ${bucketError.message}`;
            console.error(`❌ ${errorMsg}`);
            storageErrors.push(errorMsg);
          } else {
            bucketsCreated++;
            console.log(`✅ Created bucket: ${bucket.id}`);
          }
          // Restore bucket policies if available
          if (backupData.storage.policies) {
            const bucketPolicies = backupData.storage.policies.filter((p)=>p.bucket_id === bucket.id);
            for (const policy of bucketPolicies){
              try {
                // Use Management API to create storage policies
                const policySQL = `
CREATE POLICY "${policy.name}"
ON storage.objects
FOR ${policy.command || 'ALL'}
${policy.roles ? `TO ${policy.roles.join(', ')}` : ''}
${policy.using_expression ? `USING (${policy.using_expression})` : ''}
${policy.with_check_expression ? `WITH CHECK (${policy.with_check_expression})` : ''};`;
                const policyResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/database/migrations`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${managementToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    name: `restore_storage_policy_${policy.name}_${Date.now()}`,
                    query: policySQL
                  })
                });
                if (policyResponse.ok) {
                  policiesCreated++;
                  console.log(`✅ Created storage policy: ${policy.name}`);
                } else {
                  const errorText = await policyResponse.text();
                  console.warn(`⚠️ Could not create storage policy ${policy.name}: ${errorText}`);
                }
              } catch (e) {
                console.warn(`⚠️ Error creating storage policy ${policy.name}:`, e);
              }
            }
          }
        } catch (e) {
          const errorMsg = `Exception restoring bucket ${bucket.id}: ${e}`;
          console.error(`❌ ${errorMsg}`);
          storageErrors.push(errorMsg);
        }
      }
      console.log(`📊 Storage restoration: ${bucketsCreated}/${backupData.storage.buckets.length} buckets, ${policiesCreated} policies, ${storageErrors.length} errors`);
      progress = 85;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        restore_log: [
          `Storage: ${bucketsCreated} buckets, ${policiesCreated} policies created`
        ]
      }).eq('id', restoreOperationId);
    }
    // Phase 9: Restore Edge Functions
    await checkCancellation();
    let functionsCreated = 0;
    const funcErrors = [];
    const edgeFunctionWarnings = [];
    if (backupData.functions && backupData.functions.functions && !backupData.functions.error) {
      console.log(`⚡ Restoring edge functions (${backupData.functions.functions.length} functions)...`);
      // 🚨 IMPORTANT WARNING: Edge function code must be deployed separately
      console.warn('⚠️ IMPORTANT: Edge function metadata will be created, but code must be deployed separately!');
      console.warn('⚠️ After restore completes, you must manually deploy each function using:');
      console.warn('   supabase functions deploy <function-name> --project-ref <target-project-ref>');
      edgeFunctionWarnings.push('Edge Functions created but CODE NOT DEPLOYED');
      edgeFunctionWarnings.push('You must manually deploy each function after restore');
      edgeFunctionWarnings.push('Use: supabase functions deploy <name> --project-ref <ref>');
      await supabase.from('restore_checkpoints').insert({
        restore_operation_id: restoreOperationId,
        phase: 'edge_functions',
        checkpoint_data: {
          function_count: backupData.functions.functions.length,
          warning: 'Code deployment required - see restore logs for instructions'
        }
      });
      for (const func of backupData.functions.functions){
        if (!func.slug) continue;
        try {
          // Create edge function using Management API
          const createResponse = await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/functions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${managementToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              slug: func.slug,
              name: func.name || func.slug,
              verify_jwt: func.verify_jwt !== false,
              import_map: func.import_map !== false
            })
          });
          if (createResponse.ok) {
            functionsCreated++;
            console.log(`✅ Created edge function: ${func.slug}`);
            console.log(`   📝 TODO: Deploy code with: supabase functions deploy ${func.slug} --project-ref ${restoreOp.target_project_id}`);
            // 🚨 CRITICAL: Function code deployment requires additional steps
            // This creates the function entry but code needs to be deployed separately
            // The backup contains function metadata but not the actual deployable code
            edgeFunctionWarnings.push(`${func.slug}: metadata created, code deployment required`);
          } else {
            const errorText = await createResponse.text();
            if (!errorText.includes('already exists')) {
              const error = `Function ${func.slug} failed: ${errorText}`;
              console.warn(`⚠️ ${error}`);
              funcErrors.push(error);
            } else {
              functionsCreated++;
              console.log(`✅ Function ${func.slug} already exists`);
            }
          }
          await new Promise((resolve)=>setTimeout(resolve, 1000));
        } catch (e) {
          const error = `Exception creating function ${func.slug}: ${e}`;
          console.error(`❌ ${error}`);
          funcErrors.push(error);
        }
      }
      console.log(`📊 Edge functions: ${functionsCreated}/${backupData.functions.functions.length} created, ${funcErrors.length} errors`);
      console.warn('⚠️ CRITICAL: Function code needs to be deployed separately - see warnings above');
      console.warn(`⚠️ Deploy each function with: supabase functions deploy <name> --project-ref ${restoreOp.target_project_id}`);
      progress = 88;
      await supabase.from('restore_operations').update({
        progress_percentage: progress,
        restore_log: [
          `Edge functions: ${functionsCreated} created (metadata only)`,
          '⚠️ MANUAL DEPLOYMENT REQUIRED - See warnings'
        ],
        warnings: edgeFunctionWarnings
      }).eq('id', restoreOperationId);
    }
    // Phase 10: Restore Auth Configuration
    await checkCancellation();
    if (backupData.authConfig && !backupData.authConfig.error) {
      console.log('🔐 Restoring auth configuration...');
      try {
        await fetch(`https://api.supabase.com/v1/projects/${restoreOp.target_project_id}/config/auth`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${managementToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(backupData.authConfig.settings)
        });
        console.log('✅ Auth configuration restored');
      } catch (e) {
        console.warn('⚠️ Could not restore auth configuration:', e);
      }
      progress = 92;
      await supabase.from('restore_operations').update({
        progress_percentage: progress
      }).eq('id', restoreOperationId);
    }
    // Phase 11: Restore Project Configuration
    await checkCancellation();
    if (backupData.projectConfig && !backupData.projectConfig.error) {
      console.log('⚙️ Restoring project configuration...');
      // Project config restoration logic here
      progress = 95;
      await supabase.from('restore_operations').update({
        progress_percentage: progress
      }).eq('id', restoreOperationId);
    }
    // Complete restore
    const finalSummary = {
      success: true,
      tables_created: successfulSchemaCreations || 0,
      tables_restored: successfulTables || 0,
      total_rows: totalRowsRestored || 0,
      types_created: typesCreated || 0,
      rls_policies_created: rlsPoliciesCreated || 0,
      db_functions_created: dbFunctionsCreated || 0,
      triggers_created: triggersCreated || 0,
      storage_buckets_created: bucketsCreated || 0,
      storage_policies_created: policiesCreated || 0,
      edge_functions_created: functionsCreated || 0,
      schema_errors: schemaErrors.length,
      data_errors: dataErrors.length,
      rls_errors: rlsErrors.length,
      db_func_errors: dbFuncErrors.length,
      trigger_errors: triggerErrors.length,
      storage_errors: storageErrors.length,
      func_errors: funcErrors.length,
      target_project_id: restoreOp.target_project_id
    };
    await supabase.from('restore_checkpoints').insert({
      restore_operation_id: restoreOperationId,
      phase: 'completed',
      completed_at: new Date().toISOString(),
      checkpoint_data: finalSummary
    });
    await supabase.from('operation_audit_logs').insert({
      operation_type: 'restore',
      operation_id: restoreOperationId,
      user_id: restoreOp.user_id,
      action: 'restore_completed',
      details: finalSummary
    });
    const restoreLogMessages = [
      `Restore completed successfully`,
      `Schema: ${successfulSchemaCreations} tables, ${typesCreated} types`,
      `Data: ${successfulTables} tables populated, ${totalRowsRestored} rows`,
      `Security: ${rlsPoliciesCreated} RLS policies`,
      `Functions: ${dbFunctionsCreated} DB functions, ${triggersCreated} triggers, ${functionsCreated} edge functions`,
      `Storage: ${bucketsCreated} buckets, ${policiesCreated} policies`,
      ...schemaErrors.length > 0 ? [
        `Schema errors: ${schemaErrors.length}`
      ] : [],
      ...dataErrors.length > 0 ? [
        `Data errors: ${dataErrors.length}`
      ] : [],
      ...rlsErrors.length > 0 ? [
        `RLS errors: ${rlsErrors.length}`
      ] : [],
      ...dbFuncErrors.length > 0 ? [
        `DB function errors: ${dbFuncErrors.length}`
      ] : [],
      ...triggerErrors.length > 0 ? [
        `Trigger errors: ${triggerErrors.length}`
      ] : [],
      ...storageErrors.length > 0 ? [
        `Storage errors: ${storageErrors.length}`
      ] : [],
      ...funcErrors.length > 0 ? [
        `Edge function errors: ${funcErrors.length}`
      ] : []
    ];
    await supabase.from('restore_operations').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress_percentage: 100,
      restore_log: restoreLogMessages
    }).eq('id', restoreOperationId);
    console.log('✅ Comprehensive restore completed successfully');
    console.log('📊 Final stats:', finalSummary);
    return new Response(JSON.stringify({
      ...finalSummary,
      restoreOperationId,
      message: `Restore completed: ${successfulSchemaCreations} tables, ${rlsPoliciesCreated} policies, ${dbFunctionsCreated} functions, ${triggersCreated} triggers, ${bucketsCreated} buckets, ${functionsCreated} edge functions restored`
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const isCancelled = error instanceof Error && error.message === 'RESTORE_CANCELLED';
    console.error(isCancelled ? '🛑 Restore cancelled by user' : '❌ Error in comprehensive restore:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    try {
      if (restoreOperationId) {
        // Check current status to avoid overwriting cancellation
        const { data: currentOp } = await supabase.from('restore_operations').select('status, user_id').eq('id', restoreOperationId).single();
        if (currentOp && currentOp.status !== 'cancelled') {
          // Log error to audit logs
          await supabase.from('operation_audit_logs').insert({
            operation_type: 'restore',
            operation_id: restoreOperationId,
            user_id: currentOp.user_id,
            action: isCancelled ? 'restore_cancelled' : 'restore_failed',
            details: {
              error: errorMessage
            }
          });
          // Update restore operation with error
          await supabase.from('restore_operations').update({
            status: 'failed',
            error_logs: [
              {
                timestamp: new Date().toISOString(),
                message: errorMessage
              }
            ]
          }).eq('id', restoreOperationId);
        }
      }
    } catch (logError) {
      console.error('Failed to log error:', logError);
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
