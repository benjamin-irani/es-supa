// Enhanced CORS configuration for production security
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// Secure CORS configuration
const getAllowedOrigins = (req)=>{
  const origin = req.headers.get('origin');
  // Production allowed origins - update these for your domains
  const allowedOrigins = [
    'https://your-domain.com',
    'https://www.your-domain.com',
    'https://staging.your-domain.com',
    // Supabase Studio access
    'https://supabase.com',
    'https://app.supabase.com'
  ];
  // Development mode allowance
  if (Deno.env.get('DENO_DEPLOYMENT_ID') === undefined) {
    allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
  }
  return allowedOrigins.includes(origin || '') ? origin || '' : 'null';
};
const getSecureCorsHeaders = (req)=>{
  const allowedOrigin = getAllowedOrigins(req);
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with, x-csrf-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    // Additional security headers
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  };
};
// Rate limiting storage
const rateLimitMap = new Map();
const checkRateLimit = (identifier, maxRequests = 100, windowMs = 60000)=>{
  const now = Date.now();
  const key = identifier;
  const current = rateLimitMap.get(key);
  if (!current || now > current.resetTime) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs
    });
    return true;
  }
  if (current.count >= maxRequests) {
    return false;
  }
  current.count++;
  return true;
};
serve(async (req)=>{
  const corsHeaders = getSecureCorsHeaders(req);
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }
  try {
    // Rate limiting
    const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    if (!checkRateLimit(clientIP, 100, 60000)) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded'
      }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '60'
        }
      });
    }
    // Input validation and sanitization
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    // Validate action parameter
    const allowedActions = [
      'test',
      'validate',
      'check'
    ];
    if (action && !allowedActions.includes(action)) {
      return new Response(JSON.stringify({
        error: 'Invalid action parameter'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Log security-relevant requests
    console.log(`Security CORS request: ${req.method} ${url.pathname} from ${clientIP}`);
    return new Response(JSON.stringify({
      message: 'CORS configuration validated',
      timestamp: new Date().toISOString(),
      security: {
        corsConfigured: true,
        rateLimitActive: true,
        headersSet: Object.keys(corsHeaders).length
      }
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('CORS configuration error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      message: 'CORS configuration failed'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
