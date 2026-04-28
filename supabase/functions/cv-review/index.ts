// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CV_SYSTEM = `You are an expert CV and resume reviewer.
Your ONLY job is to analyse the provided CV text and return a JSON object.
You MUST respond with raw JSON only — no markdown, no code fences, no prose, no explanation outside the JSON.

Use exactly this schema:
{
  "score": 7.2,
  "summary": "Short paragraph summarising overall CV quality and top priority.",
  "strengths": ["A clear strength", "Another strength"],
  "improvements": ["Highest impact change", "Second highest impact change"],
  "sectionReviews": [
    { "section": "Experience", "score": 7.5, "note": "Achievements are clear but need measurable outcomes." }
  ]
}

Rules:
- score: number 0–10 reflecting overall CV quality
- strengths: up to 6 concise strings referencing specific content from the CV
- improvements: up to 6 concise strings ordered by impact, specific to this CV
- sectionReviews: one entry per section found (e.g. Experience, Education, Skills, Summary)
- Do NOT invent facts. Only reference what is in the CV.
- Do NOT score a CV 0 or 0.1 unless it is completely blank or unreadable.`;

const buildWorkersPrompt = (systemText: string, userPrompt: string): string => {
  return `${systemText}\n\nUSER: ${userPrompt}\n\nASSISTANT:`.trim();
};

const callAi = async (userPrompt: string): Promise<string | null> => {
  const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const WORKERS_API_KEY = Deno.env.get("WORKERS_API_KEY");
  const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") ?? Deno.env.get("CLOUDFLARE_ACCOUNT_ID");

  if (MISTRAL_API_KEY) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25000);
    try {
      const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-small-latest",
          stream: false,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: CV_SYSTEM },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: ac.signal,
      });
      if (resp.ok) {
        const json = await resp.json();
        const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
        if (text) return text;
      }
    } catch {
      // fall through
    } finally {
      clearTimeout(t);
    }
  }

  if (GEMINI_API_KEY) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25000);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: CV_SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { responseMimeType: "application/json" },
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
      // fall through
    } finally {
      clearTimeout(t);
    }
  }

  if (WORKERS_API_KEY && CF_ACCOUNT_ID) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25000);
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
            prompt: buildWorkersPrompt(CV_SYSTEM, userPrompt),
            max_tokens: 1200,
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
    const { cvText, targetRole } = await req.json();

    if (!cvText || typeof cvText !== "string" || cvText.trim().length < 100) {
      return new Response(JSON.stringify({ error: "CV text is too short or missing." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = [
      targetRole?.trim() ? `Target role: ${targetRole.trim()}` : "Target role: Not specified",
      "",
      "CV content:",
      cvText.trim().slice(0, 12000),
    ].join("\n");

    const raw = await callAi(userPrompt);

    if (!raw) {
      return new Response(JSON.stringify({ error: "AI providers unavailable. Try again." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Attempt to parse and validate before returning
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try extracting JSON object from response
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first !== -1 && last > first) {
        parsed = JSON.parse(cleaned.slice(first, last + 1));
      } else {
        return new Response(JSON.stringify({ error: "AI returned unreadable format. Try again.", raw }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ result: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
