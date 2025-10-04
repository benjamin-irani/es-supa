import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
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
    // Get Supabase clients
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      throw new Error('Authentication required');
    }
    // Check if user has admin role
    const { data: userRoles, error: roleError } = await supabaseAdmin.from('user_roles').select('role').eq('user_id', user.id);
    if (roleError || !userRoles?.some((r)=>r.role === 'admin')) {
      throw new Error('Admin privileges required');
    }
    // Parse request body
    const body = await req.json();
    const { includeData = false, includePolicies = true, includeFunctions = true, tables = [] } = body;
    // Log the export attempt
    await supabaseAdmin.rpc('log_sensitive_operation_with_limits', {
      operation_type: 'comprehensive_database_export',
      table_name: 'system',
      record_id: `user_${user.id}`,
      user_id: user.id
    });
    // Get database structure
    const { data: structure, error: structureError } = await supabaseAdmin.rpc('export_database_structure');
    if (structureError) {
      throw new Error(`Failed to get database structure: ${structureError.message}`);
    }
    // Check export readiness (now includes audit table status)
    const { data: readiness, error: readinessError } = await supabaseAdmin.rpc('check_export_readiness');
    if (readinessError) {
      console.warn('Readiness check failed, continuing with export:', readinessError);
    // Continue with export even if readiness check fails - defensive programming
    }
    // Get table data if requested
    let tableData = {};
    if (includeData) {
      const tablesToExport = tables.length > 0 ? tables : structure?.map((s)=>s.table_name) || [];
      for (const tableName of tablesToExport){
        try {
          const { data, error } = await supabaseAdmin.from(tableName).select('*').limit(10000); // Limit to prevent memory issues
          if (!error && data) {
            tableData[tableName] = data;
          }
        } catch (err) {
          console.warn(`Failed to export data for table ${tableName}:`, err);
          tableData[tableName] = [];
        }
      }
    }
    // Get RLS policies if requested
    let policies = [];
    if (includePolicies) {
      const { data: policyData, error: policyError } = await supabaseAdmin.from('pg_policies').select('*');
      if (!policyError && policyData) {
        policies = policyData.filter((p)=>p.schemaname === 'public');
      }
    }
    // Get functions if requested
    let functions = [];
    if (includeFunctions) {
      const { data: functionData, error: functionError } = await supabaseAdmin.rpc('get_public_functions');
      if (!functionError && functionData) {
        functions = functionData;
      }
    }
    // Prepare export package
    const exportPackage = {
      metadata: {
        exportDate: new Date().toISOString(),
        exportedBy: user.id,
        version: '1.0.0',
        includeData,
        includePolicies,
        includeFunctions
      },
      readinessCheck: readiness,
      structure,
      data: tableData,
      policies,
      functions,
      stats: {
        totalTables: structure?.length || 0,
        tablesWithData: Object.keys(tableData).length,
        totalPolicies: policies.length,
        totalFunctions: functions.length
      }
    };
    return new Response(JSON.stringify(exportPackage, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="database_export_${new Date().toISOString().split('T')[0]}.json"`
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    return new Response(JSON.stringify({
      error: error?.message || 'Export failed',
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
