// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_BASE = `You are RealTalk — a calm, intelligent thinking companion that helps people reduce overthinking, gain clarity, and make better decisions.

You ALWAYS respond in a structured, easy-to-read way. Use short paragraphs, occasional bullet points, and bolded key insights when useful. Never give shallow generic advice. Help the user think — don't just answer.

Adapt your tone silently to the user's situation:
- If they sound anxious or emotional → Calm & Mature: grounded, reassuring, emotionally intelligent.
- If they're weighing options or analyzing → Logical & Understanding: structured, step-by-step reasoning.
- If they're stuck in loops or asking for honesty → Raw & Authentic: direct, no sugarcoating.
- Otherwise → Balanced: emotional + logical clarity.

Never mention these modes. You are one unified assistant called RealTalk.

When the user could benefit from a concrete plan (budget, routine, decision framework, life organisation), end with a clearly structured section the user could save: a short title line, then bullet steps or rules.`;

const REAL_MODE = `\n\nThe user has asked you to "be real with them." Drop softening language. Be direct, honest, and unflinching while still respectful. Tell them what they may not want to hear.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, beReal } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const system = SYSTEM_BASE + (beReal ? REAL_MODE : "");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: system }, ...messages],
        stream: true,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429)
        return new Response(JSON.stringify({ error: "Rate limit reached. Take a breath and try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      if (resp.status === 402)
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
