import { supabase } from "@/integrations/supabase/client";

export type SubscriptionPlan = "free" | "pro" | "platinum" | "student" | "professional";
export type MeteredFeature = "deep_thinking" | "plan" | "gmail_send" | "voice_input" | "journal_save" | "cv_toolkit";
export type AccessFeature = MeteredFeature | "schedule" | "benefits_helper";
export type UsagePeriodType = "day" | "month";

export const STRIPE_BILLING_ENABLED = true;

const PROFESSIONAL_DEFAULT_EMAILS = new Set([
  "enochaseks@yahoo.co.uk",
  "enochaseks@gmail.com",
]);

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
    pricing: { monthlyGbp: 0, annualGbp: 0 },
    features: [
      "Chat and Vent included",
      "Insights, Brain, and Be Real included",
      "Deep Thinking: 5 per day",
      "Voice input: up to 20 minutes per month",
      "Journal saves: 10 per month",
      "Plan Mode: 3 per month",
      "Gmail send: 5 per month",
      "Schedule: not included",
      "Conversation Memory: up to 100 messages",
      "Benefits Helper (UC/DWP guidance): included",
      "CV Toolkit: 2 uses per day (Review, Job Match, Rewrite only)",
    ],
  },
  {
    plan: "pro",
    title: "Pro",
    blurb: "Higher limits plus schedule and cover letter access.",
    pricing: { monthlyGbp: 3.99, annualGbp: 36 },
    features: [
      "Everything in Free",
      "Schedule included",
      "Deep Thinking: 50 per day",
      "Voice input: up to 1 hour per month",
      "Journal saves: 20 per month",
      "Plan Mode: 15 per month",
      "Gmail send: 25 per month",
      "Conversation Memory: up to 200 messages",
      "Benefits Helper (UC/DWP guidance): included",
      "CV Toolkit: 5 uses per day (Review, Job Match, Rewrite, Cover Letter)",
    ],
  },
  {
    plan: "platinum",
    title: "Platinum",
    blurb: "Unlimited advanced usage and full access.",
    pricing: { monthlyGbp: 11.99, annualGbp: 75.99 },
    features: [
      "Everything in Pro",
      "Deep Thinking: unlimited",
      "Voice input: up to 2 hours per month",
      "Journal saves: 40 per month",
      "Plan Mode: 50 per month",
      "Gmail send: 50 per month",
      "Schedule included",
      "Conversation Memory: up to 300 messages",
      "Benefits Helper (UC/DWP guidance): included",
      "CV Toolkit: 8 uses per day (all tools)",
    ],
  },
  {
    plan: "student",
    title: "Student",
    blurb: "Built for students — CV tools, deep thinking, and planning with no cap on the essentials.",
    pricing: { monthlyGbp: 5.99, annualGbp: 55 },
    features: [
      "Schedule: unlimited",
      "Deep Thinking: unlimited",
      "Voice input: up to 5 hours per month",
      "Journal saves: 120 per month",
      "Plan Mode: unlimited",
      "Gmail send: 100 per month",
      "Conversation Memory: up to 500 messages",
      "CV Toolkit: 15 uses per day (all tools including Personal Statement)",
    ],
  },
  {
    plan: "professional",
    title: "Professional",
    blurb: "For professionals who need the full toolkit with higher limits.",
    pricing: { monthlyGbp: 20, annualGbp: 120 },
    features: [
      "Schedule: unlimited",
      "Deep Thinking: unlimited",
      "Voice input: up to 10 hours per month",
      "Journal saves: 200 per month",
      "Plan Mode: unlimited",
      "Gmail send: 200 per month",
      "Conversation Memory: unlimited",
      "CV Toolkit: 25 uses per day (all tools)",
    ],
  },
];

const PLAN_LIMITS: Record<SubscriptionPlan, Record<AccessFeature, number | boolean | null>> = {
  free: {
    schedule: false,
    benefits_helper: true,
    deep_thinking: 5,
    plan: 3,
    gmail_send: 5,
    voice_input: 20 * 60,            // 20 minutes/month in seconds
    journal_save: 10,               // per month
    cv_toolkit: 2,                  // per day
  },
  pro: {
    schedule: true,
    benefits_helper: true,
    deep_thinking: 50,
    plan: 15,
    gmail_send: 25,
    voice_input: 1 * 60 * 60,      // 1 hour/month in seconds
    journal_save: 20,               // per month
    cv_toolkit: 5,                  // per day
  },
  platinum: {
    schedule: true,
    benefits_helper: true,
    deep_thinking: null,
    plan: 50,
    gmail_send: 50,
    voice_input: 2 * 60 * 60,      // 2 hours/month in seconds
    journal_save: 40,               // per month
    cv_toolkit: 8,                  // per day
  },
  student: {
    schedule: true,
    benefits_helper: false,
    deep_thinking: null,
    plan: null,
    gmail_send: 100,
    voice_input: 5 * 60 * 60,      // 5 hours/month in seconds (student)
    journal_save: 120,              // per month
    cv_toolkit: 15,                 // per day
  },
  professional: {
    schedule: true,
    benefits_helper: false,
    deep_thinking: null,
    plan: null,
    gmail_send: 200,
    voice_input: 10 * 60 * 60,     // 10 hours/month in seconds (professional)
    journal_save: 200,              // per month (unchanged)
    cv_toolkit: 25,                 // per day
  },
};

const FEATURE_PERIOD: Record<MeteredFeature, UsagePeriodType> = {
  deep_thinking: "day",
  plan: "month",
  gmail_send: "month",
  voice_input: "month",
  journal_save: "month",
  cv_toolkit: "day",
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

  let defaultPlan: SubscriptionPlan = "free";
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const authUser = authData.user;
  const normalizedEmail = authUser?.email?.trim().toLowerCase() ?? "";
  if (authUser?.id === userId && PROFESSIONAL_DEFAULT_EMAILS.has(normalizedEmail)) {
    defaultPlan = "professional";
  }

  const { data: inserted, error: insertError } = await supabase
    .from("user_subscriptions")
    .insert({ user_id: userId, plan: defaultPlan, status: "active" })
    .select("user_id, plan, status")
    .single();

  if (insertError) throw insertError;
  return inserted;
};

export const loadSubscriptionSnapshot = async (userId: string): Promise<SubscriptionSnapshot> => {
  const subscription = await ensureSubscriptionRow(userId);
  const rawPlan = String(subscription.plan || "free");
  const validPlans: SubscriptionPlan[] = ["free", "pro", "platinum", "student", "professional"];
  const plan: SubscriptionPlan = validPlans.includes(rawPlan as SubscriptionPlan)
    ? (rawPlan as SubscriptionPlan)
    : "free";

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

export const consumeMeteredFeature = async (userId: string, feature: MeteredFeature, amount = 1) => {
  const requestedAmount = Math.max(1, Math.floor(amount));
  const snapshot = await loadSubscriptionSnapshot(userId);
  const featureUsage = snapshot.usage[feature];

  if (featureUsage.limit !== null && featureUsage.used >= featureUsage.limit) {
    return { allowed: false, consumed: 0, snapshot } as const;
  }

  if (featureUsage.limit === null) {
    return { allowed: true, consumed: 0, snapshot } as const;
  }

  const periodType = FEATURE_PERIOD[feature];
  const periodKey = getCurrentPeriodKey(periodType);
  const remainingBeforeConsume = Math.max(0, featureUsage.limit - featureUsage.used);
  const amountToConsume = Math.min(requestedAmount, remainingBeforeConsume);

  if (amountToConsume <= 0) {
    return { allowed: false, consumed: 0, snapshot } as const;
  }

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
      used_count: amountToConsume,
    });
    if (insertError) throw insertError;
  } else {
    const { error: updateError } = await supabase
      .from("user_feature_usage")
      .update({ used_count: Number(existing.used_count) + amountToConsume })
      .eq("id", existing.id);
    if (updateError) throw updateError;
  }

  const refreshed = await loadSubscriptionSnapshot(userId);
  return { allowed: true, consumed: amountToConsume, snapshot: refreshed } as const;
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
    free: 100,
    pro: 200,
    platinum: 300,
    student: 500,
    professional: null,
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
