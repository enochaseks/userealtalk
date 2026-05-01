// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEBT_CHECKIN_SYSTEM = `You are a direct but supportive debt accountability coach.

Return ONLY strict JSON with these keys:
- status_overview
- blocker_questions
- support_steps
- encouragement

Rules:
- Each value must be 1-2 short sentences.
- If a debt looks overdue, explicitly say that.
- Ask concrete questions about why payment did not happen: not enough money, forgot, disputed charge, income timing, fear/avoidance, or something else.
- Give practical support, not shame.
- No medical claims. No filler. No regulated financial advice.`;

const getWeekStartIso = () => {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  now.setUTCDate(now.getUTCDate() - diffToMonday);
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
};

const buildWorkersPrompt = (systemText: string, userPrompt: string): string => {
  return `${systemText}\n\nUSER: ${userPrompt}\n\nASSISTANT:`.trim();
};

const extractJsonObject = (raw: string): Record<string, unknown> | null => {
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to brace extraction.
  }

  const start = cleaned.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }

  return null;
};

const callAiWithFallback = async (systemText: string, userPrompt: string): Promise<string | null> => {
  const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const WORKERS_API_KEY = Deno.env.get("WORKERS_API_KEY");
  const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") ?? Deno.env.get("CLOUDFLARE_ACCOUNT_ID");

  if (MISTRAL_API_KEY) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    try {
      const aiResp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          stream: false,
          messages: [
            { role: "system", content: systemText },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: ac.signal,
      });
      if (aiResp.ok) {
        const aiJson = await aiResp.json();
        const text = String(aiJson?.choices?.[0]?.message?.content ?? "").trim();
        if (text) return text;
      }
    } catch {
      // Try next provider.
    } finally {
      clearTimeout(t);
    }
  }

  if (GEMINI_API_KEY) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemText }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          }),
          signal: ac.signal,
        },
      );

      if (resp.ok) {
        const json = await resp.json().catch(() => ({}));
        const text = Array.isArray(json?.candidates?.[0]?.content?.parts)
          ? json.candidates[0].content.parts.map((p: any) => String(p?.text ?? "")).join("")
          : "";
        if (text.trim()) return text.trim();
      }
    } catch {
      // Try next provider.
    } finally {
      clearTimeout(t);
    }
  }

  if (WORKERS_API_KEY && CF_ACCOUNT_ID) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 20000);
    try {
      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CF_ACCOUNT_ID)}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WORKERS_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: buildWorkersPrompt(systemText, userPrompt),
            max_tokens: 700,
          }),
          signal: ac.signal,
        },
      );

      if (resp.ok) {
        const json = await resp.json().catch(() => ({}));
        const text = String(json?.result?.response ?? "").trim();
        if (text) return text;
      }
    } catch {
      // No more fallback.
    } finally {
      clearTimeout(t);
    }
  }

  return null;
};

const sendEmail = async (to: string, subject: string, body: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { ok: false, reason: "missing_email_provider_credentials" };
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [to],
      subject,
      text: body,
    }),
  });

  if (!resp.ok) {
    const resendJson = await resp.json().catch(() => ({}));
    return {
      ok: false,
      reason: String(resendJson?.message || resendJson?.error || "email_send_failed"),
    };
  }

  return { ok: true };
};

const buildDebtPrompt = (planner: any, openDebts: any[]) => {
  const goal = planner?.goal ?? {};
  const jobIncome = planner?.job_income ?? {};
  const benefits = Array.isArray(planner?.benefits) ? planner.benefits : [];
  const totalBenefits = benefits.reduce((sum: number, item: any) => sum + (Number(item?.amountMonthly ?? 0) || 0), 0);

  return [
    `Savings goal: ${String(goal?.title ?? "Not set")}`,
    `Current balance: £${(Number(goal?.currentBalance ?? 0) || 0).toFixed(2)}`,
    `Employment: ${String(planner?.employment_type ?? "not set")}`,
    `Job income: £${(Number(jobIncome?.amount ?? 0) || 0).toFixed(2)} ${String(jobIncome?.frequency ?? "monthly")}`,
    `Benefits total: £${totalBenefits.toFixed(2)} per month`,
    "",
    "Open debts:",
    ...openDebts.map((debt) => {
      const overdue = debt.nextPaymentDate && (!debt.lastPaymentDate || debt.lastPaymentDate < debt.nextPaymentDate)
        ? "possibly overdue"
        : "payment status updated";
      return [
        `- ${debt.name}`,
        `  balance: £${Number(debt.balance ?? 0).toFixed(2)}`,
        `  apr: ${Number(debt.apr ?? 0).toFixed(2)}%`,
        `  minimum payment: £${Number(debt.minPayment ?? 0).toFixed(2)}`,
        `  next payment date: ${debt.nextPaymentDate || "not set"}`,
        `  last payment date: ${debt.lastPaymentDate || "not recorded"}`,
        `  status: ${debt.paymentStatus || "active"}`,
        `  blocker: ${debt.paymentBarrier || "not provided"}`,
        `  review note: ${overdue}`,
      ].join("\n");
    }),
  ].join("\n");
};

const buildEmailBody = (plannerUrl: string, insight: Record<string, unknown>, openDebts: any[]) => {
  const debtList = openDebts
    .map((debt) => `- ${debt.name}: £${Number(debt.balance ?? 0).toFixed(2)} remaining, next payment ${debt.nextPaymentDate || "not set"}, status ${debt.paymentStatus || "active"}`)
    .join("\n");

  return [
    "Hi,",
    "",
    "This is your weekly RealTalk debt check-in.",
    "",
    debtList || "No open debts found.",
    "",
    `Status overview: ${String(insight.status_overview ?? "No clear pattern this week.")}`,
    `Questions to answer: ${String(insight.blocker_questions ?? "What stopped the payment, if anything?")}`,
    `Support: ${String(insight.support_steps ?? "Open your Money Planner, update the debt status, and note any blocker.")}`,
    `Supportive note: ${String(insight.encouragement ?? "Progress counts even when this feels messy.")}`,
    "",
    "Update each debt in Money Planner with the latest payment date, status, and what blocked the payment if it did not happen.",
    plannerUrl,
    "",
    "This is automated support from RealTalk. It will keep checking in weekly while open debts remain.",
  ].join("\n");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing required environment variables.");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new Error("Unauthorized");

    const { data: authUser, error: authError } = await admin.auth.getUser(token);
    if (authError || !authUser?.user) throw new Error("Unauthorized");

    const userId = authUser.user.id;
    const email = authUser.user.email?.trim();
    if (!email) {
      return new Response(JSON.stringify({ skipped: true, reason: "missing_user_email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { force } = await req.json().catch(() => ({ force: false }));

    const { data: setting } = await admin
      .from("user_insight_settings")
      .select("debt_weekly_checkin_enabled, debt_weekly_checkin_email_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    if (!setting?.debt_weekly_checkin_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "debt_checkins_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!setting?.debt_weekly_checkin_email_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "debt_checkin_email_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const weekStart = getWeekStartIso();

    const { data: existingLog } = await admin
      .from("user_debt_checkin_logs")
      .select("id, emailed_at")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (!force && existingLog?.emailed_at) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already_emailed", weekStart }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: planner } = await admin
      .from("user_money_planner")
      .select("goal, debts, benefits, employment_type, job_income")
      .eq("user_id", userId)
      .maybeSingle();

    const debts = Array.isArray(planner?.debts) ? planner.debts : [];
    const openDebts = debts.filter((debt: any) => Number(debt?.balance ?? 0) > 0 && String(debt?.paymentStatus ?? "active") !== "paid-off");

    if (openDebts.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_open_debts", weekStart }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = buildDebtPrompt(planner ?? {}, openDebts);
    const raw = (await callAiWithFallback(DEBT_CHECKIN_SYSTEM, prompt)) || "{}";
    const parsed = extractJsonObject(raw) ?? {};

    const plannerUrl = "https://userealtalk.co.uk/money-planner";
    const subject = `RealTalk debt check-in (${weekStart})`;
    const body = buildEmailBody(plannerUrl, parsed, openDebts);
    const emailResult = await sendEmail(email, subject, body);

    if (!emailResult.ok) {
      return new Response(JSON.stringify({ error: emailResult.reason }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("user_debt_checkin_logs").upsert({
      user_id: userId,
      week_start: weekStart,
      open_debt_count: openDebts.length,
      emailed_at: new Date().toISOString(),
      email_subject: subject,
      email_body: body,
    }, { onConflict: "user_id,week_start" });

    return new Response(JSON.stringify({ ok: true, weekStart, openDebtCount: openDebts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
