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
    console.log('Schema audit function called');
    // Get service role key from environment
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
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log('Starting comprehensive schema audit');
    const auditResults = {
      timestamp: new Date().toISOString(),
      summary: {},
      details: {}
    };
    // 1. Audit Tables
    const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          table_name,
          table_type,
          (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
        FROM information_schema.tables t
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT LIKE 'pg_%'
        ORDER BY table_name;
      `
    });
    if (tablesError) {
      console.error('Error querying tables:', tablesError);
    } else {
      auditResults.details.tables = tables || [];
      auditResults.summary.tableCount = tables?.length || 0;
    }
    // 2. Audit Functions
    const { data: functions, error: functionsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          routine_name as function_name,
          routine_type,
          data_type as return_type,
          is_deterministic,
          security_type
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
          AND routine_type = 'FUNCTION'
        ORDER BY routine_name;
      `
    });
    if (functionsError) {
      console.error('Error querying functions:', functionsError);
    } else {
      auditResults.details.functions = functions || [];
      auditResults.summary.functionCount = functions?.length || 0;
    }
    // 3. Audit RLS Policies
    const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          schemaname,
          tablename,
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        FROM pg_policies 
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname;
      `
    });
    if (policiesError) {
      console.error('Error querying policies:', policiesError);
    } else {
      auditResults.details.policies = policies || [];
      auditResults.summary.policyCount = policies?.length || 0;
      auditResults.summary.tablesWithPolicies = [
        ...new Set(policies?.map((p)=>p.tablename) || [])
      ].length;
    }
    // 4. Audit Triggers
    const { data: triggers, error: triggersError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          trigger_name,
          event_manipulation,
          event_object_table as table_name,
          action_timing,
          action_statement
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
          AND trigger_name NOT LIKE 'RI_%'
        ORDER BY event_object_table, trigger_name;
      `
    });
    if (triggersError) {
      console.error('Error querying triggers:', triggersError);
    } else {
      auditResults.details.triggers = triggers || [];
      auditResults.summary.triggerCount = triggers?.length || 0;
    }
    // 5. Audit Storage Buckets
    const { data: buckets, error: bucketsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          id as bucket_id,
          name as bucket_name,
          public,
          created_at,
          updated_at
        FROM storage.buckets
        ORDER BY id;
      `
    });
    if (bucketsError) {
      console.error('Error querying storage buckets:', bucketsError);
    } else {
      auditResults.details.storageBuckets = buckets || [];
      auditResults.summary.bucketCount = buckets?.length || 0;
      auditResults.summary.publicBuckets = buckets?.filter((b)=>b.public).length || 0;
      auditResults.summary.privateBuckets = buckets?.filter((b)=>!b.public).length || 0;
    }
    // 6. Audit Storage Policies
    const { data: storagePolicies, error: storagePoliciesError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          schemaname,
          tablename,
          policyname,
          permissive,
          roles,
          cmd
        FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects'
        ORDER BY policyname;
      `
    });
    if (storagePoliciesError) {
      console.error('Error querying storage policies:', storagePoliciesError);
    } else {
      auditResults.details.storagePolicies = storagePolicies || [];
      auditResults.summary.storagePolicyCount = storagePolicies?.length || 0;
    }
    // 7. Audit Enums
    const { data: enums, error: enumsError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          t.typname as enum_name,
          array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname
        ORDER BY t.typname;
      `
    });
    if (enumsError) {
      console.error('Error querying enums:', enumsError);
    } else {
      auditResults.details.enums = enums || [];
      auditResults.summary.enumCount = enums?.length || 0;
    }
    // 8. Sample Data Check
    const sampleDataChecks = [
      {
        table: 'site_settings',
        description: 'Site configuration'
      },
      {
        table: 'site_menus',
        description: 'Navigation menus'
      },
      {
        table: 'site_menu_items',
        description: 'Menu items'
      },
      {
        table: 'site_pages',
        description: 'Static pages'
      },
      {
        table: 'site_categories',
        description: 'Content categories'
      },
      {
        table: 'support_departments',
        description: 'Support departments'
      },
      {
        table: 'support_categories',
        description: 'Support categories'
      }
    ];
    const sampleDataResults = [];
    for (const check of sampleDataChecks){
      try {
        const { data: count, error } = await supabase.rpc('exec_sql', {
          query: `SELECT COUNT(*) as count FROM public.${check.table};`
        });
        if (!error && count && count.length > 0) {
          sampleDataResults.push({
            table: check.table,
            description: check.description,
            count: count[0].count,
            hasData: count[0].count > 0
          });
        }
      } catch (err) {
        console.warn(`Error checking ${check.table}:`, err);
        sampleDataResults.push({
          table: check.table,
          description: check.description,
          count: 0,
          hasData: false,
          error: err.message
        });
      }
    }
    auditResults.details.sampleData = sampleDataResults;
    auditResults.summary.tablesWithData = sampleDataResults.filter((r)=>r.hasData).length;
    // 9. Health Check Summary
    const healthChecks = {
      coreTablesPresent: (auditResults.summary.tableCount || 0) >= 20,
      hasRLSPolicies: (auditResults.summary.policyCount || 0) >= 10,
      hasStorageBuckets: (auditResults.summary.bucketCount || 0) >= 5,
      hasEssentialFunctions: (auditResults.summary.functionCount || 0) >= 5,
      hasSampleData: (auditResults.summary.tablesWithData || 0) >= 4,
      hasStoragePolicies: (auditResults.summary.storagePolicyCount || 0) >= 10
    };
    const healthScore = Object.values(healthChecks).filter(Boolean).length;
    const totalChecks = Object.keys(healthChecks).length;
    auditResults.summary.healthScore = `${healthScore}/${totalChecks}`;
    auditResults.summary.healthPercentage = Math.round(healthScore / totalChecks * 100);
    auditResults.summary.healthChecks = healthChecks;
    // Overall status
    auditResults.summary.overallStatus = healthScore >= totalChecks * 0.8 ? 'HEALTHY' : healthScore >= totalChecks * 0.6 ? 'WARNING' : 'CRITICAL';
    console.log('Schema audit completed:', {
      status: auditResults.summary.overallStatus,
      healthScore: auditResults.summary.healthScore,
      tables: auditResults.summary.tableCount,
      functions: auditResults.summary.functionCount,
      policies: auditResults.summary.policyCount,
      buckets: auditResults.summary.bucketCount
    });
    return new Response(JSON.stringify({
      success: true,
      data: auditResults,
      message: `Schema audit completed - Status: ${auditResults.summary.overallStatus} (${auditResults.summary.healthScore})`
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Schema audit error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Unknown error occurred during schema audit',
      details: error.stack
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
