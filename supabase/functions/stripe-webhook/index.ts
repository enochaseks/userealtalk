// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

// Maps Stripe price IDs → plan names at runtime
const buildPriceToplan = (): Record<string, string> => {
  const map: Record<string, string> = {};
  const keys: Array<[string, string]> = [
    ["STRIPE_PRO_MONTHLY_PRICE_ID",      "pro"],
    ["STRIPE_PRO_ANNUAL_PRICE_ID",       "pro"],
    ["STRIPE_PLATINUM_MONTHLY_PRICE_ID", "platinum"],
    ["STRIPE_PLATINUM_ANNUAL_PRICE_ID",  "platinum"],
    ["STRIPE_STUDENT_MONTHLY_PRICE_ID",  "student"],
    ["STRIPE_STUDENT_ANNUAL_PRICE_ID",   "student"],
    ["STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID", "professional"],
    ["STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID",  "professional"],
  ];
  for (const [envKey, plan] of keys) {
    const id = Deno.env.get(envKey);
    if (id) map[id] = plan;
  }
  return map;
};

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
  const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify Stripe signature
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response(`Webhook Error: ${err instanceof Error ? err.message : "Unknown"}`, { status: 400 });
  }

  const priceToPlan = buildPriceToplan();

  const upsertSubscription = async (params: {
    userId?: string;
    customerId: string;
    plan: string;
    status: string;
    subscriptionId: string;
    priceId?: string;
    currentPeriodEnd?: number;
    cancelAtPeriodEnd?: boolean;
  }) => {
    const { userId, customerId, plan, status, subscriptionId, priceId, currentPeriodEnd, cancelAtPeriodEnd } = params;

    // Resolve user_id from customer if not provided
    let resolvedUserId = userId;
    if (!resolvedUserId) {
      const { data } = await admin
        .from("user_subscriptions")
        .select("user_id")
        .eq("provider_customer_id", customerId)
        .maybeSingle();
      resolvedUserId = data?.user_id;
    }

    if (!resolvedUserId) {
      // Try to resolve from Stripe customer metadata
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) {
        resolvedUserId = (customer as Stripe.Customer).metadata?.supabase_user_id;
      }
    }

    if (!resolvedUserId) {
      console.error("Could not resolve user_id for customer", customerId);
      return;
    }

    await admin.from("user_subscriptions").upsert(
      {
        user_id: resolvedUserId,
        plan,
        status,
        billing_provider: "stripe",
        provider_customer_id: customerId,
        provider_subscription_id: subscriptionId,
        stripe_price_id: priceId ?? null,
        current_period_end: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        cancel_at_period_end: cancelAtPeriodEnd ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? (priceToPlan[priceId] ?? "free") : "free";

        await upsertSubscription({
          userId: subscription.metadata?.supabase_user_id ?? session.metadata?.supabase_user_id,
          customerId: session.customer as string,
          plan,
          status: subscription.status,
          subscriptionId: subscription.id,
          priceId,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? (priceToPlan[priceId] ?? "free") : "free";

        await upsertSubscription({
          userId: subscription.metadata?.supabase_user_id,
          customerId: subscription.customer as string,
          plan,
          status: subscription.status,
          subscriptionId: subscription.id,
          priceId,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await upsertSubscription({
          userId: subscription.metadata?.supabase_user_id,
          customerId: subscription.customer as string,
          plan: "free",
          status: "canceled",
          subscriptionId: subscription.id,
          cancelAtPeriodEnd: false,
        });
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }
  } catch (e) {
    console.error("Error handling webhook event:", event.type, e);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
