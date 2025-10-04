import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import DOMPurify from "npm:isomorphic-dompurify@2.26.0";
import { Webhook } from "https://esm.sh/svix@1.15.0";
// Flexible CORS for webhook endpoints with additional webhook sources
const getAllowedOrigins = ()=>{
  const requestOrigin = Deno.env.get("REQUEST_ORIGIN");
  const prodOrigin = Deno.env.get("ALLOWED_ORIGIN");
  // If explicit production origin is set, use it
  if (prodOrigin) {
    return prodOrigin;
  }
  // Support webhook sources and application origins
  const allowedOrigins = [
    "https://resend.com",
    "https://cms.eywa365.net",
    "https://coniunus.co",
    "http://localhost:5173",
    "http://localhost:3000"
  ];
  // If request origin is in allowed list, use it
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  // Default to first production origin or webhook source
  return prodOrigin || "https://cms.eywa365.net";
};
const corsHeaders = {
  'Access-Control-Allow-Origin': getAllowedOrigins(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-signature, svix-timestamp, svix-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400'
};
// Sanitize HTML/text content
function sanitizeContent(content) {
  if (!content) return '';
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
// Verify Svix webhook signature for Resend webhooks
function verifySvixSignature(payload, headers, secret) {
  if (!secret) return false;
  try {
    const svixSignature = headers.get("svix-signature");
    const svixTimestamp = headers.get("svix-timestamp");
    const svixId = headers.get("svix-id");
    if (!svixSignature || !svixTimestamp || !svixId) {
      console.log('Missing Svix headers');
      return false;
    }
    const webhook = new Webhook(secret);
    // Svix verify method expects headers object
    const svixHeaders = {
      "svix-signature": svixSignature,
      "svix-timestamp": svixTimestamp,
      "svix-id": svixId
    };
    webhook.verify(payload, svixHeaders);
    return true;
  } catch (error) {
    console.log('Svix signature verification failed:', error.message);
    return false;
  }
}
const handler = async (req)=>{
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    // Get the raw body for signature verification
    const rawBody = await req.text();
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    // Enforce webhook signature verification - this is now mandatory for security
    if (!webhookSecret) {
      console.error('WEBHOOK_SECRET environment variable is required but not configured');
      return new Response(JSON.stringify({
        error: "Server configuration error"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    if (!verifySvixSignature(rawBody, req.headers, webhookSecret)) {
      console.error('Invalid webhook signature - potential security threat');
      return new Response(JSON.stringify({
        error: "Invalid signature"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
    console.log('Webhook signature verified successfully');
    const emailData = JSON.parse(rawBody);
    console.log("Received email from:", emailData.from.email);
    // Sanitize all email content
    const sanitizedText = sanitizeContent(emailData.text || '');
    const sanitizedHtml = sanitizeContent(emailData.html || '');
    const sanitizedSubject = sanitizeContent(emailData.subject || '');
    // Extract ticket number from subject line
    const ticketNumberMatch = sanitizedSubject.match(/\[([^\]]+)\]/);
    const ticketNumber = ticketNumberMatch?.[1];
    let ticketId = null;
    if (ticketNumber) {
      // Find existing ticket by number
      const { data: existingTicket } = await supabaseClient.from("support_tickets").select("id, email_thread_id, contact_email").eq("ticket_number", ticketNumber).single();
      if (existingTicket) {
        ticketId = existingTicket.id;
        // Update email thread ID if not set
        if (!existingTicket.email_thread_id) {
          await supabaseClient.from("support_tickets").update({
            email_thread_id: emailData.messageId,
            contact_email: emailData.from.email
          }).eq("id", ticketId);
        }
      }
    }
    // If no existing ticket found, create a new one
    if (!ticketId) {
      // Try to find department by email
      const { data: departments } = await supabaseClient.from("support_departments").select("id, name, auto_reply_enabled, auto_reply_message").eq("is_active", true);
      // Find department by matching email or use default
      const department = departments?.find((d)=>emailData.to.some((to)=>to.email.includes(d.name?.toLowerCase() || ""))) || departments?.[0];
      // Create new ticket with sanitized content
      const { data: newTicket, error: createError } = await supabaseClient.from("support_tickets").insert({
        subject: sanitizedSubject.replace(/^\[.*?\]\s*/, ""),
        description: sanitizedText || sanitizedHtml,
        contact_email: emailData.from.email,
        contact_name: emailData.from.name || emailData.from.email,
        department_id: department?.id,
        email_thread_id: emailData.messageId,
        status: "open",
        priority: "medium"
      }).select("id, ticket_number").single();
      if (createError) {
        console.error("Failed to create ticket");
        throw new Error("Failed to create ticket");
      }
      ticketId = newTicket.id;
      console.log("Created new ticket:", newTicket.ticket_number);
      // Send auto-reply if enabled (but only for new tickets from verified sources)
      if (department?.auto_reply_enabled && department.auto_reply_message && webhookSecret) {
        try {
          await supabaseClient.functions.invoke("send-support-email", {
            body: {
              ticketId: newTicket.id,
              messageContent: department.auto_reply_message,
              messageType: "auto-reply"
            }
          });
        } catch (autoReplyError) {
          console.log("Auto-reply failed, continuing anyway");
        }
      }
    }
    // Add the email as a message to the ticket with sanitized content (with idempotency check)
    const { error: messageError } = await supabaseClient.from("support_messages").insert({
      ticket_id: ticketId,
      content: sanitizedText || sanitizedHtml,
      message_type: "reply",
      author_name: emailData.from.name || emailData.from.email,
      author_email: emailData.from.email,
      email_message_id: emailData.messageId,
      email_in_reply_to: emailData.inReplyTo,
      is_internal: false
    });
    if (messageError) {
      // Check if this is a duplicate message (idempotency)
      if (messageError.code === '23505' && messageError.message?.includes('idx_support_messages_email_unique')) {
        console.log('Duplicate message ignored:', emailData.messageId);
        return new Response(JSON.stringify({
          success: true,
          message: 'Duplicate message ignored',
          messageId: emailData.messageId
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 200
        });
      }
      console.error("Failed to create message:", messageError);
      throw new Error("Failed to create message");
    }
    return new Response(JSON.stringify({
      success: true,
      ticketId,
      message: "Email processed successfully"
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error in receive-support-email function:", error.message);
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
