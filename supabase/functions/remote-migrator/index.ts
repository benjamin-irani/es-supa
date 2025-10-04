import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    const { data: hasAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });
    if (!hasAdmin) {
      throw new Error('Admin access required');
    }
    const { targetProject, sqlFiles, options = {} } = await req.json();
    console.log('Starting remote migration to:', targetProject.url);
    // Connect to target project
    const targetClient = createClient(targetProject.url, targetProject.serviceKey || targetProject.anonKey);
    // Test connection
    const { error: connError } = await targetClient.from('information_schema.tables').select('table_name').limit(1);
    if (connError) {
      throw new Error(`Cannot connect to target project: ${connError.message}`);
    }
    const report = {
      tablesCreated: 0,
      functionsCreated: 0,
      policiesApplied: 0,
      bucketsCreated: 0,
      executionTime: '',
      errors: [],
      warnings: []
    };
    const startTime = Date.now();
    // Execute SQL files in order
    const fileOrder = [
      '01-schema-foundation.sql',
      '02-functions.sql',
      '03-indexes-triggers.sql',
      '04-security-storage.sql',
      '05-data-migration.sql'
    ];
    for (const fileName of fileOrder){
      if (!sqlFiles[fileName]) continue;
      console.log(`Executing ${fileName}...`);
      try {
        const sql = atob(sqlFiles[fileName]);
        // Split SQL into individual statements
        const statements = sql.split(';').map((s)=>s.trim()).filter((s)=>s.length > 0 && !s.startsWith('--'));
        for (const statement of statements){
          try {
            // Execute via RPC function if available
            const { error } = await targetClient.rpc('exec_sql', {
              sql: statement + ';'
            });
            if (error) {
              console.error(`Error executing statement:`, error);
              report.errors.push(`${fileName}: ${error.message}`);
              if (!options.continueOnError) {
                throw error;
              }
            } else {
              // Count successes
              if (statement.toUpperCase().includes('CREATE TABLE')) {
                report.tablesCreated++;
              } else if (statement.toUpperCase().includes('CREATE FUNCTION') || statement.toUpperCase().includes('CREATE OR REPLACE FUNCTION')) {
                report.functionsCreated++;
              } else if (statement.toUpperCase().includes('CREATE POLICY')) {
                report.policiesApplied++;
              } else if (statement.toUpperCase().includes('INSERT INTO storage.buckets')) {
                report.bucketsCreated++;
              }
            }
          } catch (stmtError) {
            console.error(`Statement error:`, stmtError);
            report.errors.push(`${fileName}: ${stmtError.message}`);
            if (!options.continueOnError) {
              throw stmtError;
            }
          }
        }
        console.log(`✓ Completed ${fileName}`);
      } catch (fileError) {
        console.error(`File error in ${fileName}:`, fileError);
        report.errors.push(`${fileName}: ${fileError.message}`);
        if (!options.continueOnError) {
          throw fileError;
        }
      }
    }
    const endTime = Date.now();
    report.executionTime = `${((endTime - startTime) / 1000).toFixed(2)}s`;
    // Log migration history
    await supabase.from('migration_history').insert({
      project_id: 'source',
      target_project_id: targetProject.url,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date(endTime).toISOString(),
      status: report.errors.length > 0 ? 'failed' : 'completed',
      trigger_user: user.id,
      migration_type: 'clone',
      report: report
    });
    console.log('Migration completed:', report);
    const result = {
      success: report.errors.length === 0,
      report,
      rollbackAvailable: false
    };
    // Trigger webhooks
    try {
      await supabase.functions.invoke('trigger-webhook', {
        body: {
          event: report.errors.length === 0 ? 'migration_complete' : 'migration_failed',
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
    console.error('Migration error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      report: {
        tablesCreated: 0,
        functionsCreated: 0,
        policiesApplied: 0,
        bucketsCreated: 0,
        executionTime: '0s',
        errors: [
          error.message
        ],
        warnings: []
      }
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
