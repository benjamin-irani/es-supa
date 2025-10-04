import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const logStep = (step, details)=>{
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    logStep("Function started");
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", {
      userId: user.id,
      email: user.email
    });
    const { priceId, mode = "payment", quantity = 1, amount, currency, customAmount } = await req.json();
    // Support both price ID mode and dynamic pricing mode
    if (!priceId && (!amount || !currency)) {
      throw new Error("Either priceId or amount+currency is required");
    }
    logStep("Request data", {
      priceId,
      mode,
      quantity,
      amount,
      currency,
      customAmount
    });
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil"
    });
    // Check if customer exists
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 1
    });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", {
        customerId
      });
    }
    const origin = req.headers.get("origin") || "http://localhost:3000";
    // Create checkout session
    let sessionConfig = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: mode,
      success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscriptions`,
      allow_promotion_codes: true
    };
    // Handle dynamic pricing or price ID
    if (priceId) {
      // Use existing price ID
      sessionConfig.line_items = [
        {
          price: priceId,
          quantity: quantity
        }
      ];
    } else {
      // Create dynamic price for custom amounts
      const finalAmount = customAmount || amount;
      sessionConfig.line_items = [
        {
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: Math.round(finalAmount * 100),
            product_data: {
              name: mode === 'subscription' ? 'Monthly Subscription' : 'Donation',
              description: mode === 'subscription' ? 'Monthly subscription to support our mission' : 'One-time donation to support sustainable energy development'
            },
            ...mode === 'subscription' && {
              recurring: {
                interval: 'month'
              }
            }
          },
          quantity: 1
        }
      ];
    }
    const session = await stripe.checkout.sessions.create(sessionConfig);
    logStep("Checkout session created", {
      sessionId: session.id,
      url: session.url
    });
    return new Response(JSON.stringify({
      url: session.url
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-checkout", {
      message: errorMessage
    });
    return new Response(JSON.stringify({
      error: errorMessage
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
});
