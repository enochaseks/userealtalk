// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const RELATIONSHIP_MEMORY_MODE = `

Relationship memory and comfort boundaries:
- Build trust over time by adapting to recurring user needs and preferences.
- If the user sounds uncomfortable or asks you to stop/slow down/change tone, pull back immediately.
- Respect known comfort boundaries in future responses.
- Keep support warm and steady, never clingy or coercive.`;

const REAL_MODE = `\n\nBe Real Mode - BRUTAL HONESTY:
- No sugar-coating, no cushioning, no softening language.
- Be direct, blunt, and unflinching. Tell the truth even if it's uncomfortable.
- Short, sharp sentences beat long explanations. Get to the point fast.
- Call out contradictions, delusions, or patterns you see clearly.
- If something is a bad idea, say "That's a bad idea" instead of "You might want to consider."
- If the user is avoiding responsibility, point it out directly.
- Emotional support is allowed ONLY when genuinely needed (grief, crisis, real pain) — not as default softening.
- Don't protect feelings. Respect the user enough to be honest.
- Stay respectful and non-judgmental, but completely frank about reality.`;

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

const isLogicalExecutionRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  
  // Action verbs that signal "I want to start/build/execute something"
  const executionVerbs = [
    "start ",
    "starting ",
    "launch ",
    "launching ",
    "begin ",
    "beginning ",
    "open ",
    "opening ",
    "create ",
    "creating ",
    "build ",
    "building ",
    "make ",
    "making ",
    "switch ",
    "switching ",
    "transition ",
    "transitioning ",
    "move ",
    "moving ",
    "go to ",
    "relocate ",
    "change ",
    "changing ",
  ];
  
  // Nouns/domains that pair with execution (if user says "I want to start X", that needs logic)
  const executionDomains = [
    "business",
    "daycare",
    "nonprofit",
    "store",
    "shop",
    "company",
    "freelance",
    "side hustle",
    "podcast",
    "blog",
    "service",
    "venture",
    "project",
    "career",
    "job",
    "field",
    "industry",
    "country",
    "city",
    "school",
    "course",
    "program",
    "freelancing",
    "consulting",
    "agency",
    "startup",
    "brand",
    "product",
    "community",
  ];
  
  // Check if any execution verb is present
  const hasExecutionVerb = executionVerbs.some(verb => lower.includes(verb));
  
  // If execution verb found, check for any execution domain OR "i want to", "how do i", "should i"
  if (hasExecutionVerb) {
    const hasDomain = executionDomains.some(domain => lower.includes(domain));
    const hasIntent = lower.includes("i want to") || lower.includes("how do i") || lower.includes("how can i") || lower.includes("should i") || lower.includes("what's the best");
    return hasDomain || hasIntent;
  }
  
  // Also catch direct "I want to [action] [something]" patterns without explicit verb markers
  const directPatterns = [
    "i want to start",
    "i want to launch",
    "i want to open",
    "i want to build",
    "i want to create",
    "i want to switch",
    "i want to move",
    "how do i start",
    "how do i launch",
    "how do i open",
    "how do i build",
    "how do i switch",
    "how do i move",
    "should i start",
    "should i switch",
    "should i move",
    "should i change",
  ];
  
  return directPatterns.some(pattern => lower.includes(pattern));
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

const isEmailRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const keys = [
    "email",
    "gmail",
    "write an email",
    "draft an email",
    "rewrite this email",
    "improve this email",
    "review this email",
    "does this email sound",
    "reply to this email",
    "respond to this email",
    "subject line",
    "follow-up email",
    "follow up email",
    "cold email",
    "send this email",
  ];
  return keys.some((k) => lower.includes(k));
};

const isEmotionalRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  
  // Direct emotional/mental health indicators
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

  // Relational/personal struggle indicators (breakups, conflict, betrayal, family issues, grief)
  const relationalKeywords = [
    "breakup",
    "broke up",
    "broke up with",
    "left me",
    "breaking up",
    "relationship ended",
    "partner left",
    "my ex",
    "betrayed",
    "betrayal",
    "friend betrayed",
    "family drama",
    "family conflict",
    "toxic",
    "manipulative",
    "abusive",
    "my boss",
    "boss treating",
    "coworker",
    "conflict with",
    "having a hard time",
    "struggling with",
    "dealing with",
    "grief",
    "grieving",
    "lost someone",
    "death of",
    "someone died",
    "passing of",
    "miss them",
    "i'm alone",
    "im alone",
    "rejection",
    "rejected",
    "never enough",
    "not good enough",
    "self doubt",
    "self-doubt",
    "insecure",
    "jealous",
    "envious",
    "worthless",
    "hopeless",
    "trapped",
    "stuck in",
    "can't get over",
    "cant get over",
  ];

  // Check both categories
  const hasEmotionalKeyword = emotionalKeywords.some((k) => lower.includes(k));
  const hasRelationalKeyword = relationalKeywords.some((k) => lower.includes(k));

  return hasEmotionalKeyword || hasRelationalKeyword;
};

const isVentingRequest = (text: string): boolean => {
  const lower = text.toLowerCase();

  const explicitVentSignals = [
    "i need to vent",
    "need to vent",
    "i want to vent",
    "want to vent",
    "let me vent",
    "just listen",
    "just hear me out",
    "no advice",
    "don't give advice",
    "dont give advice",
    "not looking for advice",
    "i want to rant",
    "rant",
    "get this off my chest",
    "off my chest",
    "i need to let this out",
    "let this out",
  ];

  if (explicitVentSignals.some((s) => lower.includes(s))) return true;

  const ventIntentSignals = [
    "i just need to talk",
    "i just need someone to listen",
    "can i talk",
    "can i vent",
    "i need to get this out",
    "i need to talk about this",
    "i'm spiraling",
    "im spiraling",
    "i'm losing it",
    "im losing it",
    "i can't do this anymore",
    "i cant do this anymore",
    "this is too much",
  ];

  const distressSignals = [
    "overwhelmed",
    "drained",
    "exhausted",
    "burnt out",
    "burned out",
    "stressed",
    "hurt",
    "angry",
    "frustrated",
    "upset",
    "heartbroken",
    "betrayed",
    "anxious",
    "panicking",
    "can't cope",
    "cant cope",
  ];

  const noSolutionSignals = [
    "i don't know what to do",
    "i dont know what to do",
    "i can't even think",
    "i cant even think",
    "i don't need solutions",
    "i dont need solutions",
    "not asking for solutions",
    "don't fix it",
    "dont fix it",
  ];

  const intentHit = ventIntentSignals.some((s) => lower.includes(s));
  const distressCount = distressSignals.reduce((acc, s) => acc + (lower.includes(s) ? 1 : 0), 0);
  const noSolutionHit = noSolutionSignals.some((s) => lower.includes(s));

  return intentHit || noSolutionHit || distressCount >= 2;
};

const latestUserContent = (messages: Array<{ role: string; content: string }>): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && messages[i]?.content) return messages[i].content;
  }
  return "";
};

const discomfortSignals = [
  "uncomfortable",
  "stop",
  "don't do that",
  "dont do that",
  "too much",
  "back off",
  "pull back",
  "i don't like that",
  "i dont like that",
  "that doesn't help",
  "that doesnt help",
  "change your tone",
  "not like that",
  "please don't",
  "please dont",
];

const extractBoundaryNote = (text: string): string | null => {
  const clean = text.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  if (!clean) return null;
  if (!discomfortSignals.some((signal) => lower.includes(signal))) return null;
  return clean.slice(0, 300);
};

const toBoundaryItems = (value: unknown): Array<{ note: string; created_at: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      note: String(item?.note ?? "").trim(),
      created_at: String(item?.created_at ?? "").trim(),
    }))
    .filter((item) => item.note);
};

const mergeBoundaryItems = (
  existing: unknown,
  newNote: string,
): Array<{ note: string; created_at: string }> => {
  const current = toBoundaryItems(existing);
  const lower = newNote.toLowerCase();
  if (current.some((x) => x.note.toLowerCase() === lower)) return current.slice(-12);
  return [...current, { note: newNote, created_at: new Date().toISOString() }].slice(-12);
};

const buildMemoryInstruction = (memoryProfile: any): string => {
  if (!memoryProfile) return "";

  const lines: string[] = [];
  const notes = String(memoryProfile.preference_notes ?? "").trim();
  if (notes) lines.push(`Known user preferences: ${notes}`);

  const boundaries = toBoundaryItems(memoryProfile.comfort_boundaries)
    .map((entry) => entry.note)
    .slice(-6);

  if (boundaries.length > 0) {
    lines.push(`Comfort boundaries to respect: ${boundaries.join(" | ")}`);
  }

  return lines.join("\n");
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
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  let resp: Response;
  try { resp = await fetch(url, { signal: ac.signal }); } catch { return []; } finally { clearTimeout(t); }
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
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  let resp: Response;
  try { resp = await fetch(url, { signal: ac.signal }); } catch { return []; } finally { clearTimeout(t); }
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

const buildWorkersPrompt = (systemText: string, messages: Array<{ role: string; content: string }>): string => {
  const convo = messages
    .filter((m) => m?.content)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
  return `${systemText}\n\n${convo}\n\nASSISTANT:`.trim();
};

const runGeminiFallback = async (
  apiKey: string | undefined,
  systemText: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> => {
  if (!apiKey) return null;

  const geminiMessages = messages
    .filter((m) => m?.content)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents: geminiMessages,
        }),
        signal: ac.signal,
      },
    );

    if (!resp.ok) return null;
    const json = await resp.json().catch(() => ({}));
    const text = Array.isArray(json?.candidates?.[0]?.content?.parts)
      ? json.candidates[0].content.parts.map((p: any) => String(p?.text ?? "")).join("")
      : "";
    return text.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
};

const runWorkersFallback = async (
  apiKey: string | undefined,
  accountId: string | undefined,
  systemText: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> => {
  if (!apiKey || !accountId) return null;

  const prompt = buildWorkersPrompt(systemText, messages);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          max_tokens: 700,
        }),
        signal: ac.signal,
      },
    );

    if (!resp.ok) return null;
    const json = await resp.json().catch(() => ({}));
    const text = String(json?.result?.response ?? "").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, beReal, thinkDeeply, forcePlan, forceVent, ventAdviceMode, userId } = await req.json();
    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const WORKERS_API_KEY = Deno.env.get("WORKERS_API_KEY");
    const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") ?? Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const aiKey = MISTRAL_API_KEY;
    const aiUrl = "https://api.mistral.ai/v1/chat/completions";
    const aiModel = "mistral-small-latest";
    const hasAnyProvider = Boolean(aiKey || GEMINI_API_KEY || (WORKERS_API_KEY && CF_ACCOUNT_ID));
    if (!hasAnyProvider) {
      throw new Error("Missing AI provider keys. Set MISTRAL_API_KEY or GEMINI_API_KEY or WORKERS_API_KEY + CF_ACCOUNT_ID.");
    }

    const lastUserMessage = latestUserContent(messages ?? []);
    const admin =
      SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        : null;

    let memoryProfile: any = null;
    if (admin && userId) {
      const { data } = await admin
        .from("user_memory_profiles")
        .select("preference_notes, comfort_boundaries")
        .eq("user_id", userId)
        .maybeSingle();
      memoryProfile = data ?? null;

      const boundaryNote = extractBoundaryNote(lastUserMessage);
      if (boundaryNote) {
        const nextBoundaries = mergeBoundaryItems(memoryProfile?.comfort_boundaries, boundaryNote);
        await admin.from("user_memory_profiles").upsert({
          user_id: userId,
          preference_notes: String(memoryProfile?.preference_notes ?? ""),
          comfort_boundaries: nextBoundaries,
          updated_at: new Date().toISOString(),
        });

        memoryProfile = {
          preference_notes: String(memoryProfile?.preference_notes ?? ""),
          comfort_boundaries: nextBoundaries,
        };
      }
    }

    const memoryInstruction = buildMemoryInstruction(memoryProfile);
  const emailRequested = isEmailRequest(lastUserMessage);
  const deepThinkingRequested = thinkDeeply || emailRequested;
  const planningRequested = forcePlan || emailRequested || isPlanningRequest(lastUserMessage);
    const ventMode = Boolean(forceVent) || isVentingRequest(lastUserMessage);
  const emotionalRequested = !emailRequested && (ventMode || isEmotionalRequest(lastUserMessage));
  const practicalRequested = planningRequested || emailRequested || isPracticalLogicRequest(lastUserMessage);
    const logicalExecutionRequested = isLogicalExecutionRequest(lastUserMessage);
    const businessMarketingRequested = isBusinessMarketingRequest(lastUserMessage);
  const thinkingTime = getThinkingTime(lastUserMessage, deepThinkingRequested);
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
      RELATIONSHIP_MEMORY_MODE +
      (beReal ? REAL_MODE : "") +
      (deepThinkingRequested ? THINK_DEEPLY_MODE : "") +
      (planningRequested ? PLANNING_MODE : "") +
      (emailRequested
        ? "\n\nEmail mode: Treat email requests as strategic writing tasks, not emotional support. Think like a sharp editor and planner. Optimize for clarity, tone, structure, persuasion, and outcome. When reviewing an email, identify weaknesses directly and propose stronger wording."
        : "") +
      ((practicalRequested || logicalExecutionRequested) && !emotionalRequested ? PRACTICAL_LOGIC_MODE : "") +
      (businessMarketingRequested && !emotionalRequested ? BUSINESS_MARKETING_CONNOISSEUR_MODE : "") +
      (logicalExecutionRequested && !emotionalRequested ? `\n\nExecution-focused response: Options first, no questions. Provide 2-4 actionable options with pros/cons immediately. Then recommend one and give a clear starter plan. Ask at most one optional follow-up question. Include sources when available.` : "") +
      (emotionalRequested && !beReal ? EMOTIONAL_SUPPORT_MODE : "") +
      (ventMode && !beReal ? VENT_MODE_BASE : "") +
      (beReal && ventMode ? `\n\nVent mode + Be Real: Listen and validate briefly, but prioritize honest feedback over endless sympathy. Be empathetic but not coddling.` : ventAdviceInstruction) +
      (memoryInstruction ? `\n\nUser memory context:\n${memoryInstruction}` : "");

    const shouldUseResearch = (deepThinkingRequested || practicalRequested || logicalExecutionRequested) && !emotionalRequested;
    const researchQuery = shouldUseResearch ? buildSearchQuery(lastUserMessage) : "";
    const researchContext = shouldUseResearch ? await getResearchContext(researchQuery) : "";

    const systemMessages = [
      {
        role: "system",
        content:
          system + REFERENCES_GUARDRAIL_MODE + (planningRequested ? DETAILED_PLAN_OUTPUT_MODE : "") + (deepThinkingRequested ? DEEP_THINKING_DETAILED_MODE : ""),
      },
    ];
    if (researchContext) {
      systemMessages.push({ role: "system", content: researchContext });
    }

    // Create a writable stream encoder for custom event streaming
    const encoder = new TextEncoder();
    
    const customStream = new ReadableStream({
      async start(controller) {
        const sendSse = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        // Stream reading/thinking phase if enabled
        if (totalReadTime > 0) {
          const startEvent = {
            event: "thinking_start",
            label: ventMode ? "Reading carefully..." : "🤔 Thinking...",
          };
          sendSse(startEvent);
          
          await new Promise((resolve) => setTimeout(resolve, totalReadTime));
          
          sendSse({ event: "thinking_end" });
        }
        
        // Provider chain: Mistral (primary) -> Gemini -> Cloudflare Workers AI
        const aiAbort = new AbortController();
        const aiTimeout = setTimeout(() => aiAbort.abort(), 25000);
        try {
          const aiResp = await fetch(aiUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${aiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: aiModel,
              messages: [...systemMessages, ...messages],
              stream: true,
            }),
            signal: aiAbort.signal,
          });
          clearTimeout(aiTimeout);

          if (!aiResp.ok || !aiResp.body) {
            const errJson = await aiResp.json().catch(() => ({}));
            const errMsg =
              typeof errJson?.error === "string"
                ? errJson.error
                : typeof errJson?.error?.message === "string"
                  ? errJson.error.message
                  : JSON.stringify(errJson?.error ?? errJson ?? { message: "AI gateway error" });
            throw new Error(`Mistral error: ${errMsg}`);
          }

          const reader = aiResp.body.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          clearTimeout(aiTimeout);

          const systemText = systemMessages
            .map((m: any) => String(m?.content ?? "").trim())
            .filter(Boolean)
            .join("\n\n");

          const geminiText = await runGeminiFallback(GEMINI_API_KEY, systemText, messages ?? []);
          if (geminiText) {
            sendSse({ choices: [{ delta: { content: geminiText } }] });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          const workersText = await runWorkersFallback(
            WORKERS_API_KEY,
            CF_ACCOUNT_ID,
            systemText,
            messages ?? [],
          );
          if (workersText) {
            sendSse({ choices: [{ delta: { content: workersText } }] });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            return;
          }

          const msg = err instanceof Error ? err.message : "All AI providers failed";
          sendSse({ error: msg });
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
