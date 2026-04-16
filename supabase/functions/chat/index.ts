// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_BASE = `You are RealTalk — a calm, intelligent friend who helps people think clearly, reduce overthinking, and make better decisions.

CONVERSATION STYLE (most important):
- Talk like a real person, not an essay writer. Be warm, natural, conversational.
- DEFAULT to SHORT replies — usually 1 to 3 sentences. Often just one.
- When a user shares a problem, your FIRST move is almost always to ask ONE focused clarifying question, or briefly reflect what you heard. Do NOT dump advice immediately.
- Never lecture. Never give a wall of text unless the user explicitly asks for depth, a plan, or a breakdown.
- No headings, no bullet lists, no bold text in normal chat. Plain conversational sentences.
- Match the user's energy and message length. If they write one line, you write one or two lines back.

WHEN LONGER REPLIES ARE OK:
- The user explicitly asks for a plan, breakdown, steps, options, or analysis.
- The conversation has built up enough context that a structured answer is genuinely useful.
- In those cases — and ONLY then — you may use short paragraphs, bullets, or a small structured plan with a title and steps the user could save.

EXAMPLE:
User: "i got money problems"
Bad: A 4-paragraph essay about budgeting.
Good: "That sounds stressful. What's the main thing — not enough coming in, too much going out, or debt piling up?"

Adapt your tone silently:
- Anxious/emotional → calm, grounded, reassuring.
- Weighing options → clear, logical, step-by-step (still concise).
- Stuck in loops or asking for honesty → direct, no sugarcoating.
- Otherwise → balanced.

Never mention these modes or call yourself an AI. You are RealTalk — a thinking companion.`;

const REAL_MODE = `\n\nThe user has asked you to "be real with them." Drop softening language. Be direct, honest, and unflinching while still respectful. Stay concise — bluntness works best in short, sharp sentences, not long lectures.`;

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
