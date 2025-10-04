import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-call',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
serve(async (req)=>{
  const requestStart = Date.now();
  console.log(`Schema Sync - ${req.method} request received`);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    // Parse request body early to determine action
    const body = await req.json();
    const { action, masterFilePath, forceUpdate = false } = body;
    console.log('Sync request details:', {
      action,
      masterFilePath,
      forceUpdate,
      userAgent: req.headers.get('user-agent')?.substring(0, 50),
      referer: req.headers.get('referer'),
      hasInternalHeader: !!req.headers.get('x-internal-call')
    });
    // Security gate - different rules for different actions
    const userAgent = req.headers.get('user-agent') || '';
    const referer = req.headers.get('referer') || '';
    const isInternalCall = req.headers.get('x-internal-call');
    const isSetupContext = referer.includes('setup');
    const isDenoRuntime = userAgent.includes('Deno');
    // Allow compare and validate from browser or internal calls
    if (action === 'compare' || action === 'validate') {
      console.log(`Allowing ${action} action - safe operation`);
    } else if (action === 'update') {
      const isAuthorizedForUpdate = isInternalCall || isDenoRuntime || isSetupContext;
      if (!isAuthorizedForUpdate) {
        console.warn('Schema sync access denied for update action - requires internal authorization');
        return new Response(JSON.stringify({
          success: false,
          error: 'Access denied - update operations restricted to internal calls'
        }), {
          status: 403,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      console.log('Update action authorized - internal call detected');
    }
    let result;
    switch(action){
      case 'compare':
        result = await compareSchemas();
        break;
      case 'update':
        result = await updateMasterSchema(forceUpdate);
        break;
      case 'validate':
        result = await validateSchemasMatch();
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    const requestTime = Date.now() - requestStart;
    console.log(`Schema sync completed: ${action} (${requestTime}ms)`, result.summary);
    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      action,
      result
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    const requestTime = Date.now() - requestStart;
    console.error(`Schema sync error (${requestTime}ms):`, error);
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
async function compareSchemas() {
  console.log('Comparing production schema with master file...');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // Get current production schema
  const { data: currentTables } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public').eq('table_type', 'BASE TABLE').order('table_name');
  const { data: currentFunctions } = await supabase.rpc('get_schema_functions');
  // Extract schema from master file (this would need to parse the complete-database-schema.ts)
  const masterSchema = await extractMasterFileSchema();
  const comparison = {
    tablesInProduction: currentTables?.length || 0,
    tablesInMaster: masterSchema.tables.length,
    functionsInProduction: currentFunctions?.length || 0,
    functionsInMaster: masterSchema.functions.length,
    differences: {
      missingFromMaster: [],
      missingFromProduction: [],
      extraInMaster: [],
      extraInProduction: []
    },
    isInSync: false,
    lastCompared: new Date().toISOString()
  };
  // Compare tables
  const prodTableNames = (currentTables || []).map((t)=>t.table_name);
  const masterTableNames = masterSchema.tables;
  comparison.differences.missingFromMaster = prodTableNames.filter((t)=>!masterTableNames.includes(t));
  comparison.differences.extraInMaster = masterTableNames.filter((t)=>!prodTableNames.includes(t));
  // Compare functions
  const prodFunctionNames = (currentFunctions || []).map((f)=>f.name);
  const masterFunctionNames = masterSchema.functions;
  comparison.differences.missingFromMaster.push(...prodFunctionNames.filter((f)=>!masterFunctionNames.includes(f)));
  comparison.differences.extraInMaster.push(...masterFunctionNames.filter((f)=>!prodFunctionNames.includes(f)));
  comparison.isInSync = comparison.differences.missingFromMaster.length === 0 && comparison.differences.extraInMaster.length === 0;
  return {
    summary: comparison,
    recommendations: generateSyncRecommendations(comparison)
  };
}
async function updateMasterSchema(forceUpdate) {
  console.log('Updating master schema file...');
  // Extract current production schema
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  // Call schema-extractor to get current schema
  const { data: extractedSchema } = await supabase.functions.invoke('schema-extractor', {
    body: {
      format: 'sql',
      includeData: false
    }
  });
  if (!extractedSchema?.success) {
    throw new Error('Failed to extract current schema');
  }
  // Generate updated master file content
  const updatedMasterContent = generateUpdatedMasterFile(extractedSchema.data);
  // In a real implementation, this would write to the actual file
  // For now, we'll return the content for manual updating
  return {
    success: true,
    updatedContent: updatedMasterContent,
    schemaVersion: extractedSchema.schemaVersion,
    summary: {
      tables: extractedSchema.summary.tables,
      functions: extractedSchema.summary.functions,
      policies: extractedSchema.summary.policies,
      lastUpdated: new Date().toISOString()
    },
    message: 'Master schema content generated. Apply to complete-database-schema.ts file.'
  };
}
async function validateSchemasMatch() {
  console.log('Validating schema consistency...');
  const comparison = await compareSchemas();
  return {
    isValid: comparison.summary.isInSync,
    differences: comparison.summary.differences,
    validationReport: {
      status: comparison.summary.isInSync ? 'PASSED' : 'FAILED',
      issues: comparison.summary.isInSync ? [] : [
        ...comparison.summary.differences.missingFromMaster.map((item)=>`Missing from master: ${item}`),
        ...comparison.summary.differences.extraInMaster.map((item)=>`Extra in master: ${item}`)
      ],
      recommendations: comparison.recommendations
    }
  };
}
function generateSyncRecommendations(comparison) {
  const recommendations = [];
  if (comparison.differences.missingFromMaster.length > 0) {
    recommendations.push('Update master schema file to include new production tables/functions');
    recommendations.push('Run schema-extractor to get current production schema');
  }
  if (comparison.differences.extraInMaster.length > 0) {
    recommendations.push('Review extra items in master file - may be outdated');
    recommendations.push('Consider cleaning up unused schema definitions');
  }
  if (!comparison.isInSync) {
    recommendations.push('Schema drift detected - immediate synchronization recommended');
    recommendations.push('Test new installations with updated master schema');
  }
  return recommendations;
}
function generateUpdatedMasterFile(extractedSql) {
  const header = `/**
 * COMPLETE DATABASE SCHEMA - AUTO-UPDATED
 * Generated: ${new Date().toISOString()}
 * Source: Production Schema Extraction
 * 
 * This file is the authoritative source for new installations.
 * It contains the complete, current production schema.
 */

export function getCompleteDatabaseSchema(): string {
  return \``;
  const footer = `\`;
}`;
  return header + '\n' + extractedSql + '\n' + footer;
}
async function extractMasterFileSchema() {
  // This would parse the actual complete-database-schema.ts file
  // For now, return a mock structure
  return {
    tables: [
      'user_roles',
      'profiles',
      'site_settings',
      'support_departments',
      'site_pages',
      'articles',
      'events',
      'news_articles',
      'resources'
    ],
    functions: [
      'has_role',
      'get_public_site_settings',
      'set_updated_at',
      'log_sensitive_operation',
      'generate_ticket_number'
    ]
  };
}
