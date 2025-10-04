import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
const handler = async (req)=>{
  console.log('Contact security monitor request received');
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const { action, retention_days } = await req.json();
    console.log('Processing action:', action);
    let result;
    switch(action){
      case 'scan':
        // Run comprehensive contact data security scan
        const [metricsResult, breachResult] = await Promise.all([
          supabase.rpc('get_contact_security_metrics'),
          supabase.rpc('detect_contact_data_breach')
        ]);
        if (metricsResult.error) {
          console.error('Error fetching security metrics:', metricsResult.error);
          throw new Error('Failed to fetch security metrics');
        }
        if (breachResult.error) {
          console.error('Error detecting breaches:', breachResult.error);
          throw new Error('Failed to detect breaches');
        }
        result = {
          success: true,
          security_metrics: metricsResult.data,
          breach_detection: breachResult.data,
          scan_timestamp: new Date().toISOString(),
          recommendations: generateSecurityRecommendations(metricsResult.data, breachResult.data)
        };
        break;
      case 'metrics':
        // Get current security metrics
        const { data: metrics, error: metricsError } = await supabase.rpc('get_contact_security_metrics');
        if (metricsError) {
          console.error('Error fetching metrics:', metricsError);
          throw new Error('Failed to fetch security metrics');
        }
        result = {
          success: true,
          metrics: metrics,
          timestamp: new Date().toISOString()
        };
        break;
      case 'breach_detection':
        // Run breach detection analysis
        const { data: breaches, error: breachError } = await supabase.rpc('detect_contact_data_breach');
        if (breachError) {
          console.error('Error detecting breaches:', breachError);
          throw new Error('Failed to detect data breaches');
        }
        result = {
          success: true,
          breaches: breaches,
          timestamp: new Date().toISOString(),
          critical_alerts: breaches.filter((b)=>b.severity === 'CRITICAL'),
          high_alerts: breaches.filter((b)=>b.severity === 'HIGH')
        };
        break;
      case 'anonymize':
        // Run data anonymization for old records
        const days = retention_days || 365;
        const { data: anonymizeResult, error: anonymizeError } = await supabase.rpc('auto_anonymize_old_contact_data', {
          retention_days: days
        });
        if (anonymizeError) {
          console.error('Error anonymizing data:', anonymizeError);
          throw new Error('Failed to anonymize old contact data');
        }
        result = {
          success: true,
          anonymized_records: anonymizeResult,
          retention_days: days,
          timestamp: new Date().toISOString()
        };
        break;
      case 'emergency_lockdown':
        // Emergency lockdown of contact data
        const { data: lockdownResult, error: lockdownError } = await supabase.rpc('emergency_contact_data_lockdown');
        if (lockdownError) {
          console.error('Error executing emergency lockdown:', lockdownError);
          throw new Error('Failed to execute emergency lockdown');
        }
        result = {
          success: true,
          lockdown_executed: lockdownResult,
          timestamp: new Date().toISOString(),
          message: 'Emergency contact data lockdown has been executed. All contact data has been temporarily secured.'
        };
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    console.log('Action completed successfully:', action);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('Error in contact security monitor:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
};
function generateSecurityRecommendations(metrics, breaches) {
  const recommendations = [];
  // Analyze metrics for recommendations
  for (const metric of metrics){
    if (metric.status === 'ALERT') {
      recommendations.push(`URGENT: ${metric.security_metric} is in ALERT status. Immediate action required.`);
    } else if (metric.status === 'REVIEW') {
      recommendations.push(`Review required for ${metric.security_metric} - threshold exceeded.`);
    }
  }
  // Analyze breach detection for recommendations
  const criticalBreaches = breaches.filter((b)=>b.severity === 'CRITICAL');
  const highBreaches = breaches.filter((b)=>b.severity === 'HIGH');
  if (criticalBreaches.length > 0) {
    recommendations.push('CRITICAL: Potential data harvesting detected. Consider emergency lockdown.');
    recommendations.push('Immediately review all contact data access patterns.');
    recommendations.push('Consider temporarily restricting HR access to contact data.');
  }
  if (highBreaches.length > 0) {
    recommendations.push('HIGH: Suspicious access patterns detected. Enhanced monitoring recommended.');
    recommendations.push('Review user access logs for the past 24 hours.');
  }
  // General security recommendations
  if (recommendations.length === 0) {
    recommendations.push('Contact data security status is good.');
    recommendations.push('Continue regular monitoring and maintain current security practices.');
    recommendations.push('Consider running data anonymization for records older than 1 year.');
  }
  return recommendations;
}
serve(handler);
