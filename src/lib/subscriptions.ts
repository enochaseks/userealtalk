import { supabase } from "@/integrations/supabase/client";

export type SubscriptionPlan = "free" | "pro" | "platinum";
export type MeteredFeature = "deep_thinking" | "plan" | "gmail_send";
export type AccessFeature = MeteredFeature | "schedule";
export type UsagePeriodType = "day" | "month";

export const STRIPE_BILLING_ENABLED = false;

export type SubscriptionSnapshot = {
  plan: SubscriptionPlan;
  status: string;
  usage: Record<MeteredFeature, { used: number; limit: number | null; remaining: number | null }>;
};

export type PlanCatalogItem = {
  plan: SubscriptionPlan;
  title: string;
  blurb: string;
  pricing: {
    monthlyGbp: number;
    annualGbp: number;
  };
  features: string[];
};

export const PLAN_CATALOG: PlanCatalogItem[] = [
  {
    plan: "free",
    title: "Free",
    blurb: "Core chat with starter limits for advanced features.",
    pricing: {
      monthlyGbp: 0,
      annualGbp: 0,
    },
    features: [
      "Chat and Vent included",
      "Insights, Brain, and Be Real included",
      "Deep Thinking: 5 per day",
      "Plan Mode: 3 per month",
      "Gmail send: 5 per month",
      "Schedule: not included",
      "Conversation Memory: up to 100 messages",
    ],
  },
  {
    plan: "pro",
    title: "Pro",
    blurb: "Higher monthly limits plus schedule access.",
    pricing: {
      monthlyGbp: 3.99,
      annualGbp: 36,
    },
    features: [
      "Everything in Free",
      "Schedule included",
      "Deep Thinking: 50 per day",
      "Plan Mode: 25 per month",
      "Gmail send: 50 per month",
      "Conversation Memory: up to 300 messages",
    ],
  },
  {
    plan: "platinum",
    title: "Platinum",
    blurb: "Unlimited advanced usage and full access.",
    pricing: {
      monthlyGbp: 11.99,
      annualGbp: 75.99,
    },
    features: [
      "Everything in Pro",
      "Deep Thinking: unlimited",
      "Plan Mode: unlimited",
      "Gmail send: unlimited",
      "Schedule included",
      "Conversation Memory: unlimited messages",
    ],
  },
];

const PLAN_LIMITS: Record<SubscriptionPlan, Record<AccessFeature, number | boolean | null>> = {
  free: {
    schedule: false,
    deep_thinking: 5,
    plan: 3,
    gmail_send: 5,
  },
  pro: {
    schedule: true,
    deep_thinking: 50,
    plan: 25,
    gmail_send: 50,
  },
  platinum: {
    schedule: true,
    deep_thinking: null,
    plan: null,
    gmail_send: null,
  },
};

const FEATURE_PERIOD: Record<MeteredFeature, UsagePeriodType> = {
  deep_thinking: "day",
  plan: "month",
  gmail_send: "month",
};

export const getCurrentPeriodKey = (periodType: UsagePeriodType, now = new Date()): string => {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return periodType === "day" ? `${year}-${month}-${day}` : `${year}-${month}`;
};

export const getFeatureLimit = (plan: SubscriptionPlan, feature: AccessFeature): number | boolean | null =>
  PLAN_LIMITS[plan][feature];

export const getUsageWindowLabel = (feature: MeteredFeature): string =>
  FEATURE_PERIOD[feature] === "day" ? "today" : "this month";

export const hasFeatureAccess = (plan: SubscriptionPlan, feature: AccessFeature): boolean => {
  const limit = PLAN_LIMITS[plan][feature];
  if (typeof limit === "boolean") return limit;
  return limit === null || limit > 0;
};

const ensureSubscriptionRow = async (userId: string) => {
  const { data: existing, error: existingError } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return existing;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("user_subscriptions")
    .insert({ user_id: userId, plan: "free", status: "active" })
    .select("user_id, plan, status")
    .single();

  if (insertError) throw insertError;
  return inserted;
};

export const loadSubscriptionSnapshot = async (userId: string): Promise<SubscriptionSnapshot> => {
  const subscription = await ensureSubscriptionRow(userId);
  const rawPlan = String(subscription.plan || "free");
  const plan: SubscriptionPlan = rawPlan === "pro" || rawPlan === "platinum" ? rawPlan : "free";

  const usageQueries = (Object.keys(FEATURE_PERIOD) as MeteredFeature[]).map((feature) => ({
    feature,
    period_type: FEATURE_PERIOD[feature],
    period_key: getCurrentPeriodKey(FEATURE_PERIOD[feature]),
  }));

  const orFilter = usageQueries
    .map((item) => `and(feature.eq.${item.feature},period_type.eq.${item.period_type},period_key.eq.${item.period_key})`)
    .join(",");

  const { data: usageRows, error: usageError } = await supabase
    .from("user_feature_usage")
    .select("feature, used_count, period_type, period_key")
    .eq("user_id", userId)
    .or(orFilter);

  if (usageError) throw usageError;

  const usage = Object.fromEntries(
    (Object.keys(FEATURE_PERIOD) as MeteredFeature[]).map((feature) => {
      const row = usageRows?.find((item) => item.feature === feature);
      const limit = getFeatureLimit(plan, feature) as number | null;
      const used = Number(row?.used_count ?? 0);
      const remaining = limit === null ? null : Math.max(0, limit - used);
      return [feature, { used, limit, remaining }];
    }),
  ) as SubscriptionSnapshot["usage"];

  return {
    plan,
    status: subscription.status || "active",
    usage,
  };
};

export const consumeMeteredFeature = async (userId: string, feature: MeteredFeature) => {
  const snapshot = await loadSubscriptionSnapshot(userId);
  const featureUsage = snapshot.usage[feature];

  if (featureUsage.limit !== null && featureUsage.used >= featureUsage.limit) {
    return { allowed: false, snapshot } as const;
  }

  if (featureUsage.limit === null) {
    return { allowed: true, snapshot } as const;
  }

  const periodType = FEATURE_PERIOD[feature];
  const periodKey = getCurrentPeriodKey(periodType);

  const { data: existing, error: existingError } = await supabase
    .from("user_feature_usage")
    .select("id, used_count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("period_type", periodType)
    .eq("period_key", periodKey)
    .maybeSingle();

  if (existingError) throw existingError;

  if (!existing) {
    const { error: insertError } = await supabase.from("user_feature_usage").insert({
      user_id: userId,
      feature,
      period_type: periodType,
      period_key: periodKey,
      used_count: 1,
    });
    if (insertError) throw insertError;
  } else {
    const { error: updateError } = await supabase
      .from("user_feature_usage")
      .update({ used_count: Number(existing.used_count) + 1 })
      .eq("id", existing.id);
    if (updateError) throw updateError;
  }

  const refreshed = await loadSubscriptionSnapshot(userId);
  return { allowed: true, snapshot: refreshed } as const;
};

export const setSubscriptionPlan = async (userId: string, plan: SubscriptionPlan): Promise<SubscriptionSnapshot> => {
  if (!STRIPE_BILLING_ENABLED) {
    throw new Error("Plan switching is temporarily disabled until Stripe billing is enabled.");
  }

  const existing = await ensureSubscriptionRow(userId);

  const { error } = await supabase
    .from("user_subscriptions")
    .update({ plan, status: existing.status || "active", updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) throw error;

  return loadSubscriptionSnapshot(userId);
};

// Conversation memory limits based on subscription tier
// These determine how many messages are retrieved from database for context
export const getConversationMemoryLimit = (plan: SubscriptionPlan): number | null => {
  const limits: Record<SubscriptionPlan, number | null> = {
    free: 100, // Free tier: up to 100 messages
    pro: 300, // Pro tier: up to 300 messages
    platinum: null, // Platinum: unlimited (null = no limit)
  };
  return limits[plan];
};

// Warning threshold - when to alert user about approaching memory limit
export const getConversationMemoryWarningThreshold = (plan: SubscriptionPlan): number | null => {
  const limits = getConversationMemoryLimit(plan);
  if (limits === null) return null; // No warning for unlimited
  return Math.floor(limits * 0.85); // Warn at 85% of limit
};

// Helper to get memory limit for a user
export const getConversationMemoryForUser = async (userId: string): Promise<number | null> => {
  const snapshot = await loadSubscriptionSnapshot(userId);
  return getConversationMemoryLimit(snapshot.plan);
};
