import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// In-memory rate limiting (in production, use Redis or database)
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
function isRateLimited(ip) {
  const userAttempts = attempts.get(ip) || [];
  const now = Date.now();
  // Clean old attempts
  const recentAttempts = userAttempts.filter((attempt)=>now - attempt.timestamp < WINDOW_MS);
  attempts.set(ip, recentAttempts);
  const failedAttempts = recentAttempts.filter((attempt)=>!attempt.success);
  return failedAttempts.length >= MAX_ATTEMPTS;
}
function recordAttempt(ip, success) {
  const userAttempts = attempts.get(ip) || [];
  userAttempts.push({
    ip,
    timestamp: Date.now(),
    success
  });
  attempts.set(ip, userAttempts);
}
async function sha256Hex(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b)=>b.toString(16).padStart(2, '0')).join('');
}
function generateSecureToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b)=>b.toString(16).padStart(2, '0')).join('');
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { password, clientIP, userAgent } = await req.json();
    // Get client IP from headers if not provided
    const ip = clientIP || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    // Rate limiting check
    if (isRateLimited(ip)) {
      // Log security event
      await supabase.from('security_audit_log').insert({
        action: 'password_gate_rate_limited',
        table_name: 'security',
        record_id: 'password_gate',
        user_id: null,
        ip_address: ip,
        user_agent: userAgent || req.headers.get('user-agent'),
        details: {
          reason: 'Too many failed attempts'
        }
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'Too many attempts. Please try again later.',
        rateLimited: true
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get expected password hash from environment
    const expectedHash = Deno.env.get('SITE_LOCK_SHA256');
    if (!expectedHash) {
      console.error('SITE_LOCK_SHA256 environment variable not set');
      return new Response(JSON.stringify({
        success: false,
        error: 'Server configuration error'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Hash the provided password
    const passwordHash = await sha256Hex(password);
    const isValid = passwordHash === expectedHash;
    // Record attempt
    recordAttempt(ip, isValid);
    // Log security event
    await supabase.from('security_audit_log').insert({
      action: isValid ? 'password_gate_success' : 'password_gate_failure',
      table_name: 'security',
      record_id: 'password_gate',
      user_id: null,
      ip_address: ip,
      user_agent: userAgent || req.headers.get('user-agent'),
      details: {
        timestamp: new Date().toISOString(),
        success: isValid
      }
    });
    if (isValid) {
      // Generate secure session token
      const sessionToken = generateSecureToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      // Store session in database for validation
      await supabase.from('security_sessions').insert({
        token: sessionToken,
        ip_address: ip,
        user_agent: userAgent || req.headers.get('user-agent'),
        expires_at: expiresAt.toISOString()
      });
      return new Response(JSON.stringify({
        success: true,
        token: sessionToken,
        expiresAt: expiresAt.toISOString()
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid password'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
  } catch (error) {
    console.error('Error in secure-password-gate function:', error);
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
