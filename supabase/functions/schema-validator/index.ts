import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-call'
};
serve(async (req)=>{
  console.log(`Schema Validator - ${req.method} request received`);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  // Internal security check - only allow from setup context or with proper headers
  const userAgent = req.headers.get('user-agent') || '';
  const referer = req.headers.get('referer') || '';
  // Allow calls from setup wizard or internal functions
  const isValidSetupRequest = referer.includes('setup') || userAgent.includes('Deno') || req.headers.get('x-internal-call');
  if (!isValidSetupRequest) {
    console.warn('Schema validator access denied - invalid context');
    return new Response(JSON.stringify({
      success: false,
      error: 'Access denied - function restricted to setup context'
    }), {
      status: 403,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    const body = await req.json();
    const { masterSchemaVersion, targetUrl, targetKey, testInstallation = false } = body;
    console.log('Validation options:', {
      masterSchemaVersion,
      testInstallation,
      hasTarget: !!(targetUrl && targetKey)
    });
    let validationResults;
    if (testInstallation && targetUrl && targetKey) {
      // Test fresh installation
      validationResults = await testFreshInstallation(targetUrl, targetKey);
    } else {
      // Compare current schema with master
      validationResults = await validateCurrentSchema(masterSchemaVersion);
    }
    console.log('Validation completed:', validationResults.summary);
    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      validation: validationResults
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Schema validation error:', error);
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
async function validateCurrentSchema(masterVersion) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('Validating current schema...');
  const results = {
    isValid: true,
    issues: [],
    summary: {
      tablesChecked: 0,
      functionsChecked: 0,
      policiesChecked: 0,
      missingTables: [],
      missingFunctions: [],
      missingPolicies: []
    },
    schemaHealth: 'healthy'
  };
  try {
    // Check critical tables exist using system function
    const criticalTables = [
      'user_roles',
      'site_settings',
      'support_departments',
      'security_audit_logs',
      'site_pages',
      'articles',
      'events'
    ];
    const { data: tableResults, error: tableError } = await supabase.rpc('system_check_tables', {
      table_names: criticalTables
    });
    if (tableError) {
      console.error('Error checking tables:', tableError);
      results.summary.missingTables = criticalTables;
      results.issues.push('Could not verify critical tables');
      results.isValid = false;
    } else {
      for (const tableResult of tableResults || []){
        if (!tableResult.table_exists) {
          results.summary.missingTables.push(tableResult.table_name);
          results.issues.push(`Missing critical table: ${tableResult.table_name}`);
          results.isValid = false;
        }
      }
    }
    results.summary.tablesChecked = criticalTables.length;
    // Check critical functions exist using system function
    const criticalFunctions = [
      'has_role',
      'get_public_site_settings',
      'set_updated_at',
      'log_sensitive_operation',
      'generate_ticket_number'
    ];
    // Get all existing functions using system function that bypasses RLS
    const { data: allFunctions, error: funcListError } = await supabase.rpc('system_get_functions');
    if (funcListError) {
      console.error('Error getting function list:', funcListError);
      results.issues.push('Could not verify functions');
      results.isValid = false;
    } else {
      const existingFunctions = (allFunctions || []).map((f)=>f.function_name);
      for (const funcName of criticalFunctions){
        if (!existingFunctions.includes(funcName)) {
          results.summary.missingFunctions.push(funcName);
          results.issues.push(`Missing critical function: ${funcName}`);
          results.isValid = false;
        }
      }
    }
    results.summary.functionsChecked = criticalFunctions.length;
    // Check RLS is enabled on sensitive tables
    const sensitiveTablePolicies = await checkRLSPolicies(supabase);
    results.summary.policiesChecked = sensitiveTablePolicies.checked;
    results.summary.missingPolicies = sensitiveTablePolicies.missing;
    if (sensitiveTablePolicies.missing.length > 0) {
      results.issues.push(...sensitiveTablePolicies.missing.map((p)=>`Missing RLS policy: ${p}`));
      results.isValid = false;
    }
  } catch (error) {
    results.issues.push(`Validation error: ${error.message}`);
    results.isValid = false;
  }
  // Determine health status
  if (!results.isValid) {
    results.schemaHealth = 'error';
  } else if (results.issues.length > 0) {
    results.schemaHealth = 'warning';
  }
  return results;
}
async function testFreshInstallation(targetUrl, targetKey) {
  console.log('Testing fresh installation...');
  const testSupabase = createClient(targetUrl, targetKey);
  const results = {
    installationValid: true,
    issues: [],
    testResults: {
      connection: false,
      schemaApplied: false,
      functionsWorking: false,
      rlsEnabled: false
    }
  };
  try {
    // Test basic connection using our custom function
    const { data: connectionTest, error: connError } = await testSupabase.rpc('get_public_tables');
    results.testResults.connection = !connError && !!connectionTest;
    // Test if schema is applied (check for critical tables)
    if (results.testResults.connection) {
      const { data: userRolesExists } = await testSupabase.rpc('check_table_exists', {
        table_name: 'user_roles'
      });
      const { data: settingsExists } = await testSupabase.rpc('check_table_exists', {
        table_name: 'site_settings'
      });
      results.testResults.schemaApplied = userRolesExists && settingsExists;
    }
    // Test critical functions
    if (results.testResults.schemaApplied) {
      try {
        await testSupabase.rpc('has_role', {
          _user_id: null,
          _role: 'admin'
        });
        results.testResults.functionsWorking = true;
      } catch (e) {
        results.issues.push('Critical functions not working');
      }
    }
    // Test RLS policies exist
    if (results.testResults.functionsWorking) {
      try {
        const { data: rlsTest, error: rlsError } = await testSupabase.rpc('audit_rls_policies');
        results.testResults.rlsEnabled = !rlsError && Array.isArray(rlsTest) && rlsTest.length > 0;
      } catch (e) {
        results.issues.push('RLS policy check failed');
      }
    }
  } catch (error) {
    results.issues.push(`Installation test failed: ${error.message}`);
    results.installationValid = false;
  }
  results.installationValid = Object.values(results.testResults).every((test)=>test);
  return results;
}
async function checkRLSPolicies(supabase) {
  const sensitiveTablesPolicies = [
    'user_roles',
    'payments',
    'security_audit_logs',
    'support_tickets',
    'contact_submissions'
  ];
  const result = {
    checked: 0,
    missing: []
  };
  try {
    const { data: policies, error } = await supabase.rpc('system_audit_rls_policies');
    if (error) {
      console.error('RLS audit error:', error);
      result.missing = sensitiveTablesPolicies; // Assume all missing if we can't check
      return result;
    }
    for (const table of sensitiveTablesPolicies){
      result.checked++;
      const tablePolicy = policies?.find((p)=>p.table_name === table);
      if (!tablePolicy || !tablePolicy.rls_enabled || tablePolicy.policy_count === 0) {
        result.missing.push(table);
      }
    }
  } catch (error) {
    console.error('RLS policy check failed:', error);
    result.missing = sensitiveTablesPolicies; // Assume all missing on error
  }
  return result;
}
