// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRICE_MAP: Record<string, string | undefined> = {
  "pro:monthly":          Deno.env.get("STRIPE_PRO_MONTHLY_PRICE_ID"),
  "pro:annual":           Deno.env.get("STRIPE_PRO_ANNUAL_PRICE_ID"),
  "platinum:monthly":     Deno.env.get("STRIPE_PLATINUM_MONTHLY_PRICE_ID"),
  "platinum:annual":      Deno.env.get("STRIPE_PLATINUM_ANNUAL_PRICE_ID"),
  "student:monthly":      Deno.env.get("STRIPE_STUDENT_MONTHLY_PRICE_ID"),
  "student:annual":       Deno.env.get("STRIPE_STUDENT_ANNUAL_PRICE_ID"),
  "professional:monthly": Deno.env.get("STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID"),
  "professional:annual":  Deno.env.get("STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID"),
};

/** Academic email suffixes — must match src/lib/academic-email.ts */
const ACADEMIC_SUFFIXES = [
  ".ac.uk", ".edu", ".edu.au", ".ac.nz", ".edu.ca",
  ".ac.at", ".ac.be", ".ac.cy", ".ac.il", ".ac.in", ".ac.jp",
  ".ac.ke", ".ac.kr", ".ac.ng", ".ac.za",
  ".edu.ar", ".edu.br", ".edu.cn", ".edu.co", ".edu.eg",
  ".edu.gh", ".edu.hk", ".edu.mx", ".edu.my", ".edu.ng",
  ".edu.pk", ".edu.ph", ".edu.sg", ".edu.tr", ".edu.tw", ".edu.vn",
];

function isAcademicEmail(email: string): boolean {
  const lower = email.toLowerCase().trim();
  return ACADEMIC_SUFFIXES.some((s) => lower.endsWith(s));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe is not configured yet." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate user
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { plan, cycle, returnUrl } = await req.json();

    if (!plan || !cycle || !returnUrl) {
      return new Response(JSON.stringify({ error: "Missing plan, cycle, or returnUrl" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Student plan requires an academic email address
    if (plan === "student") {
      const email = user.email ?? "";
      if (!isAcademicEmail(email)) {
        return new Response(JSON.stringify({
          error: "The Student plan is only available to users with an academic email address (e.g. .ac.uk, .edu). Please use your university email to subscribe.",
          code: "ACADEMIC_EMAIL_REQUIRED",
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const priceId = PRICE_MAP[`${plan}:${cycle}`];
    if (!priceId) {
      return new Response(JSON.stringify({ error: `No price configured for ${plan}:${cycle}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    // Get or create Stripe customer
    const { data: subRow } = await admin
      .from("user_subscriptions")
      .select("provider_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId: string = subRow?.provider_customer_id ?? "";

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Upsert the row so the customer ID is stored
      await admin.from("user_subscriptions").upsert({
        user_id: user.id,
        plan: "free",
        status: "active",
        billing_provider: "stripe",
        provider_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}checkout=success`,
      cancel_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}checkout=cancelled`,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      allow_promotion_codes: true,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stripe-checkout error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
