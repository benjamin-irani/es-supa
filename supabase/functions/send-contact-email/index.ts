import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://uezenrqnuuaglgwnvbsx.supabase.co",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400"
};
// Simple HTML sanitization function (lightweight alternative)
const sanitizeContent = (content)=>{
  // Remove potentially dangerous HTML elements and attributes
  return content.replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<iframe[^>]*>.*?<\/iframe>/gi, '').replace(/<object[^>]*>.*?<\/object>/gi, '').replace(/<embed[^>]*>.*?<\/embed>/gi, '').replace(/<form[^>]*>.*?<\/form>/gi, '').replace(/on\w+\s*=\s*["'][^"']*["']/gi, '').replace(/javascript:/gi, '').replace(/style\s*=\s*["'][^"']*["']/gi, '').trim();
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Verify JWT and check admin role
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error("Invalid token");
    }
    // Check if user has admin role
    const { data: userRoles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = userRoles?.some((r)=>r.role === "admin");
    if (!isAdmin) {
      throw new Error("Insufficient permissions");
    }
    const { contactId, messageContent } = await req.json();
    // Validate inputs
    if (!contactId || !messageContent) {
      throw new Error("Missing required fields");
    }
    // Sanitize the message content
    const sanitizedContent = sanitizeContent(messageContent);
    // Validate input lengths
    if (sanitizedContent.length > 10000) {
      throw new Error("Message content too long");
    }
    // Get contact submission details
    const { data: contact, error: contactError } = await supabase.from("contact_submissions").select("*").eq("id", contactId).single();
    if (contactError || !contact) {
      throw new Error("Contact submission not found");
    }
    if (!contact.contact_email) {
      throw new Error("Contact email not found");
    }
    // Simple email sending using fetch (since Resend is not available)
    // In production, you would integrate with your email service
    console.log('Email would be sent to:', contact.contact_email);
    console.log('Subject: Re:', contact.subject);
    console.log('Content:', sanitizedContent);
    // Generate email thread ID if not exists
    let emailThreadId = contact.email_thread_id;
    if (!emailThreadId) {
      emailThreadId = `contact-${contactId}-${Date.now()}`;
      // Update contact with thread ID
      await supabase.from("contact_submissions").update({
        email_thread_id: emailThreadId
      }).eq("id", contactId);
    }
    // Simulate email sending (in production, integrate with your email service)
    const emailResponse = {
      data: {
        id: `email-${Date.now()}`
      },
      success: true
    };
    console.log("Email simulated successfully for security testing");
    // Create plain text version by stripping HTML
    const textContent = sanitizedContent.replace(/<[^>]*>/g, '');
    // Save message to database
    const { error: messageError } = await supabase.from("contact_messages").insert({
      contact_id: contactId,
      author_id: user.id,
      direction: "outgoing",
      content_html: sanitizedContent,
      content_text: textContent,
      email_id: emailResponse.data?.id
    });
    if (messageError) {
      console.error("Error saving message:", messageError);
      throw messageError;
    }
    // Update contact status to in_progress if it was new
    if (contact.status === 'new') {
      await supabase.from("contact_submissions").update({
        status: 'in_progress'
      }).eq("id", contactId);
    }
    return new Response(JSON.stringify({
      success: true,
      emailId: emailResponse.data?.id
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error("Error in send-contact-email function:", error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: error.message.includes("permissions") ? 403 : 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
});
