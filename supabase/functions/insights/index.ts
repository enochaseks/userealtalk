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

Rules:
- Each value must be 1-2 short sentences.
- Be supportive and neutral.
- Mention observable patterns only from provided messages.
- No diagnosis, no medical claims.
- If data is limited, state uncertainty briefly.`;

const getWeekStartIso = () => {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  now.setUTCDate(now.getUTCDate() - diffToMonday);
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
};

const isFridayUtc = () => new Date().getUTCDay() === 5;

const getWeekRange = () => {
  const weekStart = getWeekStartIso();
  const start = `${weekStart}T00:00:00.000Z`;
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  return { weekStart, start, end: end.toISOString() };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !LOVABLE_API_KEY) {
      throw new Error("Missing required environment variables");
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

    const { weekStart, start, end } = getWeekRange();

    const { data: weeklyMessages } = await admin
      .from("messages")
      .select("conversation_id")
      .eq("user_id", userId)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(500);

    const conversationIds = Array.from(
      new Set((weeklyMessages ?? []).map((m) => m.conversation_id).filter(Boolean)),
    ).slice(0, 15);

    if (conversationIds.length === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_activity_this_week" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let updated = 0;
    const failures: Array<{ conversationId: string; error: string }> = [];

    for (const conversationId of conversationIds) {
      try {
        const { data: msgs } = await admin
          .from("messages")
          .select("role, content, created_at")
          .eq("conversation_id", conversationId)
          .eq("user_id", userId)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: false })
          .limit(40);

        if (!msgs || msgs.length < 2) {
          continue;
        }

        const chronological = [...msgs].reverse();
        const compact = chronological
          .map((m) => `${m.role.toUpperCase()}: ${m.content.slice(0, 800)}`)
          .join("\n\n");

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            stream: false,
            messages: [
              { role: "system", content: INSIGHT_SYSTEM },
              {
                role: "user",
                content: `Generate weekly insight JSON for this conversation history:\n\n${compact}`,
              },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (!aiResp.ok) {
          const text = await aiResp.text();
          throw new Error(`Insight AI error: ${aiResp.status} ${text}`);
        }

        const aiJson = await aiResp.json();
        const raw = aiJson?.choices?.[0]?.message?.content || "{}";

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }

        const row = {
          user_id: userId,
          conversation_id: conversationId,
          week_start: weekStart,
          emotion_trend: String(parsed.emotion_trend || "Emotion trend is still forming this week."),
          thought_patterns: String(parsed.thought_patterns || "Thought patterns are still being gathered."),
          calm_progress: String(parsed.calm_progress || "Calm progress is still being measured."),
          overthinking_reduction: String(
            parsed.overthinking_reduction || "Overthinking reduction indicators are still limited.",
          ),
          ai_help_summary: String(parsed.ai_help_summary || "Support focused on reflection and clarity."),
          updated_at: new Date().toISOString(),
        };

        const { error } = await admin.from("conversation_weekly_insights").upsert(row, {
          onConflict: "user_id,conversation_id,week_start",
        });

        if (error) throw error;
        updated += 1;
      } catch (err) {
        failures.push({
          conversationId,
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, updated, failures }), {
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
