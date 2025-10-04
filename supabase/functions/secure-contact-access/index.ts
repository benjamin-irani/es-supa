import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const handler = async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    // Get the authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }
    // Get user from auth header
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    console.log('Secure contact access request from user:', user.id);
    // Check if user has HR access
    const { data: hasAccess, error: accessError } = await supabase.rpc('has_hr_access', {
      _user_id: user.id
    });
    if (accessError || !hasAccess) {
      console.log('Access denied for user:', user.id);
      return new Response(JSON.stringify({
        error: 'SECURITY VIOLATION: HR privileges required for contact data access'
      }), {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    const requestBody = await req.json();
    console.log('Processing request:', requestBody.action);
    // Log access attempt
    try {
      await supabase.rpc('log_sensitive_operation_with_limits', {
        operation_type: `secure_contact_${requestBody.action}`,
        table_name: 'contact_submissions',
        record_id: requestBody.contactId || 'bulk_access',
        user_id: user.id
      });
    } catch (logError) {
      // Continue if logging fails
      console.log('Audit logging failed, continuing...', logError);
    }
    let result;
    switch(requestBody.action){
      case 'list':
        // Get list of contact submissions with masked data for security
        const { data: contacts, error: listError } = await supabase.from('contact_submissions').select('*').order('created_at', {
          ascending: false
        }).limit(requestBody.limit || 50).range(requestBody.offset || 0, (requestBody.offset || 0) + (requestBody.limit || 50) - 1);
        if (listError) throw listError;
        // Apply security masking to protect sensitive data
        result = contacts?.map((contact)=>({
            ...contact,
            contact_email: maskEmail(contact.contact_email),
            contact_phone: maskPhone(contact.contact_phone),
            contact_name: maskName(contact.contact_name),
            message: contact.message ? 'Content available - click to view' : null
          })) || [];
        break;
      case 'get':
        if (!requestBody.contactId) {
          throw new Error('Contact ID required for get operation');
        }
        // Get specific contact submission with full data for HR
        const { data: contact, error: getError } = await supabase.from('contact_submissions').select('*').eq('id', requestBody.contactId).single();
        if (getError) throw getError;
        // For HR users, return full data but log the access
        result = contact;
        console.log('Full contact data accessed by HR user:', user.id);
        break;
      case 'update_status':
        if (!requestBody.contactId || !requestBody.status) {
          throw new Error('Contact ID and status required for update operation');
        }
        const { data: updated, error: updateError } = await supabase.from('contact_submissions').update({
          status: requestBody.status,
          updated_at: new Date().toISOString()
        }).eq('id', requestBody.contactId).select().single();
        if (updateError) throw updateError;
        result = updated;
        console.log('Contact status updated by HR user:', user.id);
        break;
      default:
        throw new Error('Invalid action requested');
    }
    return new Response(JSON.stringify({
      data: result
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error in secure-contact-access function:", error);
    return new Response(JSON.stringify({
      error: error.message,
      securityNote: 'This function implements additional security measures to protect customer contact data'
    }), {
      status: error.message.includes('SECURITY VIOLATION') ? 403 : 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};
// Security helper functions for data masking
function maskEmail(email) {
  if (!email) return null;
  if (email.includes('@')) {
    const [local, domain] = email.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }
  return '***@***.***';
}
function maskPhone(phone) {
  if (!phone) return null;
  if (phone.length > 4) {
    return `***-***-${phone.slice(-4)}`;
  }
  return '***-***-****';
}
function maskName(name) {
  if (!name) return null;
  if (name.length > 1) {
    return `${name.charAt(0)}${new Array(name.length - 1).fill('*').join('')}`;
  }
  return '*';
}
serve(handler);
