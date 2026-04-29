// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEARN_SYSTEM = `You are a memory extractor. Given a short conversation between a user and RealTalk, extract key facts about the user.

Return ONLY strict JSON with these keys:
- interests: comma-separated string of topics/activities the user cares about (max 80 chars total, blank if none detected)
- communication_style: one short phrase describing how the user communicates (e.g. "direct and blunt", "reflective and measured", "casual and expressive") — blank if unclear
- life_context: brief note about their current life situation (e.g. "running a business", "job hunting", "going through a breakup") — blank if unclear
- positive_signals: topics or approaches that clearly resonated well with the user (blank if none detected)
- confidence: number between 0 and 1 reflecting extraction confidence

Rules:
- Only extract from what was explicitly said. Do not invent.
- Blank string if nothing clear enough to extract.
- Keep each value very short (under 100 chars).
- If confidence is low, set confidence below 0.4.
- Never mention mental health diagnoses.`;

const mergePreferenceNotes = (existing: string, extracted: Record<string, string>): string => {
  const parts: string[] = [];

  const { interests, communication_style, life_context, positive_signals } = extracted;

  const section = (label: string, value: string, existing_section: string): string => {
    if (!value?.trim()) return existing_section ?? "";
    return `${label}: ${value.trim()}`;
  };

  // Parse existing notes into a map
  const existingMap: Record<string, string> = {};
  if (existing) {
    for (const line of existing.split("\n")) {
      const idx = line.indexOf(": ");
      if (idx !== -1) {
        const key = line.slice(0, idx).trim().toLowerCase();
        const val = line.slice(idx + 2).trim();
        existingMap[key] = val;
      }
    }
  }

  const mergeValues = (old: string, incoming: string): string => {
    if (!incoming?.trim()) return old ?? "";
    if (!old?.trim()) return incoming.trim();
    // Merge unique comma-separated values
    const oldParts = old.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const newParts = incoming.split(",").map((s) => s.trim()).filter(Boolean);
    for (const p of newParts) {
      if (!oldParts.includes(p.toLowerCase())) oldParts.push(p);
    }
    return oldParts.join(", ").slice(0, 200);
  };

  const nextInterests = mergeValues(existingMap["interests"] ?? "", interests ?? "");
  const nextStyle = communication_style?.trim() || existingMap["communication style"] || "";
  const nextContext = life_context?.trim() || existingMap["life context"] || "";
  const nextPositive = mergeValues(existingMap["positive signals"] ?? "", positive_signals ?? "");

  if (nextInterests) parts.push(`Interests: ${nextInterests}`);
  if (nextStyle) parts.push(`Communication style: ${nextStyle}`);
  if (nextContext) parts.push(`Life context: ${nextContext}`);
  if (nextPositive) parts.push(`Positive signals: ${nextPositive}`);

  return parts.join("\n").slice(0, 1000);
};

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
        const aiJson = await aiResp.json().catch(() => ({}));
        const raw = String(aiJson?.choices?.[0]?.message?.content ?? "").trim();
        if (raw) return raw;
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
            max_tokens: 500,
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

const logAttempt = async (
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  outcome: "changed" | "skipped",
  opts: {
    skip_reason?: string;
    confidence?: number | null;
    extracted_summary?: Record<string, unknown> | null;
    message_count?: number;
  } = {},
) => {
  if (!userId) return;
  try {
    await admin.from("user_learning_attempts").insert({
      user_id: userId,
      outcome,
      skip_reason: opts.skip_reason ?? null,
      confidence: opts.confidence != null ? opts.confidence : null,
      extracted_summary: opts.extracted_summary ?? null,
      message_count: opts.message_count ?? null,
    });
  } catch {
    // logging is best-effort, never block the response
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ skipped: true, reason: "missing_env" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return new Response(JSON.stringify({ skipped: true, reason: "missing_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { userId, recentMessages } = body;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!userId || !Array.isArray(recentMessages) || recentMessages.length < 2) {
      await logAttempt(admin, userId ?? null, "skipped", { skip_reason: "insufficient_data" });
      return new Response(JSON.stringify({ skipped: true, reason: "insufficient_data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ skipped: true, reason: "invalid_auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (authData.user.id !== userId) {
      return new Response(JSON.stringify({ skipped: true, reason: "user_mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load existing memory profile
    const { data: existing } = await admin
      .from("user_memory_profiles")
      .select("preference_notes, comfort_boundaries")
      .eq("user_id", userId)
      .maybeSingle();

    const existingNotes = String(existing?.preference_notes ?? "");

    // Build compact conversation snippet for extraction (last 6 messages, user-only lines)
    const snippet = recentMessages
      .slice(-6)
      .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content.slice(0, 400)}`)
      .join("\n\n");

    const raw = await callAiWithFallback(
      LEARN_SYSTEM,
      `Extract user facts from this conversation:\n\n${snippet}`,
    );

    if (!raw) {
      await logAttempt(admin, userId, "skipped", { skip_reason: "ai_error", message_count: recentMessages.length });
      return new Response(JSON.stringify({ skipped: true, reason: "ai_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extractedRaw = extractJsonObject(raw);
    if (!extractedRaw) {
      await logAttempt(admin, userId, "skipped", { skip_reason: "parse_error", message_count: recentMessages.length });
      return new Response(JSON.stringify({ skipped: true, reason: "parse_error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = extractedRaw as Record<string, string>;

    const confidenceRaw = Number((extracted as any)?.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : 0;
    if (confidence < 0.4) {
      await logAttempt(admin, userId, "skipped", { skip_reason: "low_confidence", confidence, extracted_summary: extracted, message_count: recentMessages.length });
      return new Response(JSON.stringify({ ok: true, changed: false, skipped: true, reason: "low_confidence" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextNotes = mergePreferenceNotes(existingNotes, extracted);

    // Only write if something actually changed
    if (nextNotes === existingNotes) {
      await logAttempt(admin, userId, "skipped", { skip_reason: "no_change", confidence, extracted_summary: extracted, message_count: recentMessages.length });
      return new Response(JSON.stringify({ ok: true, changed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("user_memory_profiles").upsert({
      user_id: userId,
      preference_notes: nextNotes,
      comfort_boundaries: existing?.comfort_boundaries ?? [],
      updated_at: new Date().toISOString(),
    });

    await logAttempt(admin, userId, "changed", { confidence, extracted_summary: extracted, message_count: recentMessages.length });
    return new Response(JSON.stringify({ ok: true, changed: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ skipped: true, reason: "error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
