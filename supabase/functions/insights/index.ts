// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INSIGHT_SYSTEM = `You are an assistant that generates compact weekly mental-wellbeing insights from conversations.
Return strict JSON with these keys only:
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
- Each value must be 1-2 short sentences.
- Be supportive and neutral.
- Mention observable patterns only from provided messages.
- No diagnosis, no medical claims.
- If data is limited, state uncertainty briefly.
- Focus on user growth, moments of progress, and where the assistant should adapt better.`;

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

    const { userId, force } = await req.json();
    if (!userId) throw new Error("userId is required");

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: setting } = await admin
      .from("user_insight_settings")
      .select("monitor_enabled")
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

    const { data: memoryProfile } = await admin
      .from("user_memory_profiles")
      .select("preference_notes, comfort_boundaries")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: msgs } = await admin
      .from("messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(250);

    if (!msgs || msgs.length < 2) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_enough_messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chronological = [...msgs].reverse();
    const compact = chronological
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
      "Generate strict JSON weekly insight from this user's full chat history (old + new).",
      "Highlight growth, what helped, what did not help, and how the user responded.",
      "If boundaries were voiced, evaluate whether the assistant adapted respectfully.",
      memoryText ? `\nKnown profile context:\n${memoryText}` : "",
      `\nChat history:\n\n${compact}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const raw = (await callAiWithFallback(INSIGHT_SYSTEM, insightPrompt)) || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const row = {
      user_id: userId,
      week_start: weekStart,
      emotion_trend: String(parsed.emotion_trend || "Emotion trend is still forming this week."),
      thought_patterns: String(parsed.thought_patterns || "Thought patterns are still being gathered."),
      calm_progress: String(parsed.calm_progress || "Calm progress is still being measured."),
      overthinking_reduction: String(
        parsed.overthinking_reduction || "Overthinking reduction indicators are still limited.",
      ),
      ai_help_summary: String(parsed.ai_help_summary || "Support focused on reflection and clarity."),
      what_worked: String(parsed.what_worked || "Helpful patterns are still being learned."),
      what_didnt: String(parsed.what_didnt || "Areas to improve are still being learned."),
      response_patterns: String(parsed.response_patterns || "Response patterns are still being observed."),
      boundary_respect: String(parsed.boundary_respect || "Comfort boundaries are still being tracked."),
      source_message_count: msgs.length,
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from("user_weekly_insights").upsert(row, {
      onConflict: "user_id,week_start",
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, weekStart, source_message_count: msgs.length }), {
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
