// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INSIGHT_SYSTEM = `You are a sharp, honest weekly wellbeing analyst. You read a user's chat history and write a concise weekly insight report.

Return ONLY strict JSON with these keys:
- emotion_trend
- thought_patterns
- calm_progress
- overthinking_reduction
- ai_help_summary
- what_worked
- what_didnt
- response_patterns
- boundary_respect

Rules:
- Each value must be 1–2 short, specific sentences.
- Reference actual topics, emotions, situations, or phrases from the conversation. Do NOT write generic filler.
- NEVER write phrases like "still forming", "still being gathered", "still being observed", "still being tracked", "still being measured", "still limited". These are meaningless and forbidden.
- If a field genuinely has no signal, write exactly: "No clear pattern this week."
- Be direct and honest — name what actually happened in the chat.
- No medical diagnoses. No invented content.
- Focus on: what emotions came up, how the user responded to advice, what types of thinking appeared, where progress showed, and where the conversation fell flat.`;

const getWeekStartIso = () => {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  now.setUTCDate(now.getUTCDate() - diffToMonday);
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
};

const isFridayUtc = () => new Date().getUTCDay() === 5;

const buildWorkersPrompt = (systemText: string, userPrompt: string): string => {
  return `${systemText}\n\nUSER: ${userPrompt}\n\nASSISTANT:`.trim();
};

const extractJsonObject = (raw: string): Record<string, unknown> | null => {
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to balanced-brace extraction.
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

const buildInsightEmailBody = (weekStart: string, insight: Record<string, unknown>): string => {
  return [
    `Weekly RealTalk insight for week of ${new Date(weekStart).toLocaleDateString("en-GB", { timeZone: "UTC" })}`,
    "",
    `What worked: ${String(insight.what_worked ?? "No clear pattern this week.")}`,
    `What didn't work: ${String(insight.what_didnt ?? "No clear pattern this week.")}`,
    `Your response pattern: ${String(insight.response_patterns ?? "No clear pattern this week.")}`,
    `Boundary comfort check: ${String(insight.boundary_respect ?? "No clear pattern this week.")}`,
    "",
    `Emotion trend: ${String(insight.emotion_trend ?? "No clear pattern this week.")}`,
    `Thought patterns: ${String(insight.thought_patterns ?? "No clear pattern this week.")}`,
    `Calm progress: ${String(insight.calm_progress ?? "No clear pattern this week.")}`,
    `Overthinking reduction: ${String(insight.overthinking_reduction ?? "No clear pattern this week.")}`,
    `How RealTalk helped: ${String(insight.ai_help_summary ?? "No clear pattern this week.")}`,
  ].join("\n");
};

const sendInsightEmail = async (
  to: string,
  weekStart: string,
  insight: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
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
      subject: `Your RealTalk weekly insight (${weekStart})`,
      text: buildInsightEmailBody(weekStart, insight),
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

const callAiWithFallback = async (
  systemText: string,
  userPrompt: string,
): Promise<string | null> => {
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
      // try next provider
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
      // try next provider
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
      // no more fallback
    } finally {
      clearTimeout(t);
    }
  }

  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables.");
    }

    const { userId, force, sendEmail } = await req.json();
    if (!userId) throw new Error("userId is required");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: setting } = await admin
      .from("user_insight_settings")
      .select("monitor_enabled, weekly_email_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    if (!setting?.monitor_enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "monitoring_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!force && !isFridayUtc()) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_friday" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const weekStart = getWeekStartIso();
    const weekStartIso = new Date(weekStart + "T00:00:00Z").toISOString();

    const { data: existingInsight } = await admin
      .from("user_weekly_insights")
      .select("week_start, emotion_trend, thought_patterns, calm_progress, overthinking_reduction, ai_help_summary, what_worked, what_didnt, response_patterns, boundary_respect, source_message_count, emailed_at")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle();

    const maybeSendExistingEmail = async () => {
      if ((!setting?.weekly_email_enabled && !sendEmail) || existingInsight?.emailed_at) {
        return { emailed: false, emailReason: existingInsight?.emailed_at ? "already_emailed" : "disabled" };
      }

      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const email = authUser?.user?.email?.trim();
      if (!email) {
        return { emailed: false, emailReason: "missing_user_email" };
      }

      const emailResult = await sendInsightEmail(email, weekStart, existingInsight as Record<string, unknown>);
      if (!emailResult.ok) {
        console.error("weekly insight email failed", emailResult.reason);
        return { emailed: false, emailReason: emailResult.reason };
      }

      await admin
        .from("user_weekly_insights")
        .update({ emailed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("week_start", weekStart);

      return { emailed: true, emailReason: null };
    };

    if (!force && existingInsight) {
      const emailStatus = await maybeSendExistingEmail();
      return new Response(JSON.stringify({
        ok: true,
        reused: true,
        weekStart,
        source_message_count: existingInsight.source_message_count,
        ...emailStatus,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: memoryProfile } = await admin
      .from("user_memory_profiles")
      .select("preference_notes, comfort_boundaries")
      .eq("user_id", userId)
      .maybeSingle();

    // Fetch this week's messages first (up to 200), then pad with up to 50 older messages for context
    const { data: weekMsgs } = await admin
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .gte("created_at", weekStartIso)
      .order("created_at", { ascending: true })
      .limit(200);

    const { data: priorMsgs } = await admin
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .lt("created_at", weekStartIso)
      .order("created_at", { ascending: false })
      .limit(50);

    const msgs = [
      ...(priorMsgs ? [...priorMsgs].reverse() : []),
      ...(weekMsgs ?? []),
    ];

    const thisWeekUserMessages = (weekMsgs ?? []).filter((m) => m.role === "user");

    if (thisWeekUserMessages.length < 2) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_enough_messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const compact = msgs
      .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 900)}`)
      .join("\n\n");

    const memoryText = [
      memoryProfile?.preference_notes?.trim()
        ? `Preference notes: ${memoryProfile.preference_notes.trim()}`
        : "",
      Array.isArray(memoryProfile?.comfort_boundaries) && memoryProfile.comfort_boundaries.length > 0
        ? `Comfort boundaries to respect: ${JSON.stringify(memoryProfile.comfort_boundaries).slice(0, 1200)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const insightPrompt = [
      `Generate a weekly wellbeing insight report based on ${thisWeekUserMessages.length} user messages from this week${priorMsgs && priorMsgs.length > 0 ? `, plus ${priorMsgs.length} earlier messages for context` : ""}.`,
      "Be specific — reference actual topics, emotions, or situations from the conversation. Do not write generic filler.",
      memoryText ? `\nKnown profile context:\n${memoryText}` : "",
      `\nChat history (oldest first):\n\n${compact}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const raw = (await callAiWithFallback(INSIGHT_SYSTEM, insightPrompt)) || "{}";

    const parsed = extractJsonObject(raw) ?? {};

    const row = {
      user_id: userId,
      week_start: weekStart,
      emotion_trend: String(parsed.emotion_trend || "No clear pattern this week."),
      thought_patterns: String(parsed.thought_patterns || "No clear pattern this week."),
      calm_progress: String(parsed.calm_progress || "No clear pattern this week."),
      overthinking_reduction: String(parsed.overthinking_reduction || "No clear pattern this week."),
      ai_help_summary: String(parsed.ai_help_summary || "No clear pattern this week."),
      what_worked: String(parsed.what_worked || "No clear pattern this week."),
      what_didnt: String(parsed.what_didnt || "No clear pattern this week."),
      response_patterns: String(parsed.response_patterns || "No clear pattern this week."),
      boundary_respect: String(parsed.boundary_respect || "No clear pattern this week."),
      source_message_count: msgs.length,
      emailed_at: existingInsight?.emailed_at ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from("user_weekly_insights").upsert(row, {
      onConflict: "user_id,week_start",
    });

    if (error) throw error;

    // ── Fetch top 3 approved advice posts this week for the digest email ────
    const { data: topAdvice } = await admin
      .from("advice_posts")
      .select("title, body, category")
      .eq("status", "approved")
      .gte("published_at", weekStartIso)
      .order("helpful_count", { ascending: false })
      .limit(3);

    // Attach advice to the insight row so the email sender can pick it up
    if (topAdvice && topAdvice.length > 0) {
      await admin
        .from("user_weekly_insights")
        .update({ advice_snippets: topAdvice })
        .eq("user_id", userId)
        .eq("week_start", weekStart);
    }

    let emailed = false;
    let emailReason: string | null = null;
    const shouldAttemptEmail = Boolean(sendEmail) || (Boolean(setting?.weekly_email_enabled) && !force);
    if (shouldAttemptEmail) {
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const email = authUser?.user?.email?.trim();
      if (!email) {
        emailReason = "missing_user_email";
      } else {
        const emailResult = await sendInsightEmail(email, weekStart, row as Record<string, unknown>);
        if (emailResult.ok) {
          emailed = true;
          await admin
            .from("user_weekly_insights")
            .update({ emailed_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("week_start", weekStart);
        } else {
          emailReason = emailResult.reason;
          console.error("weekly insight email failed", emailResult.reason);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, weekStart, source_message_count: msgs.length, emailed, emailReason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
