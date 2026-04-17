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
- When a user shares a problem, your FIRST move can be a focused clarifying question OR a direct concise answer, depending on user intent.
- Never lecture. Never give a wall of text unless the user explicitly asks for depth, a plan, or a breakdown.
- No headings, no bullet lists, no bold text in normal chat. Plain conversational sentences.
- Match the user's energy and message length. If they write one line, you write one or two lines back.

BALANCE RULE:
- Do NOT be emotionally supportive for everything.
- Emotional support should be used mainly when the user is sharing emotional distress, overwhelm, conflict, grief, anxiety, or personal pain.
- For practical requests (business, money, rent, career, logistics, planning, execution), prioritize clear logic, structure, trade-offs, and concrete next steps.
- For practical requests, do not over-ask clarifying questions. Give a best-first answer with assumptions, then ask at most one optional follow-up question if needed.

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

const THINK_DEEPLY_MODE = `\n\nThis user prompt is more complex. Before you answer, reason carefully and verify your logic internally. Do not reveal your private chain-of-thought. Give only a clear, concise final answer, and when useful, briefly include why that recommendation is best.`;

const DEEP_THINKING_DETAILED_MODE = `\n\nDeep thinking detailed mode activated:
- Show your structured reasoning process.
- Provide a thorough analysis with clear reasoning steps.
- Include at least 2-3 perspectives or approaches to the issue.
- Highlight key assumptions and limitations of each viewpoint.
- When applicable, include pros/cons comparison or decision framework.
- Conclude with a clear recommendation or insight backed by the reasoning.
- If research context is available, end with "Key References:" linking supporting sources.
- Make the response feel deeply considered and well-researched, not rushed.
- Use short paragraphs or numbered points to organize thinking, but keep overall length reasonable (avoid essays).
- Show intellectual depth and nuance, acknowledging complexity where it exists.`;

const PLANNING_MODE = `\n\nThe user is asking for planning help. Build plans only after understanding their real goal and constraints.
- Do not block on clarifying questions. Provide a useful first-version plan immediately using explicit assumptions.
- Ask at most one clarifying question only after providing the first plan version.
- When enough context exists, provide a practical plan with clear steps, timeline, and priorities.
- Default to deeper plans (roughly 8-12 actionable steps) when the user asks for business, money, rent, or execution plans.
- Include 2-4 strategic options where relevant, with pros/cons and a recommended option.
- Keep it realistic, specific, and adapted to the user's stated situation.
- If external facts matter (prices, regulations, market context), use provided research context carefully and note uncertainty briefly when needed.
- For business/money/rent/career/logistics plans, use a more analytical style with assumptions, trade-offs, and decision criteria.
- When research context is available, include a strong "Sources:" section with 4-8 links that were provided in context.
- For plan requests, prefer a detailed structure:
  1) Goal + assumptions
  2) Option set (2-4 options, pros/cons)
  3) Recommended path + why
  4) Execution roadmap (phased timeline)
  5) Risks + mitigations
  6) KPIs/checkpoints
  7) Sources`;

const PRACTICAL_LOGIC_MODE = `\n\nThe user is asking a practical/logical question (for example business, money, rent, work, planning, execution, trade-offs, or decisions).
- Prioritize logic, clarity, and depth over emotional reassurance.
- Give concrete options, constraints, trade-offs, and a recommended next action.
- Use concise structure when useful (short steps, bullets, or mini-framework).
- Do not keep asking questions. Give a best-first answer now; ask at most one high-value clarifying question only when essential details are missing.
- Keep tone warm but primarily analytical and solution-focused.
- If research context is available, cite only those links under a short "Sources:" section.`;

const BUSINESS_MARKETING_CONNOISSEUR_MODE = `\n\nBusiness/Marketing Connoisseur mode:
- Act like a practical business strategist + marketing strategist.
- For prompts like "I want to start a business" or "How do I market my business", do NOT start with questions.
- First response must include options immediately (at least 3), each with brief pros/cons, expected effort/cost, and who it suits.
- Then recommend one option and provide a step-by-step starter execution plan.
- You may ask one optional clarifying question only at the very end.
- Keep it actionable and realistic, not motivational fluff.`;

const REFERENCES_GUARDRAIL_MODE = `\n\nReferences rule:
- Only cite links explicitly present in the provided research context.
- Do not invent sources or URLs.
- If no usable research context is available, do not fabricate references; say that up-to-date sources were not available.`;

const DETAILED_PLAN_OUTPUT_MODE = `\n\nDetailed output rule for plan requests:
- Make the plan thorough and practical, not vague.
- Include concrete numbers/ranges where possible (budget ranges, timelines, expected effort), and label assumptions.
- Prefer depth over brevity for plan mode.
- End with "Sources:" and list the supporting links when available.`;

const EMOTIONAL_SUPPORT_MODE = `\n\nThe user is sharing an emotional or personal struggle.
- Lead with empathy and emotional validation.
- Keep advice grounded and gentle.
- Avoid overly analytical or robotic tone unless the user asks for a strict logical breakdown.`;

const VENT_MODE_BASE = `\n\nThe user is venting. Your first job is to understand and emotionally validate what they shared.
- Do not minimize or judge.
- Reflect key feelings and what seems to be hurting them most.
- Keep tone calm, human, and grounded.
- Keep responses concise unless asked for depth.`;

const VENT_NO_ADVICE = `\n\nThe user asked for NO advice. Only listen, validate, and reflect back what you heard. End with a gentle check-in question.`;
const VENT_REFLECT = `\n\nThe user wants reflection, not direct advice. Summarize core issues and patterns clearly. You may ask one clarifying question.`;
const VENT_ADVICE = `\n\nThe user is open to advice. After validating feelings, give practical and realistic advice with 2-4 clear next steps.`;

const isPlanningRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const planningKeywords = [
    "plan",
    "roadmap",
    "strategy",
    "steps",
    "timeline",
    "budget",
    "launch",
    "start my",
    "grow my",
    "marketing plan",
    "action plan",
    "next steps",
    "what should i do",
  ];
  return planningKeywords.some((k) => lower.includes(k));
};

const isPracticalLogicRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const practicalKeywords = [
    "business",
    "startup",
    "start a business",
    "rent",
    "landlord",
    "budget",
    "pricing",
    "revenue",
    "profit",
    "cash flow",
    "debt",
    "invoice",
    "operations",
    "strategy",
    "marketing",
    "sales",
    "job",
    "career",
    "interview",
    "plan",
    "roadmap",
    "timeline",
    "what should i do",
    "best option",
    "pros and cons",
    "tradeoff",
    "decision",
  ];

  return practicalKeywords.some((k) => lower.includes(k));
};

const isBusinessMarketingRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const keys = [
    "start a business",
    "starting a business",
    "i want to start a business",
    "business idea",
    "which business",
    "what business",
    "market my business",
    "how can i market",
    "marketing strategy",
    "customer acquisition",
    "go to market",
    "go-to-market",
  ];
  return keys.some((k) => lower.includes(k));
};

const isEmotionalRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const emotionalKeywords = [
    "i feel",
    "i'm feeling",
    "im feeling",
    "anxious",
    "overwhelmed",
    "stressed",
    "depressed",
    "sad",
    "lonely",
    "hurt",
    "heartbroken",
    "panic",
    "scared",
    "afraid",
    "angry",
    "frustrated",
    "vent",
    "rant",
    "i can't cope",
    "i cant cope",
  ];

  return emotionalKeywords.some((k) => lower.includes(k));
};

const latestUserContent = (messages: Array<{ role: string; content: string }>): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && messages[i]?.content) return messages[i].content;
  }
  return "";
};

const buildSearchQuery = (text: string): string => {
  return text
    .replace(/\s+/g, " ")
    .replace(/[\n\r\t]/g, " ")
    .trim()
    .slice(0, 180);
};

const fetchGoogleCseResults = async (query: string): Promise<string[]> => {
  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY");
  const GOOGLE_CSE_ID = Deno.env.get("GOOGLE_CSE_ID");
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) return [];

  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_API_KEY)}&cx=${encodeURIComponent(GOOGLE_CSE_ID)}&q=${encodeURIComponent(query)}&num=8`;
  const resp = await fetch(url);
  if (!resp.ok) return [];

  const data = await resp.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  return items
    .slice(0, 8)
    .map((item: any, idx: number) => {
      const title = item?.title ?? "Untitled";
      const snippet = item?.snippet ?? "";
      const link = item?.link ?? "";
      return `${idx + 1}. ${title}\n${snippet}\n${link}`.trim();
    })
    .filter(Boolean);
};

const fetchDuckDuckGoResults = async (query: string): Promise<string[]> => {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const resp = await fetch(url);
  if (!resp.ok) return [];

  const data = await resp.json();
  const out: string[] = [];

  if (data?.AbstractText) {
    out.push(`1. ${data.Heading || "Overview"}\n${data.AbstractText}\n${data.AbstractURL || ""}`.trim());
  }

  const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
  let i = out.length + 1;
  for (const topic of related) {
    if (i > 8) break;
    if (topic?.Text) {
      out.push(`${i}. ${topic.Text}\n${topic.FirstURL || ""}`.trim());
      i++;
    } else if (Array.isArray(topic?.Topics)) {
      for (const nested of topic.Topics) {
        if (i > 8) break;
        if (nested?.Text) {
          out.push(`${i}. ${nested.Text}\n${nested.FirstURL || ""}`.trim());
          i++;
        }
      }
    }
  }

  return out;
};

const getResearchContext = async (query: string): Promise<string> => {
  if (!query) return "";

  const googleResults = await fetchGoogleCseResults(query);
  const results = googleResults.length > 0 ? googleResults : await fetchDuckDuckGoResults(query);
  if (results.length === 0) return "";

  return [
    "Web research notes for this request:",
    ...results,
    "Use these as supporting context, not absolute truth. If data is uncertain or location-specific, say that briefly.",
    "If you produce a practical plan or analysis, include a short Sources section using only links listed above.",
  ].join("\n\n");
};

const getThinkingTime = (text: string, thinkDeeply: boolean): number => {
  if (!thinkDeeply) return 0;
  
  const lower = text.toLowerCase();
  const complexitySignals = [
    "compare",
    "tradeoff",
    "strategy",
    "analyze",
    "evaluation",
    "decision",
    "complex",
    "deeply",
    "pros and cons",
  ];
  
  const signalCount = complexitySignals.reduce(
    (count, signal) => count + (lower.includes(signal) ? 1 : 0),
    0,
  );
  
  const length = text.length;
  const questionCount = (text.match(/\?/g) || []).length;
  
  // Base 1.5-2 seconds, up to 5 seconds for very complex questions
  let time = 1500;
  time += signalCount * 800; // +0.8s per complexity signal
  time += length > 300 ? 1000 : 0; // +1s if very long
  time += questionCount > 2 ? 1500 : 0; // +1.5s if multiple questions
  
  return Math.min(time, 5000); // Cap at 5 seconds
};

const getVentReadTime = (text: string, ventMode: boolean): number => {
  if (!ventMode) return 0;

  const len = text.trim().length;
  // 2.2s to 7s range based on length
  const computed = 2200 + Math.min(4800, Math.floor(len * 10));
  return Math.min(computed, 7000);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, beReal, thinkDeeply, forcePlan, forceVent, ventAdviceMode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const lastUserMessage = latestUserContent(messages ?? []);
    const planningRequested = forcePlan || isPlanningRequest(lastUserMessage);
    const ventMode = Boolean(forceVent);
    const emotionalRequested = ventMode || isEmotionalRequest(lastUserMessage);
    const practicalRequested = planningRequested || isPracticalLogicRequest(lastUserMessage);
    const businessMarketingRequested = isBusinessMarketingRequest(lastUserMessage);
    const thinkingTime = getThinkingTime(lastUserMessage, thinkDeeply);
    const ventReadTime = getVentReadTime(lastUserMessage, ventMode);
    const totalReadTime = Math.max(thinkingTime, ventReadTime);
    const ventAdviceInstruction = ventMode
      ? ventAdviceMode === "advice"
        ? VENT_ADVICE
        : ventAdviceMode === "reflect"
          ? VENT_REFLECT
          : VENT_NO_ADVICE
      : "";
    const system =
      SYSTEM_BASE +
      (beReal ? REAL_MODE : "") +
      (thinkDeeply ? THINK_DEEPLY_MODE : "") +
      (planningRequested ? PLANNING_MODE : "") +
      (practicalRequested && !emotionalRequested ? PRACTICAL_LOGIC_MODE : "") +
      (businessMarketingRequested && !emotionalRequested ? BUSINESS_MARKETING_CONNOISSEUR_MODE : "") +
      (emotionalRequested ? EMOTIONAL_SUPPORT_MODE : "") +
      (ventMode ? VENT_MODE_BASE : "") +
      ventAdviceInstruction;

    const shouldUseResearch = (thinkDeeply || practicalRequested) && !emotionalRequested;
    const researchQuery = shouldUseResearch ? buildSearchQuery(lastUserMessage) : "";
    const researchContext = shouldUseResearch ? await getResearchContext(researchQuery) : "";

    const systemMessages = [
      {
        role: "system",
        content:
          system + REFERENCES_GUARDRAIL_MODE + (planningRequested ? DETAILED_PLAN_OUTPUT_MODE : "") + (thinkDeeply ? DEEP_THINKING_DETAILED_MODE : ""),
      },
    ];
    if (researchContext) {
      systemMessages.push({ role: "system", content: researchContext });
    }

    // Create a writable stream encoder for custom event streaming
    const encoder = new TextEncoder();
    
    const customStream = new ReadableStream({
      async start(controller) {
        // Stream reading/thinking phase if enabled
        if (totalReadTime > 0) {
          const startEvent = {
            event: "thinking_start",
            label: ventMode ? "Reading carefully..." : "🤔 Thinking...",
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(startEvent)}\n\n`));
          
          await new Promise((resolve) => setTimeout(resolve, totalReadTime));
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "thinking_end" })}\n\n`));
        }
        
        // Now fetch and stream the actual response
        try {
          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [...systemMessages, ...messages],
              stream: true,
            }),
          });
          
          if (!aiResp.ok || !aiResp.body) {
            const errJson = await aiResp.json().catch(() => ({}));
            const errMsg = errJson.error || "AI gateway error";
            controller.enqueue(encoder.encode(`data: {"error":"${errMsg}"}\n\n`));
            controller.close();
            return;
          }
          
          const reader = aiResp.body.getReader();
          const decoder = new TextDecoder();
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(encoder.encode(`data: {"error":"${msg}"}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(customStream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
