import { supabase } from "@/integrations/supabase/client";

export type QuickStartSupportType = "clarity" | "plan" | "encouragement" | "accountability";

export type QuickStartPayload = {
  topStruggle: string;
  weeklyWin: string;
  supportType: QuickStartSupportType;
  createdAt: string;
};

export const QUICK_START_STRUGGLE_OPTIONS = [
  "Overthinking everything",
  "Stress and burnout",
  "Money worries",
  "Work or study pressure",
  "Relationship problems",
  "Low motivation",
  "Feeling stuck and unsure what to do",
  "Anxiety about the future",
] as const;

export const QUICK_START_WIN_OPTIONS = [
  "Feel calmer and less overwhelmed",
  "Have one clear plan for the week",
  "Make one decision I've been avoiding",
  "Get back on top of work or study",
  "Sort out one money problem",
  "Handle one difficult conversation well",
  "Follow through on one important task",
  "End the week feeling more in control",
] as const;

type QuickStartProfileRow = {
  quick_start_top_struggle: string | null;
  quick_start_weekly_win: string | null;
  quick_start_support_type: QuickStartSupportType | null;
  quick_start_updated_at: string | null;
  quick_start_last_applied_at: string | null;
};

export const QUICK_START_STORAGE_KEY = "realtalk_quick_start_pending";
const QUICK_START_LEGACY_STORAGE_KEY = "realtalk_quick_start";

const SUPPORT_LABELS: Record<QuickStartSupportType, string> = {
  clarity: "clear thinking and perspective",
  plan: "a practical step-by-step plan",
  encouragement: "calm encouragement and reassurance",
  accountability: "gentle accountability and follow-through",
};

export const readQuickStartPayload = (): QuickStartPayload | null => {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(QUICK_START_STORAGE_KEY) ?? localStorage.getItem(QUICK_START_LEGACY_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<QuickStartPayload>;
    const topStruggle = String(parsed.topStruggle ?? "").trim();
    const weeklyWin = String(parsed.weeklyWin ?? "").trim();
    const supportType = parsed.supportType;
    const createdAt = String(parsed.createdAt ?? new Date().toISOString());

    if (!topStruggle || !weeklyWin) return null;
    if (supportType !== "clarity" && supportType !== "plan" && supportType !== "encouragement" && supportType !== "accountability") {
      return null;
    }

    return { topStruggle, weeklyWin, supportType, createdAt };
  } catch {
    return null;
  }
};

export const writeQuickStartPayload = (payload: QuickStartPayload) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(QUICK_START_STORAGE_KEY, JSON.stringify(payload));
  localStorage.removeItem(QUICK_START_LEGACY_STORAGE_KEY);
};

export const clearQuickStartPayload = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(QUICK_START_STORAGE_KEY);
  localStorage.removeItem(QUICK_START_LEGACY_STORAGE_KEY);
};

const rowToPayload = (row: QuickStartProfileRow | null | undefined): QuickStartPayload | null => {
  if (!row) return null;

  const topStruggle = String(row.quick_start_top_struggle ?? "").trim();
  const weeklyWin = String(row.quick_start_weekly_win ?? "").trim();
  const supportType = row.quick_start_support_type;
  const createdAt = String(row.quick_start_updated_at ?? new Date().toISOString());

  if (!topStruggle || !weeklyWin) return null;
  if (supportType !== "clarity" && supportType !== "plan" && supportType !== "encouragement" && supportType !== "accountability") {
    return null;
  }

  return { topStruggle, weeklyWin, supportType, createdAt };
};

export const loadQuickStartProfile = async (userId: string): Promise<{ payload: QuickStartPayload | null; hasPendingApply: boolean }> => {
  const client = supabase as any;
  const result = await client
    .from("user_memory_profiles")
    .select("quick_start_top_struggle, quick_start_weekly_win, quick_start_support_type, quick_start_updated_at, quick_start_last_applied_at")
    .eq("user_id", userId)
    .maybeSingle();

  const row = result.data as QuickStartProfileRow | null;
  const payload = rowToPayload(row);
  const hasPendingApply = Boolean(
    payload && (!row?.quick_start_last_applied_at || (row.quick_start_updated_at && row.quick_start_updated_at > row.quick_start_last_applied_at)),
  );

  return { payload, hasPendingApply };
};

export const saveQuickStartProfile = async (userId: string, payload: QuickStartPayload) => {
  const client = supabase as any;
  const now = new Date().toISOString();
  await client.from("user_memory_profiles").upsert({
    user_id: userId,
    quick_start_top_struggle: payload.topStruggle,
    quick_start_weekly_win: payload.weeklyWin,
    quick_start_support_type: payload.supportType,
    quick_start_updated_at: now,
    quick_start_last_applied_at: null,
    updated_at: now,
  });
};

export const markQuickStartApplied = async (userId: string) => {
  const client = supabase as any;
  const now = new Date().toISOString();
  await client
    .from("user_memory_profiles")
    .upsert({ user_id: userId, quick_start_last_applied_at: now, updated_at: now });
};

export const buildQuickStartPrompt = (payload: QuickStartPayload) =>
  [
    "Quick Start context:",
    `My top struggle right now is: ${payload.topStruggle}.`,
    `One small win I want this week is: ${payload.weeklyWin}.`,
    `The kind of support I need most is: ${SUPPORT_LABELS[payload.supportType]}.`,
    "Please tailor this first session to that context, help me get clear quickly, and end with the best first step for today.",
  ].join(" ");