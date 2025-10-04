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
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'metrics';
    if (action === 'metrics') {
      // Get comprehensive security metrics
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
      // Parallel queries for better performance
      const [totalLogs, failedLogins, suspiciousActivity, dataAccess, adminAccess, rateLimitHits, activeSessions] = await Promise.all([
        supabase.from('security_audit_log').select('id', {
          count: 'exact'
        }).gte('created_at', last24Hours.toISOString()),
        supabase.from('security_audit_log').select('id', {
          count: 'exact'
        }).in('action', [
          'password_gate_failure',
          'auth_failure',
          'login_failed'
        ]).gte('created_at', last24Hours.toISOString()),
        supabase.from('security_audit_log').select('id', {
          count: 'exact'
        }).in('action', [
          'bulk_data_access',
          'suspicious_query',
          'multiple_failures'
        ]).gte('created_at', lastHour.toISOString()),
        supabase.from('security_audit_log').select('id', {
          count: 'exact'
        }).like('action', '%data_access%').gte('created_at', last24Hours.toISOString()),
        supabase.from('security_audit_log').select('id', {
          count: 'exact'
        }).like('action', 'admin_%').gte('created_at', last24Hours.toISOString()),
        supabase.from('security_audit_log').select('id', {
          count: 'exact'
        }).eq('action', 'password_gate_rate_limited').gte('created_at', last24Hours.toISOString()),
        supabase.from('security_sessions').select('id', {
          count: 'exact'
        }).gt('expires_at', now.toISOString())
      ]);
      const metrics = {
        totalAuditLogs: totalLogs.count || 0,
        failedLogins: failedLogins.count || 0,
        suspiciousActivity: suspiciousActivity.count || 0,
        dataAccessAttempts: dataAccess.count || 0,
        adminAccess: adminAccess.count || 0,
        rateLimit: rateLimitHits.count || 0,
        lastSecurityScan: now.toISOString(),
        activeSessions: activeSessions.count || 0,
        criticalAlerts: (suspiciousActivity.count || 0) + (rateLimitHits.count || 0)
      };
      return new Response(JSON.stringify({
        success: true,
        metrics
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (action === 'alerts') {
      // Generate real-time security alerts
      const alerts = [];
      const now = new Date();
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
      // Check for suspicious activity
      const { data: recentFailures } = await supabase.from('security_audit_log').select('ip_address, action').in('action', [
        'password_gate_failure',
        'auth_failure'
      ]).gte('created_at', lastHour.toISOString());
      if (recentFailures && recentFailures.length > 10) {
        alerts.push({
          id: 'high-failure-rate',
          type: 'critical',
          title: 'High Authentication Failure Rate',
          description: `${recentFailures.length} failed authentication attempts in the last hour`,
          timestamp: now.toISOString(),
          resolved: false
        });
      }
      // Check for rate limiting events
      const { data: rateLimitEvents } = await supabase.from('security_audit_log').select('ip_address').eq('action', 'password_gate_rate_limited').gte('created_at', lastHour.toISOString());
      if (rateLimitEvents && rateLimitEvents.length > 0) {
        alerts.push({
          id: 'rate-limit-triggered',
          type: 'warning',
          title: 'Rate Limiting Active',
          description: `${rateLimitEvents.length} IP addresses have been rate limited`,
          timestamp: now.toISOString(),
          resolved: false
        });
      }
      // Check for bulk data access
      const { data: bulkAccess } = await supabase.from('security_audit_log').select('user_id, action').like('action', '%bulk%').gte('created_at', lastHour.toISOString());
      if (bulkAccess && bulkAccess.length > 5) {
        alerts.push({
          id: 'bulk-data-access',
          type: 'warning',
          title: 'High Volume Data Access',
          description: `${bulkAccess.length} bulk data access operations detected`,
          timestamp: now.toISOString(),
          resolved: false
        });
      }
      return new Response(JSON.stringify({
        success: true,
        alerts
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (action === 'validate') {
      // Automated security policy validation
      const validationResults = [];
      // Check RLS policies are enabled
      const { data: tables } = await supabase.rpc('get_public_tables');
      const { data: rlsStatus } = await supabase.rpc('audit_rls_policies');
      if (rlsStatus) {
        const tablesWithoutRLS = rlsStatus.filter((table)=>!table.rls_enabled);
        if (tablesWithoutRLS.length > 0) {
          validationResults.push({
            type: 'critical',
            message: `${tablesWithoutRLS.length} tables without RLS enabled`,
            details: tablesWithoutRLS.map((t)=>t.table_name)
          });
        }
      }
      // Check for tables without policies
      if (rlsStatus) {
        const tablesWithoutPolicies = rlsStatus.filter((table)=>table.rls_enabled && table.policy_count === 0);
        if (tablesWithoutPolicies.length > 0) {
          validationResults.push({
            type: 'warning',
            message: `${tablesWithoutPolicies.length} tables with RLS but no policies`,
            details: tablesWithoutPolicies.map((t)=>t.table_name)
          });
        }
      }
      return new Response(JSON.stringify({
        success: true,
        validation: {
          timestamp: new Date().toISOString(),
          results: validationResults,
          passed: validationResults.filter((r)=>r.type !== 'critical').length === validationResults.length
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid action'
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in security-monitor function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
