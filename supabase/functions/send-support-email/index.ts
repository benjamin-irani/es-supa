import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import DOMPurify from "https://esm.sh/dompurify@3.0.5";
import { Resend } from "https://esm.sh/resend@2.0.0";
// Flexible CORS configuration
const getAllowedOrigins = ()=>{
  const requestOrigin = Deno.env.get("REQUEST_ORIGIN");
  const prodOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // If explicit production origin is set, use it
  if (prodOrigin) {
    return prodOrigin;
  }
  // Support common development and production patterns
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://cms.eywa365.net",
    "https://coniunus.co",
    supabaseUrl
  ].filter(Boolean);
  // If request origin is in allowed list, use it
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Default to first production origin or localhost
  return prodOrigin || "https://cms.eywa365.net";
};
const corsHeaders = {
  'Access-Control-Allow-Origin': getAllowedOrigins(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
// Sanitize HTML content to prevent XSS
function sanitizeContent(content) {
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'a'
    ],
    ALLOWED_ATTR: [
      'href',
      'target',
      'rel'
    ],
    ALLOW_DATA_ATTR: false
  });
}
// Check if user has required role using RPC for security
async function hasRequiredRole(supabase, userId) {
  const { data: isAdmin, error: adminError } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'admin'
  });
  if (!adminError && isAdmin) return true;
  const { data: isAgent, error: agentError } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'support_agent'
  });
  if (!agentError && isAgent) return true;
  return false;
}
const handler = async (req)=>{
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  try {
    // Create clients - use anon for auth verification, service for operations
    const anonClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const serviceClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const resend = new Resend(Deno.env.get("RESEND_API_KEY") || "");
    // Extract and validate authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({
        error: 'Missing or invalid authorization header'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Invalid authentication token'
      }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    // Check rate limiting before proceeding
    const { data: canSendEmail, error: rateLimitError } = await serviceClient.rpc('check_email_send_limits', {
      _user_id: user.id
    });
    if (rateLimitError || !canSendEmail) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded. Too many emails sent recently.'
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    // Check if user has required role using authenticated client
    const authClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const hasRole = await hasRequiredRole(authClient, user.id);
    if (!hasRole) {
      return new Response(JSON.stringify({
        error: 'Insufficient permissions'
      }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    const { ticketId, messageContent, isInternal = false, messageType = "reply" } = await req.json();
    // Get ticket details with department and contact info using service client
    const { data: ticket, error: ticketError } = await serviceClient.from("support_tickets").select(`
        *,
        support_departments (
          name,
          email,
          auto_reply_message
        )
      `).eq("id", ticketId).single();
    if (ticketError || !ticket) {
      console.error("Ticket not found");
      return new Response(JSON.stringify({
        error: "Ticket not found"
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Don't send email for internal messages
    if (isInternal) {
      return new Response(JSON.stringify({
        success: true,
        message: "Internal message, no email sent"
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Don't send email if no contact email
    if (!ticket.contact_email) {
      return new Response(JSON.stringify({
        success: true,
        message: "No contact email, no email sent"
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    // Sanitize the message content to prevent XSS
    const sanitizedContent = sanitizeContent(messageContent);
    const departmentEmail = ticket.support_departments?.email || "support@example.com";
    const departmentName = ticket.support_departments?.name || "Support";
    // Create email thread ID if not exists
    let emailThreadId = ticket.email_thread_id;
    if (!emailThreadId) {
      emailThreadId = `ticket-${ticket.ticket_number}`;
      await serviceClient.from("support_tickets").update({
        email_thread_id: emailThreadId
      }).eq("id", ticketId);
    }
    const subject = messageType === "reply" ? `Re: [${ticket.ticket_number}] ${ticket.subject}` : `[${ticket.ticket_number}] ${ticket.subject}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
          <h2 style="color: #333; margin-bottom: 20px;">Support Ticket Update</h2>
          
          <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
            <p><strong>Ticket:</strong> ${ticket.ticket_number}</p>
            <p><strong>Subject:</strong> ${ticket.subject}</p>
            <p><strong>Status:</strong> ${ticket.status}</p>
            <p><strong>Priority:</strong> ${ticket.priority}</p>
          </div>

          <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
            <h3 style="color: #333; margin-bottom: 15px;">Message:</h3>
            <div style="line-height: 1.6; color: #555;">
              ${sanitizedContent}
            </div>
          </div>

          <div style="border-top: 1px solid #eee; padding-top: 15px; font-size: 12px; color: #666;">
            <p>This is an automated message from ${departmentName}. Please do not reply directly to this email.</p>
            <p>To respond to this ticket, please use our support portal or contact us directly.</p>
          </div>
        </div>
      </div>
    `;
    const emailResponse = await resend.emails.send({
      from: `${departmentName} <${departmentEmail}>`,
      to: [
        ticket.contact_email
      ],
      subject: subject,
      html: emailHtml,
      headers: {
        "Message-ID": `<${emailThreadId}-${Date.now()}@support.example.com>`,
        "In-Reply-To": ticket.email_thread_id ? `<${ticket.email_thread_id}@support.example.com>` : undefined,
        "References": ticket.email_thread_id ? `<${ticket.email_thread_id}@support.example.com>` : undefined
      }
    });
    console.log("Email sent successfully");
    // Update the message with email details using sanitized content
    await serviceClient.from("support_messages").update({
      email_message_id: emailResponse.data?.id,
      user_id: user.id // Track who sent the email
    }).eq("ticket_id", ticketId).eq("content", sanitizedContent).order("created_at", {
      ascending: false
    }).limit(1);
    return new Response(JSON.stringify({
      success: true,
      emailId: emailResponse.data?.id,
      message: "Email sent successfully"
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error in send-support-email function:", error.message);
    return new Response(JSON.stringify({
      error: "Internal server error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};
serve(handler);
