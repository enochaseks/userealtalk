// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_BASE = `You are RealTalk — a calm, intelligent friend who helps people think clearly, reduce overthinking, and make better decisions.

CONVERSATION STYLE (most important):
- Talk like a real person, not an essay writer. Be warm, natural, conversational.
- DEFAULT to SHORT replies — usually 1 to 3 sentences. Often just one.
- When a user asks for advice, your FIRST move is a strong best-first answer (clear recommendation + brief why), then ask at most one high-value follow-up question only if needed.
- Do not make users do the thinking first when they asked for guidance; give your best current judgment up front with explicit assumptions.
- Avoid question-only replies. In most cases, provide at least one concrete option/recommendation before any follow-up question.
- If you ask a follow-up question, include a provisional best answer first so the user can react even if they do not know how to answer.
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
- Keep support warm and steady, never clingy or coercive.

CRITICAL: Maintaining conversation context:
- Pay careful attention to the conversation history. When the user mentions a person, situation, or topic they've already discussed, remember and reference the earlier context accurately.
- If a user refers back to something from earlier in the conversation, DO NOT make assumptions or reinterpret what they meant. Instead, use the conversation history to understand their intent correctly.
- For example, if a user is discussing relationship concerns, pay attention to who they're talking about and what they've already said about that situation. Don't confuse different people or topics.
- If the context from earlier in the conversation is needed to give a good response, explicitly reference it to show you remember.`;

const REAL_MODE = `\n\nBe Real Mode — ACTIVATED. You are the brutally honest friend who tells people what they need to hear, not what they want to hear.
- Start with a brief, genuine acknowledgment of their feeling — one sentence max. Then immediately pivot to the hard truth.
- Be blunt. Be direct. No fluff, no filler, no "that's understandable."
- Say exactly what you think. If it's a bad idea, say "That's a bad idea." If they're making an excuse, say "That sounds like an excuse."
- Call out avoidance, self-deception, or patterns you notice — without softening it.
- Short punchy sentences. Make your point in the first line.
- You can be a little harsh — that's the point. A real friend doesn't let you stay comfortable in a bad situation.
- Do NOT lecture. Say it once, clearly and hard. Don't repeat it three different ways.
- After the truth, give one concrete thing they can actually do about it.
- No bullet lists in normal replies. Talk like a real person.
- Example tone: "Look, I hear you — but honestly? You already know what the problem is. You're just hoping someone will say it's fine. It's not. Here's what you actually need to do..."`;


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

const PRACTICAL_LOGIC_MODE = `\n\nLogical Mode — ACTIVATED. You are a sharp analytical thinking partner. Your job is to cut through noise and help the user think clearly and decisively.
- Lead with your clearest, most confident conclusion first. Don't bury the insight at the end.
- Think like someone with high pattern recognition — identify what's really going on beneath the surface of the question.
- Break situations into clear components: what's known, what's uncertain, what matters most.
- Call out assumptions the user might be making without realizing it.
- Use crisp logic. If A leads to B and B leads to C, say it directly and confidently.
- Give real trade-offs — not vague "it depends" answers, but "if you care about X, do A; if you care about Y, do B."
- Push back if the user's framing seems off. Say "I think you're looking at this the wrong way" when that's true.
- Be warm but precise — like a trusted advisor who respects the user's intelligence and doesn't waste their time.
- Only use structure (numbered steps, bullets) when it genuinely helps. Skip it for simple questions.
- End with one sharp, clear next action or decision the user can make right now.`;

const ADVICE_FIRST_MODE = `\n\nAdvice quality rule:
- Give your strongest recommendation first, not a question-first reply.
- Do not return question-only responses for advice/decision prompts.
- Use a short decision lens when helpful: practical action, downside/risk, and emotional impact.
- If research context exists, use it to strengthen the recommendation and include a short "Sources:" section with only provided links.
- You may reference broad philosophical or psychological principles only at a high level; do not invent quotes, books, or citations.
- Ask at most one follow-up question, and only after giving concrete guidance.
- When asking a follow-up, include a default assumption and a valid provisional answer ("If X, do Y") so the user is never blocked by the question.`;

const OPTION_SET_MODE = `\n\nOption-first rule:
- For advice, decisions, and uncertainty prompts, provide 2-4 practical options first.
- Mark one as the recommended path with a one-line reason.
- If external facts matter and research context is available, ground options in that context and include "Sources:".
- Keep options realistic and executable; avoid vague motivational language.`;

const SCHEDULE_ASSIST_MODE = `\n\nSchedule assistant mode:
- If the user wants to add/create/schedule an event, DO NOT give generic options, app recommendations, or long explanations.
- Collect missing details conversationally: what they want to do, date, and time. Ask at most one short question per reply.
- Keep replies short (usually 1-2 sentences).
- If the user already gave activity + date + time, do not ask extra planning questions (no buffer-time or optimization questions). Save it immediately.
- Do not ask for end time unless the user explicitly requests an end time.
- Once you have all required details, confirm briefly and append exactly one hidden action line at the end:
  [SCHEDULE_SAVE:{"title":"<activity>","starts_at":"<ISO 8601 datetime>","notes":"<extra context or empty string>"}]
- Only output that action line when title + date + time are all confirmed.
- Never tell the user to open a tab or click UI controls.`;

const BUSINESS_MARKETING_CONNOISSEUR_MODE = `\n\nBusiness/Marketing Connoisseur mode:
- Act like a practical business strategist + marketing strategist.
- For prompts like "I want to start a business" or "How do I market my business", do NOT start with questions.
- First response must include options immediately (at least 3), each with brief pros/cons, expected effort/cost, and who it suits.
- Then recommend one option and provide a step-by-step starter execution plan.
- You may ask one optional clarifying question only at the very end.
- Keep it actionable and realistic, not motivational fluff.`;

const BENEFITS_HELPER_MODE = `\n\nBenefits Helper Mode (UK Universal Credit and related support):
- Treat benefits requests as high-stakes practical support: reduce overwhelm, improve accuracy, and prevent missed actions.
- Be clear and supportive, but factual. Use plain English and avoid jargon.
- Never present yourself as DWP or as an official government decision-maker.
- Do NOT guarantee eligibility, payment amounts, or outcomes. Use probability language when uncertain.
- Start with the best immediate next step first, then give a short checklist tailored to the user's situation.
- For UC-related guidance, prioritize:
  1) readiness/documents needed,
  2) timeline and deadlines,
  3) journal/appointment actions,
  4) common sanction-risk mistakes to avoid,
  5) one draft message template when useful.
- If details are missing, provide assumptions and one follow-up question max.
- Include a brief disclaimer naturally: informational guidance, not legal/government advice.
- If research links are available, prefer official GOV.UK sources first in Sources.`;

const REFERENCES_GUARDRAIL_MODE = `\n\nReferences rule:
- Only cite links explicitly present in the provided research context.
- Do not invent sources or URLs.
- If no usable research context is available, do not fabricate references; say that up-to-date sources were not available.`;

const DETAILED_PLAN_OUTPUT_MODE = `\n\nDetailed output rule for plan requests:
- Make the plan thorough and practical, not vague.
- Include concrete numbers/ranges where possible (budget ranges, timelines, expected effort), and label assumptions.
- Prefer depth over brevity for plan mode.
- End with "Sources:" and list the supporting links when available.`;

const EMOTIONAL_SUPPORT_MODE = `\n\nEmotional Support Mode is ACTIVE — the user turned this on manually. This overrides all advice-first and logic-first rules.
- Your ONLY job right now is to make the user feel truly heard and understood. Do NOT fix, solve, or advise.
- Lead with warmth. Acknowledge what they're feeling before anything else. Name the emotion explicitly — "That sounds really exhausting" or "It makes sense you feel hurt by that."
- Reflect back what you heard in your own words so they feel seen, not processed.
- Do NOT give bullet points, action steps, recommendations, or logical breakdowns.
- Do NOT pivot to solutions unless they explicitly ask "what should I do" or "what do you think I should do."
- Use short, warm, human replies. One or two sentences is often perfect. Never write a wall of text.
- Ask at most one gentle open question after validating — something like "Do you want to talk more about it?" or "How long have you been feeling this way?"
- Tone: calm, soft, present. Like a close friend who actually listens instead of jumping to fix things.
- Never use clinical language, generic affirmations ("That must be hard!"), or hollow phrases. Be genuine.
- You are a caring, grounded presence — not a therapist, not a coach. Just someone who genuinely listens and cares.`;

const VENT_MODE_BASE = `\n\nThe user is venting. Your first job is to understand and emotionally validate what they shared.
- Do not minimize or judge.
- Reflect key feelings and what seems to be hurting them most.
- Keep tone calm, human, and grounded.
- Keep responses concise unless asked for depth.`;

const VENT_NO_ADVICE = `\n\nThe user asked for NO advice. Only listen, validate, and reflect back what you heard. End with a gentle check-in question.`;
const VENT_REFLECT = `\n\nThe user wants reflection, not direct advice. Summarize core issues and patterns clearly. You may ask one clarifying question.`;
const VENT_ADVICE = `\n\nThe user is open to advice. After validating feelings, give practical and realistic advice with 2-4 clear next steps.`;
const REFERENCES_REQUEST_MODE = `\n\nThe user asked for links/references.
- Provide a concise answer, then include a final "Sources:" section.
- In Sources, list only full URLs (https://...) from the provided research context.
- Include at least 3 links when available.
- Never say you cannot provide links directly when links are available in context.
- If no research links are available, say Google references were unavailable right now and suggest trying again.`;

const INTERNET_SEARCH_MODE = `\n\nInternet search mode:
- The user explicitly asked to search the internet/web.
- Use the provided research context as the factual basis.
- Give a direct answer first, then include a final "Sources:" section with only full URLs from context.
- If the query is broad, summarize the top findings and flag uncertainty briefly when sources disagree.
- Do not invent links or citations.
- Do NOT say you cannot browse/search the internet.
- If provider results are missing but fallback links are provided, use those links and still return a useful answer with Sources.`;

const PLATFORM_KNOWLEDGE_CONTEXT = `RealTalk platform knowledge (authoritative in-app context):
- Core product: RealTalk is a conversational support app for practical life help, emotional support, and decision clarity.
- Main chat experience includes mode toggles: Be Real, Emotional Support, Logical Mode, Deep Thinking, Plan Mode, Vent Mode, and Benefits Helper.
- Vent mode supports listen-only, reflection, or advice paths and is designed for private-feeling emotional expression.
- Benefits Helper focuses on UK Universal Credit style guidance with practical next steps and clear disclaimers.
- CV Toolkit supports CV review workflows, including CV rewrite, job-match analysis, cover-letter generation, transferable-skills extraction, personal statement support, and PDF CV text extraction.
- Journal feature exists for saving important reflections and entries.
- Advice Library exists with moderated community advice posts that can be used as supportive context.
- Safety enforcement exists: violent/abusive threat language can trigger warnings, strikes, and temporary chat restrictions.
- Scheduling assistance exists in chat for creating reminder-style events when the user provides activity, date, and time.
- Account areas include auth, profile, settings, account data, and recovery/reset flows.
- Billing exists via Stripe with plan-based usage limits (for example Deep Thinking and Plan Mode usage limits).

Platform support behavior:
- When user asks about app/platform/product features, answer as an in-product expert and explain exactly how to do it in RealTalk.
- Prefer concrete, step-by-step in-app guidance over generic advice.
- If a feature is plan-limited or conditional, say so clearly and suggest the fastest valid path.
- If unsure on a detail, state uncertainty briefly and offer the best verified next step.`;

const PLATFORM_HELP_MODE = `\n\nPlatform Help Mode:
- The user is asking about RealTalk itself. Treat this as product support.
- Use this response shape for platform-help replies:
  Where: name the exact area/feature in RealTalk.
  Steps: 2-5 concrete actions the user should take in-app.
  Result: what they should see/expect after following the steps.
- Give direct in-app guidance first: what feature to use, where to go, what to click/type, and what outcome to expect.
- Keep instructions practical and concise; avoid generic motivational wording.
- If the request sounds like onboarding, suggest the best first workflow in the app.
- If the user asks for capabilities, explain what RealTalk can and cannot do right now.`;

const ATTACHMENT_ANALYSIS_MODE = `\n\nAttachment analysis mode:
- If attachment context is provided, treat it as already extracted evidence and analyze it directly.
- Do NOT say "I will extract" or "I can't see files" when extracted context exists.
- Quote specific details from the extracted attachment context when relevant.
- If extraction failed for a file, state that clearly and ask for a re-upload or pasted text only for that file.`;

const CV_NUDGE_MODE = `\n\nCV help mode:
- If the user asks for CV/resume help, provide practical help immediately (feedback, edits, rewrite suggestions, or next steps).
- Then add one short, natural nudge to use CV Toolkit for deeper analysis.
- Keep the nudge lightweight and specific, e.g. mention opening Tools > CV Reviewer (CV Toolkit).
- Do not make the whole reply about the nudge; solve the user's CV question first.`;

const isPlanningRequest = (text: string): boolean => {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const explicitPlanPatterns = [
    /\b(make|build|create|write|draft|outline|map(?:\s+out)?|lay\s+out|put\s+together)\s+(?:me\s+)?(?:a\s+)?(plan|roadmap|strategy|timeline|budget|action plan|launch plan|marketing plan)\b/i,
    /\b(give|show|send)\s+(?:me\s+)?(?:a\s+)?(plan|roadmap|strategy|timeline|budget|action plan|launch plan|marketing plan)\b/i,
    /\b(help me|can you|could you|would you|i need|i want)\s+(?:make|build|create|write|draft|outline|map(?:\s+out)?|plan)\b/i,
    /\b(plan\s+(?:my|out)|map\s+out|lay\s+out)\b/i,
    /\b(step[ -]?by[ -]?step|30[ -]?day|60[ -]?day|90[ -]?day)\s+plan\b/i,
    /\b(i need|i want|help me with|give me|show me)\s+(?:a\s+)?(marketing plan|launch plan|action plan)\b/i,
  ];

  return explicitPlanPatterns.some((pattern) => pattern.test(normalized));
};

const isScheduleRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const scheduleKeywords = [
    "schedule",
    "calendar",
    "reminder",
    "appointment",
    "meeting",
    "book me",
    "add to calendar",
    "add event",
    "set a reminder",
    "remind me",
  ];
  return scheduleKeywords.some((k) => lower.includes(k));
};

const isScheduleConversation = (messages: Array<{ role: string; content: string }>): boolean => {
  const recent = (messages ?? []).slice(-8);
  const combined = recent.map((m) => String(m?.content ?? "").toLowerCase()).join("\n");
  const conversationMarkers = [
    "schedule",
    "calendar",
    "appointment",
    "reminder",
    "[schedule_save:",
    "add event",
    "set a reminder",
    "remind me",
  ];
  return conversationMarkers.some((k) => combined.includes(k));
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

const isBenefitsSupportRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const benefitsKeywords = [
    "universal credit",
    "uc claim",
    "benefits",
    "dwp",
    "jobcentre",
    "journal",
    "sanction",
    "limited capability for work",
    "lcwra",
    "housing element",
    "carer element",
    "pip",
    "esa",
    "work capability assessment",
    "mandatory reconsideration",
  ];
  return benefitsKeywords.some((k) => lower.includes(k));
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

const resolveAdviceCategory = (text: string): string | null => {
  const lower = String(text || "").toLowerCase();
  if (!lower) return null;

  if (isBenefitsSupportRequest(lower)) return "benefits";
  if (/(anxious|anxiety|panic|overthink|stress|depress|low mood|mental health|burnout)/.test(lower)) return "mental-health";
  if (/(money|debt|rent|bill|budget|saving|salary|wage|financial)/.test(lower)) return "money";
  if (/(job|career|interview|manager|promotion|workplace|boss|coworker|colleague)/.test(lower)) return "work";
  if (/(relationship|partner|dating|boyfriend|girlfriend|marriage|friendship|family|parent)/.test(lower)) return "relationships";
  return "general";
};

const buildAdviceSearchTerms = (text: string): string[] => {
  const lower = String(text || "").toLowerCase();
  if (!lower) return [];

  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "if", "then", "to", "for", "of", "in", "on", "at", "by", "with", "about", "from",
    "is", "are", "am", "be", "been", "was", "were", "i", "im", "me", "my", "we", "our", "you", "your", "it", "this", "that",
    "what", "when", "where", "why", "how", "should", "could", "would", "can", "just", "really", "very", "help", "advice",
  ]);

  return Array.from(
    new Set(
      lower
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stopWords.has(w)),
    ),
  ).slice(0, 8);
};

const buildAdviceContext = async (
  admin: any,
  lastUserMessage: string,
  options: { benefitsRequested: boolean; adviceRequested: boolean; practicalRequested: boolean; logicalExecutionRequested: boolean; emotionalRequested: boolean; emotionalMode: boolean },
): Promise<string> => {
  if (!admin) return "";
  if (options.emotionalMode || options.emotionalRequested) return "";
  if (!options.benefitsRequested && !options.adviceRequested && !options.practicalRequested && !options.logicalExecutionRequested) return "";

  const category = resolveAdviceCategory(lastUserMessage);
  const terms = buildAdviceSearchTerms(lastUserMessage);

  let query = admin
    .from("advice_posts")
    .select("id, title, body, category, tags, helpful_count, created_at")
    .eq("status", "approved")
    .order("helpful_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(24);

  if (category && category !== "general") {
    query = query.eq("category", category);
  }

  const { data } = await query;
  const posts = Array.isArray(data) ? data : [];
  if (posts.length === 0) return "";

  const scored = posts
    .map((post: any) => {
      const haystack = `${String(post.title || "")} ${String(post.body || "")} ${(Array.isArray(post.tags) ? post.tags.join(" ") : "")}`.toLowerCase();
      const matchCount = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0);
      const helpfulWeight = Number(post.helpful_count || 0) * 0.2;
      return { post, score: matchCount + helpfulWeight };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5)
    .map((item: any) => item.post);

  if (scored.length === 0) return "";

  const lines = scored.map((post: any, index: number) => {
    const title = String(post.title || "Untitled advice").replace(/\s+/g, " ").trim();
    const body = String(post.body || "").replace(/\s+/g, " ").trim();
    const snippet = body.length > 260 ? `${body.slice(0, 257)}...` : body;
    const postCategory = String(post.category || "general");
    return `${index + 1}. [${postCategory}] ${title} - ${snippet}`;
  });

  return `Approved community advice context (anonymous, moderated):\n${lines.join("\n")}\nUse this as supportive experiential guidance, not as legal/medical authority.`;
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

const isReferencesRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const keys = [
    "source",
    "sources",
    "reference",
    "references",
    "citation",
    "citations",
    "link",
    "links",
    "where did you get",
    "proof",
    "evidence",
  ];
  return keys.some((k) => lower.includes(k));
};

const isInternetSearchRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const keys = [
    "search the internet",
    "search internet",
    "search the web",
    "help me search",
    "look this up",
    "look it up",
    "find online",
    "find on the internet",
    "check online",
    "web search",
    "google this",
    "search online",
  ];
  if (keys.some((k) => lower.includes(k))) return true;

  // Catch natural requests like "search houses in london" or "can you find flats online"
  const genericSearchPattern = /\b(search|look\s+up|find|google)\b/i;
  return genericSearchPattern.test(lower);
};

const isInternetSearchConversation = (messages: Array<{ role: string; content: string }>): boolean => {
  const recent = (messages ?? []).slice(-8);
  const combined = recent.map((m) => String(m?.content ?? "").toLowerCase()).join("\n");
  const markers = [
    "search the internet",
    "search the web",
    "search online",
    "web search",
    "look this up",
    "find online",
    "google this",
  ];
  return markers.some((k) => combined.includes(k));
};

const isPlatformHelpRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const keys = [
    "realtalk",
    "this platform",
    "this app",
    "how does this app",
    "how does this platform",
    "how do i use",
    "where do i",
    "where can i",
    "feature",
    "features",
    "settings",
    "profile",
    "journal",
    "advice library",
    "cv toolkit",
    "cv review",
    "plan mode",
    "deep thinking",
    "vent mode",
    "benefits helper",
    "subscription",
    "upgrade",
    "billing",
    "account",
  ];
  return keys.some((k) => lower.includes(k));
};

const isPlatformHelpConversation = (messages: Array<{ role: string; content: string }>): boolean => {
  const recent = (messages ?? []).slice(-8);
  const combined = recent.map((m) => String(m?.content ?? "").toLowerCase()).join("\n");
  const markers = [
    "realtalk",
    "this app",
    "platform",
    "cv toolkit",
    "plan mode",
    "deep thinking",
    "vent mode",
    "benefits helper",
    "advice library",
    "journal",
    "subscription",
    "billing",
  ];
  return markers.some((k) => combined.includes(k));
};

const isCvHelpRequest = (text: string): boolean => {
  const lower = String(text ?? "").toLowerCase();
  if (!lower) return false;
  const keys = [
    "cv",
    "resume",
    "curriculum vitae",
    "cover letter",
    "job match",
    "personal statement",
    "rewrite my cv",
    "review my cv",
    "improve my cv",
    "improve my resume",
  ];
  return keys.some((k) => lower.includes(k));
};

const isCvHelpConversation = (messages: Array<{ role: string; content: string }>): boolean => {
  const recent = (messages ?? []).slice(-6);
  const combined = recent.map((m) => String(m?.content ?? "").toLowerCase()).join("\n");
  const markers = ["cv", "resume", "cover letter", "job match", "personal statement", "cv toolkit", "cv reviewer"];
  return markers.some((k) => combined.includes(k));
};

const isQueryRequiresWebSearch = (text: string): boolean => {
  const lower = text.toLowerCase();

  // Current events, news, latest info, real-time data
  const currentInfoKeywords = ["latest", "current", "today", "this week", "this month", "recent", "newest", "breaking", "news", "update", "2026", "2025"];
  if (currentInfoKeywords.some((k) => lower.includes(k))) return true;

  // Prices, rates, costs, fees, affordability
  const priceKeywords = ["price", "cost", "rate", "fee", "salary", "wage", "rent", "mortgage", "how much", "how expensive", "afford"];
  if (priceKeywords.some((k) => lower.includes(k)) && !/\b(hypothetical|imagine|suppose|if)\b/i.test(lower)) return true;

  // Locations, recommendations, businesses
  const locationKeywords = ["restaurant", "hotel", "cafe", "coffee", "bar", "gym", "hospital", "doctor", "plumber", "electrician", "best place", "where to", "near me", "in london", "in manchester", "in uk", "in america", "nearby"];
  if (locationKeywords.some((k) => lower.includes(k)) && !lower.includes("hypothetical")) return true;

  // How-to, instructional queries that need current tools/methods
  const instructKeywords = ["how to", "how do i", "guide", "tutorial", "steps to", "instructions"];
  if (instructKeywords.some((k) => lower.includes(k)) && /\b(build|make|create|start|grow|launch|open|get|find|learn|setup|install)\b/i.test(lower)) return true;

  // Comparisons of real products/services
  const compareKeywords = ["best", "worst", "top", "vs", "versus", "better than", "compare"];
  if (compareKeywords.some((k) => lower.includes(k)) && /\b(product|service|company|app|tool|software|phone|car|house|hotel|restaurant|job|career)\b/i.test(lower)) return true;

  // Factual questions (who, what, when, where about real things)
  if (/^(what is|who is|when was|where is|what are)\s+\b(?!the answer|the difference|the point)\w+/i.test(lower)) {
    if (!/\b(hypothetical|theoretical|supposed|imagine)\b/i.test(lower)) return true;
  }

  return false;
};

const SEARCH_STOPWORDS = new Set([
  "help", "me", "to", "for", "the", "a", "an", "on", "in", "at", "of", "and", "or", "please",
  "can", "could", "would", "will", "you", "i", "want", "need", "find", "search", "look", "up",
  "internet", "web", "online", "about", "with", "from", "this", "that", "it",
]);

const toKeywordQuery = (value: string): string => {
  const tokens = String(value ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) => token.length > 1 || /^\d+$/.test(token))
    .filter((token) => !SEARCH_STOPWORDS.has(token));

  return [...new Set(tokens)].slice(0, 12).join(" ");
};

const extractInternetSearchQuery = (text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  const stripped = normalized
    .replace(/^(please\s+)?(can you\s+|could you\s+|will you\s+)?/i, "")
    .replace(/^(help\s+me\s+(to\s+)?)?(search|find|look\s+up|google)\s+((on\s+)?(the\s+)?(internet|web)\s+)?(for\s+)?/i, "")
    .replace(/\b(search\s+(the\s+)?(internet|web)|look\s+(this|it)\s+up|find\s+(this\s+)?online|check\s+online|web\s+search|google\s+this)\b[:\-\s]*/i, "")
    .trim();

  const keywordQuery = toKeywordQuery(stripped || normalized);
  if (keywordQuery) return buildSearchQuery(keywordQuery);

  return buildSearchQuery(stripped || normalized);
};

const resolveInternetSearchQuery = (messages: Array<{ role: string; content: string }>, lastUserMessage: string): string => {
  const direct = extractInternetSearchQuery(lastUserMessage);
  const isTooGeneric = /^(help me search|search|look it up|look this up|find this|google this)$/i.test(direct);
  if (direct && !isTooGeneric) return direct;

  const recentUsers = (messages ?? []).filter((m) => m.role === "user").slice(-6).reverse();
  for (const entry of recentUsers) {
    const candidate = extractInternetSearchQuery(String(entry?.content ?? ""));
    if (!candidate) continue;
    if (/^(help me search|search|look it up|look this up|find this|google this)$/i.test(candidate)) continue;
    return candidate;
  }

  return direct || buildSearchQuery(lastUserMessage);
};

const isAdviceRequest = (text: string): boolean => {
  const lower = text.toLowerCase();
  const keys = [
    "advice",
    "advise",
    "what should i do",
    "what do you think i should do",
    "help me decide",
    "guide me",
    "best move",
    "best next step",
    "what's the best",
    "whats the best",
    "give me your opinion",
    "your take",
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

const extractConversationContext = (messages: Array<{ role: string; content: string }>): string | null => {
  if (!messages || messages.length < 6) return null;

  // Get recent user messages to identify conversation topics
  const userMessages = messages
    .filter((m) => m.role === "user")
    .slice(-8)
    .map((m) => String(m?.content ?? "").toLowerCase());

  const contextKeywords: Record<string, string> = {
    relationship: "user is discussing relationships or romantic situations",
    girlfriend: "user is discussing their girlfriend or a female partner",
    boyfriend: "user is discussing their boyfriend or a male partner",
    family: "user is discussing family dynamics or relationships",
    career: "user is discussing career or job-related matters",
    business: "user is considering starting or growing a business",
    anxiety: "user is dealing with anxiety or stress",
    depression: "user is dealing with depression or low mood",
    work: "user is dealing with work-related challenges",
    dating: "user is discussing dating or dating concerns",
    lgbtq: "user is discussing LGBTQ+ topics or sexual orientation",
    sexuality: "user is discussing sexuality or sexual orientation",
    lesbian: "user is discussing lesbian identity or concerns",
    gay: "user is discussing gay identity or concerns",
    friendship: "user is discussing friendships or friend relationships",
    breakup: "user is dealing with a breakup or relationship ending",
    mental_health: "user is discussing mental health concerns",
    decision: "user is making an important life decision",
    money: "user is discussing money or financial concerns",
  };

  const identifiedTopics: string[] = [];
  for (const [keyword, description] of Object.entries(contextKeywords)) {
    if (userMessages.some((msg) => msg.includes(keyword))) {
      identifiedTopics.push(description);
    }
  }

  // Remove duplicates and return as context
  const uniqueTopics = [...new Set(identifiedTopics)];
  if (uniqueTopics.length === 0) return null;

  return `Current conversation context: The user is discussing the following topic(s): ${uniqueTopics.join("; ")}. Keep this context in mind when responding—avoid misinterpreting references to earlier parts of this conversation.`;
};

const buildMemoryInstruction = (memoryProfile: any, recentMessages?: Array<{ role: string; content: string }>): string => {
  const lines: string[] = [];

  // Add conversation context first
  if (recentMessages) {
    const conversationContext = extractConversationContext(recentMessages);
    if (conversationContext) {
      lines.push(conversationContext);
    }
  }

  if (!memoryProfile) return lines.join("\n");

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

const extractUrlsFromResults = (results: string[]): string[] => {
  const urls = results
    .map((entry) => {
      const match = entry.match(/https?:\/\/\S+/i);
      return match ? match[0].replace(/[),.;]+$/, "") : "";
    })
    .filter(Boolean);

  return [...new Set(urls)].slice(0, 8);
};

const normalizeResultUrl = (rawUrl: string): string => {
  const input = String(rawUrl ?? "").trim();
  if (!input) return "";

  const withProtocol = input.startsWith("//") ? `https:${input}` : input;

  try {
    const parsed = new URL(withProtocol);

    // DuckDuckGo sometimes returns redirect wrappers in result links.
    if (parsed.hostname.endsWith("duckduckgo.com") && parsed.pathname.startsWith("/l/")) {
      const wrapped = parsed.searchParams.get("uddg");
      if (wrapped) {
        const decoded = decodeURIComponent(wrapped);
        if (/^https?:\/\//i.test(decoded)) return decoded;
      }
    }

    if (!/^https?:$/i.test(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const isLikelyReachableUrl = async (url: string): Promise<boolean> => {
  const check = async (method: "HEAD" | "GET") => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 4500);
    try {
      const resp = await fetch(url, {
        method,
        redirect: "follow",
        signal: ac.signal,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      // 401/403/405 can still indicate a valid live page behind restrictions.
      return resp.ok || resp.status === 401 || resp.status === 403 || resp.status === 405;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  };

  const headOk = await check("HEAD");
  if (headOk) return true;
  return check("GET");
};

const getVerifiedLinks = async (results: string[], fallbackLinks: string[]): Promise<string[]> => {
  const candidates = extractUrlsFromResults(results)
    .map((url) => normalizeResultUrl(url))
    .filter((url) => /^https?:\/\//i.test(url));

  const dedupedCandidates = [...new Set(candidates)].slice(0, 8);
  const checks = await Promise.all(
    dedupedCandidates.map(async (url) => ({ url, ok: await isLikelyReachableUrl(url) })),
  );

  const verified = checks.filter((item) => item.ok).map((item) => item.url);
  if (verified.length > 0) return verified;

  // Fallback links are deterministic search URLs and should always be valid endpoints.
  return fallbackLinks;
};

const fetchTavilyResults = async (query: string): Promise<string[]> => {
  const tavilyApiKey = Deno.env.get("TAVILY_API_KEY");
  if (!tavilyApiKey) return [];

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 7000);
  let resp: Response;
  try {
    resp = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: ac.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tavilyApiKey}`,
        "x-api-key": tavilyApiKey,
      },
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query,
        search_depth: "advanced",
        max_results: 8,
        include_answer: true,
        include_raw_content: false,
      }),
    });
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }

  if (!resp.ok) return [];

  const data = await resp.json().catch(() => ({}));
  const items = Array.isArray((data as any)?.results) ? (data as any).results : [];

  return items
    .slice(0, 8)
    .map((item: any, idx: number) => {
      const title = String(item?.title ?? "Untitled").trim();
      const snippet = String(item?.content ?? item?.snippet ?? "").replace(/\s+/g, " ").trim();
      const link = String(item?.url ?? "").trim();
      return `${idx + 1}. ${title}\n${snippet}\n${link}`.trim();
    })
    .filter(Boolean);
};

const fetchGoogleCseResults = async (query: string): Promise<string[]> => {
  const GOOGLE_API_KEY =
    Deno.env.get("GOOGLE_API_KEY") ??
    Deno.env.get("GOOGLE_SEARCH_API_KEY") ??
    Deno.env.get("GOOGLE_CUSTOM_SEARCH_API_KEY");
  const GOOGLE_CSE_ID =
    Deno.env.get("GOOGLE_CSE_ID") ??
    Deno.env.get("GOOGLE_SEARCH_ENGINE_ID") ??
    Deno.env.get("GOOGLE_CUSTOM_SEARCH_ENGINE_ID");
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

const fetchDuckDuckGoHtmlResults = async (query: string): Promise<string[]> => {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 7000);
  let resp: Response;
  try {
    resp = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
  if (!resp.ok) return [];

  const html = await resp.text().catch(() => "");
  if (!html) return [];

  const results: string[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  let idx = 1;
  while ((match = re.exec(html)) && idx <= 8) {
    const href = String(match[1] ?? "").replace(/&amp;/g, "&");
    const title = String(match[2] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (!title) continue;

    results.push(`${idx}. ${title}\n${href}`);
    idx++;
  }

  return results;
};

const fetchBingHtmlResults = async (query: string): Promise<string[]> => {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 7000);
  let resp: Response;
  try {
    resp = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
  if (!resp.ok) return [];

  const html = await resp.text().catch(() => "");
  if (!html) return [];

  const results: string[] = [];
  const re = /<li\s+class="b_algo"[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  let idx = 1;
  while ((match = re.exec(html)) && idx <= 8) {
    const href = String(match[1] ?? "").replace(/&amp;/g, "&");
    const title = String(match[2] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const snippet = String(match[3] ?? "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!href || !/^https?:\/\//i.test(href)) continue;
    if (!title) continue;

    results.push(`${idx}. ${title}\n${snippet}\n${href}`.trim());
    idx++;
  }

  return results;
};

const getResearchContext = async (query: string, requireGoogle = false): Promise<string> => {
  if (!query) return "";

  const keywordQuery = toKeywordQuery(query) || query;

  const encoded = encodeURIComponent(keywordQuery);
  const fallbackLinks = [
    `https://www.google.com/search?q=${encoded}`,
    `https://duckduckgo.com/?q=${encoded}`,
    `https://www.bing.com/search?q=${encoded}`,
  ];

  // Domain-specific helpers for common requests like housing searches.
  if (/\b(house|houses|flat|flats|property|properties|rent|rental|letting|apartment|apartments)\b/i.test(keywordQuery)) {
    fallbackLinks.push(
      `https://www.google.com/search?q=${encodeURIComponent(`${keywordQuery} site:rightmove.co.uk`)}`,
      `https://www.google.com/search?q=${encodeURIComponent(`${keywordQuery} site:zoopla.co.uk`)}`,
      `https://www.google.com/search?q=${encodeURIComponent(`${keywordQuery} site:onthemarket.com`)}`,
    );
  }

  const tavilyResults = await fetchTavilyResults(keywordQuery);
  const googleResults = await fetchGoogleCseResults(keywordQuery);
  const ddgResults = requireGoogle ? [] : await fetchDuckDuckGoResults(keywordQuery);
  const ddgHtmlResults = requireGoogle ? [] : await fetchDuckDuckGoHtmlResults(keywordQuery);
  const bingHtmlResults = requireGoogle ? [] : await fetchBingHtmlResults(keywordQuery);
  const results = requireGoogle
    ? (tavilyResults.length > 0 ? tavilyResults : googleResults)
    : (
        tavilyResults.length > 0
          ? tavilyResults
          : (googleResults.length > 0
          ? googleResults
          : (ddgResults.length > 0
              ? ddgResults
              : (ddgHtmlResults.length > 0 ? ddgHtmlResults : bingHtmlResults)))
      );
  if (results.length === 0) {
    return [
      "Web research notes for this request:",
      "Live search provider snippets were unavailable, so fallback search links were generated.",
      "Use these links directly to view current results for the user's query:",
      ...fallbackLinks.map((url, idx) => `${idx + 1}. ${url}`),
      "Verified links:",
      ...fallbackLinks.map((url, idx) => `${idx + 1}. ${url}`),
      "Use these as supporting context, not absolute truth. If data is uncertain or location-specific, say that briefly.",
      "If you produce a practical plan or analysis, include a short Sources section using only full URLs listed above.",
    ].join("\n\n");
  }

  const links = await getVerifiedLinks(results, fallbackLinks);
  const linksBlock = links.length > 0
    ? ["Verified links:", ...links.map((url, idx) => `${idx + 1}. ${url}`)].join("\n")
    : "";

  return [
    requireGoogle ? "Google research notes for this request:" : "Web research notes for this request:",
    `Search query used: ${keywordQuery}`,
    ...results,
    linksBlock,
    "Use these as supporting context, not absolute truth. If data is uncertain or location-specific, say that briefly.",
    "If you produce a practical plan or analysis, include a short Sources section using only full URLs listed above.",
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

const getInternetSearchReadTime = (text: string, internetSearchMode: boolean): number => {
  if (!internetSearchMode) return 0;

  const len = text.trim().length;
  // 2.5s to 8s to make web-search state visibly distinct.
  const computed = 2500 + Math.min(5500, Math.floor(len * 12));
  return Math.min(computed, 8000);
};

type SafetyViolation = {
  category: "violent_threat" | "abusive_harassment";
  severity: "high" | "medium";
};

const detectSafetyViolation = (text: string): SafetyViolation | null => {
  const lower = String(text ?? "").toLowerCase();
  if (!lower.trim()) return null;

  const firstPersonIntent = /(i\s*(will|am going to|gonna)|let me|should i|i want to)/.test(lower);
  const targetMarkers = /(him|her|them|that person|my ex|my boss|my neighbor|people|someone)/.test(lower);

  const violentAction = /(kill|stab|shoot|beat up|assault|attack|hurt|harm|poison|burn|bomb)/.test(lower);
  if (violentAction && firstPersonIntent && targetMarkers) {
    return { category: "violent_threat", severity: "high" };
  }

  const abusiveHarassment = /(i\s*(will|am going to|gonna)\s*(destroy|ruin|terrorize|harass|intimidate))/.test(lower);
  if (abusiveHarassment && targetMarkers) {
    return { category: "abusive_harassment", severity: "medium" };
  }

  return null;
};

const buildImmediateSseResponse = (content: string): Response => {
  const payload = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n` + "data: [DONE]\n\n";
  return new Response(payload, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
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

type IncomingAttachment = {
  name?: string;
  mimeType?: string;
  base64?: string;
  sizeBytes?: number;
  kind?: "image" | "pdf" | "text" | "other";
};

type IncomingUserLocation = {
  countryCode?: string;
  label?: string;
  source?: "gps" | "locale" | "manual";
  updatedAt?: string;
};

const buildLocationInstruction = (rawLocation: unknown): string => {
  if (!rawLocation || typeof rawLocation !== "object") return "";

  const location = rawLocation as IncomingUserLocation;
  const countryCode = String(location.countryCode ?? "").trim().toUpperCase();
  const label = String(location.label ?? "").trim();
  if (!countryCode || !label) return "";

  const source = location.source === "gps" || location.source === "manual" ? location.source : "locale";
  return [
    "User location context:",
    `- Country: ${label} (${countryCode})`,
    `- Source: ${source}`,
    "Location behavior:",
    "- Prefer country-specific guidance, laws, and links for this location.",
    "- If sharing official resources, prioritize that country's official sites first.",
    "- If the user asks for another country, follow the user's requested country instead.",
    "- If location relevance is unclear, ask one short clarifying question.",
  ].join("\n");
};

const decodeBase64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const normalizeAttachmentKind = (raw: IncomingAttachment): "image" | "pdf" | "text" | "other" => {
  const mime = String(raw.mimeType ?? "").toLowerCase();
  const name = String(raw.name ?? "").toLowerCase();
  if (raw.kind === "image" || mime.startsWith("image/")) return "image";
  if (raw.kind === "pdf" || mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    raw.kind === "text" ||
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json")
  ) {
    return "text";
  }
  return "other";
};

const extractAttachmentText = async (
  attachment: IncomingAttachment,
  mistralApiKey: string | undefined,
): Promise<string> => {
  const name = String(attachment.name ?? "attachment").slice(0, 120);
  const base64 = String(attachment.base64 ?? "").trim();
  const mimeType = String(attachment.mimeType ?? "application/octet-stream");
  const kind = normalizeAttachmentKind(attachment);

  if (!base64) {
    return `[${name}] Could not read this file content.`;
  }

  if (kind === "text") {
    try {
      const bytes = decodeBase64ToBytes(base64);
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
      if (!text) return `[${name}] Text file appears empty.`;
      const clipped = text.length > 5000 ? `${text.slice(0, 5000)}\n...[truncated]` : text;
      return `[${name}]\n${clipped}`;
    } catch {
      return `[${name}] Couldn't decode text file.`;
    }
  }

  if ((kind === "image" || kind === "pdf") && mistralApiKey) {
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const tryOcr = async (): Promise<string | null> => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 18000);
      try {
        const resp = await fetch("https://api.mistral.ai/v1/ocr", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: {
              type: "document_url",
              document_url: dataUrl,
            },
          }),
          signal: ac.signal,
        });

        if (!resp.ok) return null;
        const json = await resp.json().catch(() => ({}));
        const extracted = Array.isArray(json?.pages)
          ? json.pages.map((p: any) => String(p?.markdown ?? p?.text ?? "")).join("\n\n").trim()
          : "";
        return extracted || null;
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    };

    const tryVisionForImage = async (): Promise<string | null> => {
      if (kind !== "image") return null;
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 18000);
      try {
        const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "pixtral-12b-latest",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "Extract all visible text from this image. If there is little/no text, describe the key visible details briefly." },
                  { type: "image_url", image_url: dataUrl },
                ],
              },
            ],
            max_tokens: 1200,
          }),
          signal: ac.signal,
        });

        if (!resp.ok) return null;
        const json = await resp.json().catch(() => ({}));
        const content = json?.choices?.[0]?.message?.content;
        return typeof content === "string" ? content.trim() || null : null;
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    };

    const extracted = (await tryOcr()) ?? (await tryVisionForImage());
    if (!extracted) {
      return `[${name}] No readable content could be extracted from this ${kind}.`;
    }

    const clipped = extracted.length > 5000 ? `${extracted.slice(0, 5000)}\n...[truncated]` : extracted;
    return `[${name}]\n${clipped}`;
  }

  if (kind === "image" || kind === "pdf") {
    return `[${name}] ${kind.toUpperCase()} was uploaded, but OCR is unavailable right now.`;
  }

  return `[${name}] File uploaded. This format isn't directly readable yet, but the assistant can still discuss it based on your description.`;
};

const buildAttachmentContext = async (
  rawAttachments: unknown,
  mistralApiKey: string | undefined,
): Promise<string> => {
  if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) return "";

  const attachments = rawAttachments
    .slice(0, 3)
    .map((item) => (typeof item === "object" && item ? (item as IncomingAttachment) : null))
    .filter(Boolean) as IncomingAttachment[];

  if (attachments.length === 0) return "";

  const extracted = await Promise.all(attachments.map((attachment) => extractAttachmentText(attachment, mistralApiKey)));
  const succeeded = extracted.filter((entry) => !/No readable content|Could not read this file|isn't directly readable|OCR is unavailable|Couldn't decode|extraction failed|request failed/i.test(entry)).length;
  const failed = extracted.length - succeeded;
  return [
    `User uploaded files/photos. Extraction summary: ${succeeded} succeeded, ${failed} failed. Use the extracted context in your answer now.`,
    ...extracted.map((entry, index) => `${index + 1}. ${entry}`),
  ].join("\n\n");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, attachments, beReal, emotionalMode, logicalMode, thinkDeeply, forcePlan, forceBenefits, forceVent, ventAdviceMode, userId, userPlan, totalMessageCount, memoryLimit, userLocation } = await req.json();
    const plan = userPlan ?? "free";
    const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const ENABLE_GEMINI_FALLBACK = Deno.env.get("ENABLE_GEMINI_FALLBACK") === "true";
    const WORKERS_API_KEY = Deno.env.get("WORKERS_API_KEY");
    const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") ?? Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const aiKey = MISTRAL_API_KEY;
    const aiUrl = "https://api.mistral.ai/v1/chat/completions";
    const aiModel = "mistral-small-latest";
    const hasAnyProvider = Boolean(aiKey || (ENABLE_GEMINI_FALLBACK && GEMINI_API_KEY) || (WORKERS_API_KEY && CF_ACCOUNT_ID));
    if (!hasAnyProvider) {
      throw new Error("Missing AI provider keys. Set MISTRAL_API_KEY or WORKERS_API_KEY + CF_ACCOUNT_ID (or enable Gemini fallback with ENABLE_GEMINI_FALLBACK=true).");
    }

    const lastUserMessage = latestUserContent(messages ?? []);
    const emailRequested = isEmailRequest(lastUserMessage);
    const scheduleRequested = isScheduleRequest(lastUserMessage) || isScheduleConversation(messages ?? []);
    const planningRequested = !scheduleRequested && !forceBenefits && (forcePlan || emailRequested || isPlanningRequest(lastUserMessage));
    const admin =
      SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        : null;

    if (admin && userId) {
      const { data: enforcement } = await admin
        .from("user_safety_enforcement")
        .select("strike_count, restricted_until")
        .eq("user_id", userId)
        .maybeSingle();

      const restrictedUntil = enforcement?.restricted_until ? new Date(enforcement.restricted_until) : null;
      const now = new Date();

      if (restrictedUntil && restrictedUntil.getTime() > now.getTime()) {
        return buildImmediateSseResponse(
          "Your account is temporarily restricted due to violent or abusive threat language that could endanger others. Please wait 24 hours before sending new messages. If this was a mistake, contact support.",
        );
      }

      const violation = detectSafetyViolation(lastUserMessage);
      if (violation) {
        const nextStrike = Number(enforcement?.strike_count ?? 0) + 1;
        const restrictNow = nextStrike >= 3;
        const nextRestrictedUntil = restrictNow ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;

        await admin.from("user_safety_enforcement").upsert({
          user_id: userId,
          strike_count: nextStrike,
          restricted_until: nextRestrictedUntil,
          last_violation_at: now.toISOString(),
          updated_at: now.toISOString(),
        });

        await admin.from("user_safety_events").insert({
          user_id: userId,
          category: violation.category,
          severity: violation.severity,
          action: restrictNow ? "temporary_lock_24h" : "strike",
          message_excerpt: String(lastUserMessage ?? "").slice(0, 500),
        });

        if (restrictNow) {
          return buildImmediateSseResponse(
            "Safety lock activated: this is strike 3 for violent/abusive threat language that could lead to real harm. Your chat access is paused for 24 hours.",
          );
        }

        if (nextStrike === 2) {
          return buildImmediateSseResponse(
            "Final warning: strike 2 recorded for violent/abusive threat language toward others. One more strike triggers a 24-hour chat lock.",
          );
        }

        return buildImmediateSseResponse(
          "Warning: strike 1 recorded. Violent or abusive threat language toward others is not allowed. Continue safely or your account may be restricted.",
        );
      }
    }

    // Server-side quota enforcement — reads the real plan from DB and
    // records usage atomically so limits hold even if the frontend is bypassed.
    if (admin && userId) {
      const { data: subRow } = await admin
        .from("user_subscriptions")
        .select("plan")
        .eq("user_id", userId)
        .maybeSingle();

      const rawPlan = String(subRow?.plan || "free");
      const verifiedPlan: "free" | "pro" | "platinum" | "student" | "professional" =
        rawPlan === "pro" ||
        rawPlan === "platinum" ||
        rawPlan === "student" ||
        rawPlan === "professional"
          ? rawPlan
          : "free";

      const serverPlanLimits: Record<"free" | "pro" | "platinum" | "student" | "professional", { deep_thinking: number | null; plan: number | null }> = {
        free:         { deep_thinking: 5,    plan: 3  },
        pro:          { deep_thinking: 50,   plan: 15 },
        platinum:     { deep_thinking: null, plan: 50 },
        student:      { deep_thinking: null, plan: null },
        professional: { deep_thinking: null, plan: null },
      };
      const limits = serverPlanLimits[verifiedPlan];

      const now = new Date();
      const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const yearMonthDay = `${yearMonth}-${String(now.getUTCDate()).padStart(2, "0")}`;

      // --- deep_thinking (daily) ---
      if (thinkDeeply && limits.deep_thinking !== null) {
        const { data: dtRow } = await admin
          .from("user_feature_usage")
          .select("id, used_count")
          .eq("user_id", userId)
          .eq("feature", "deep_thinking")
          .eq("period_type", "day")
          .eq("period_key", yearMonthDay)
          .maybeSingle();

        const dtUsed = Number(dtRow?.used_count ?? 0);
        if (dtUsed >= limits.deep_thinking) {
          return buildImmediateSseResponse(
            `You've reached your daily Deep Thinking limit (${limits.deep_thinking}/day on the ${verifiedPlan} plan). Your limit resets tomorrow.`
          );
        }

        if (dtRow) {
          await admin.from("user_feature_usage").update({ used_count: dtUsed + 1 }).eq("id", dtRow.id);
        } else {
          await admin.from("user_feature_usage").insert({
            user_id: userId, feature: "deep_thinking", period_type: "day", period_key: yearMonthDay, used_count: 1,
          });
        }
      }

      // --- plan mode (monthly) ---
      if ((forcePlan || planningRequested) && limits.plan !== null) {
        const { data: planRow } = await admin
          .from("user_feature_usage")
          .select("id, used_count")
          .eq("user_id", userId)
          .eq("feature", "plan")
          .eq("period_type", "month")
          .eq("period_key", yearMonth)
          .maybeSingle();

        const planUsed = Number(planRow?.used_count ?? 0);
        if (planUsed >= limits.plan) {
          return buildImmediateSseResponse(
            `You've reached your monthly Plan Mode limit (${limits.plan}/month on the ${verifiedPlan} plan). Upgrade or wait until next month to unlock more.`
          );
        }

        if (planRow) {
          await admin.from("user_feature_usage").update({ used_count: planUsed + 1 }).eq("id", planRow.id);
        } else {
          await admin.from("user_feature_usage").insert({
            user_id: userId, feature: "plan", period_type: "month", period_key: yearMonth, used_count: 1,
          });
        }
      }
    }

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

    const memoryInstruction = buildMemoryInstruction(memoryProfile, messages ?? []);
    const referencesRequested = isReferencesRequest(lastUserMessage);
    const platformHelpRequested =
      isPlatformHelpRequest(lastUserMessage) ||
      isPlatformHelpConversation(messages ?? []);
    const cvHelpRequested =
      isCvHelpRequest(lastUserMessage) ||
      isCvHelpConversation(messages ?? []);
    const internetSearchRequested =
      !platformHelpRequested &&
      (
        isInternetSearchRequest(lastUserMessage) ||
        isInternetSearchConversation(messages ?? []) ||
        isQueryRequiresWebSearch(lastUserMessage)
      );
    const deepThinkingRequested = thinkDeeply || emailRequested;
    const ventMode = Boolean(forceVent) || isVentingRequest(lastUserMessage);
  const benefitsRequested = Boolean(forceBenefits) || isBenefitsSupportRequest(lastUserMessage);
  const emotionalRequested = !emailRequested && (ventMode || isEmotionalRequest(lastUserMessage));
  const practicalRequested = !scheduleRequested && (benefitsRequested || planningRequested || emailRequested || isPracticalLogicRequest(lastUserMessage));
    const logicalExecutionRequested = !scheduleRequested && isLogicalExecutionRequest(lastUserMessage);
    const businessMarketingRequested = isBusinessMarketingRequest(lastUserMessage);
  const adviceRequested =
    !scheduleRequested &&
    (isAdviceRequest(lastUserMessage) || practicalRequested || logicalExecutionRequested || businessMarketingRequested || (ventMode && ventAdviceMode === "advice"));
  const thinkingTime = getThinkingTime(lastUserMessage, deepThinkingRequested);
    const ventReadTime = getVentReadTime(lastUserMessage, ventMode);
    const internetSearchReadTime = getInternetSearchReadTime(lastUserMessage, internetSearchRequested);
    const totalReadTime = Math.max(thinkingTime, ventReadTime, internetSearchReadTime);
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
      (scheduleRequested ? SCHEDULE_ASSIST_MODE : "") +
      ((practicalRequested || logicalExecutionRequested || logicalMode) && !emotionalRequested && !emotionalMode ? PRACTICAL_LOGIC_MODE : "") +
      ((adviceRequested || logicalMode) && !emotionalMode ? ADVICE_FIRST_MODE : "") +
      ((adviceRequested || logicalMode) && !emotionalMode ? OPTION_SET_MODE : "") +
      (businessMarketingRequested && !emotionalRequested ? BUSINESS_MARKETING_CONNOISSEUR_MODE : "") +
      (benefitsRequested && !emotionalRequested ? BENEFITS_HELPER_MODE : "") +
      (logicalExecutionRequested && !emotionalRequested ? `\n\nExecution-focused response: Options first, no questions. Provide 2-4 actionable options with pros/cons immediately. Then recommend one and give a clear starter plan. Ask at most one optional follow-up question. Include sources when available.` : "") +
      (emotionalMode || (emotionalRequested && !beReal) ? EMOTIONAL_SUPPORT_MODE : "") +
      (ventMode && !beReal ? VENT_MODE_BASE : "") +
      (beReal && ventMode ? `\n\nVent mode + Be Real: Listen and validate briefly, but prioritize honest feedback over endless sympathy. Be empathetic but not coddling.` : ventAdviceInstruction) +
      (referencesRequested ? REFERENCES_REQUEST_MODE : "") +
      (internetSearchRequested ? INTERNET_SEARCH_MODE : "") +
      (platformHelpRequested ? PLATFORM_HELP_MODE : "") +
      (cvHelpRequested ? CV_NUDGE_MODE : "") +
      (memoryInstruction ? `\n\nUser memory context:\n${memoryInstruction}` : "");

    // Add memory limit warning if user is approaching limit
    const memoryWarningInstruction = (() => {
      if (!memoryLimit || !totalMessageCount) return "";
      const warningThreshold = Math.floor(memoryLimit * 0.85);
      if (totalMessageCount >= warningThreshold) {
        const percentUsed = Math.round((totalMessageCount / memoryLimit) * 100);
        return `\n\nMemory Usage Alert (${percentUsed}% of ${memoryLimit} messages): The user is approaching their conversation memory limit. If they want unlimited conversation memory, recommend upgrading to Platinum tier. Do NOT let this affect your response quality—continue giving full, thoughtful answers. Just mention the memory usage naturally if it's relevant.`;
      }
      return "";
    })();

    const shouldUseResearch =
      !platformHelpRequested &&
      !emotionalMode &&
      !emotionalRequested &&
      (
        internetSearchRequested ||
        referencesRequested ||
        benefitsRequested ||
        (adviceRequested && !(ventMode && ventAdviceMode === "none")) ||
        ((deepThinkingRequested || practicalRequested || logicalExecutionRequested || benefitsRequested) && !emotionalRequested)
      );
    const researchQuery = shouldUseResearch
      ? (internetSearchRequested ? resolveInternetSearchQuery(messages ?? [], lastUserMessage) : buildSearchQuery(lastUserMessage))
      : "";
    const researchContext = shouldUseResearch
      ? await getResearchContext(researchQuery, referencesRequested)
      : "";
    const adviceContext = await buildAdviceContext(admin, lastUserMessage, {
      benefitsRequested,
      adviceRequested,
      practicalRequested,
      logicalExecutionRequested,
      emotionalRequested,
      emotionalMode,
    });
    const attachmentContext = await buildAttachmentContext(attachments, MISTRAL_API_KEY);
    const locationInstruction = buildLocationInstruction(userLocation);

    const systemMessages = [
      {
        role: "system",
        content:
          system + REFERENCES_GUARDRAIL_MODE + (planningRequested ? DETAILED_PLAN_OUTPUT_MODE : "") + (deepThinkingRequested ? DEEP_THINKING_DETAILED_MODE : "") + memoryWarningInstruction,
      },
      {
        role: "system",
        content: PLATFORM_KNOWLEDGE_CONTEXT,
      },
    ];
    if (researchContext) {
      systemMessages.push({ role: "system", content: researchContext });
    }
    if (adviceContext) {
      systemMessages.push({ role: "system", content: adviceContext });
    }
    if (attachmentContext) {
      systemMessages.push({ role: "system", content: ATTACHMENT_ANALYSIS_MODE });
      systemMessages.push({ role: "system", content: attachmentContext });
    }
    if (locationInstruction) {
      systemMessages.push({ role: "system", content: locationInstruction });
    }

    // Create a writable stream encoder for custom event streaming
    const encoder = new TextEncoder();
    
    const customStream = new ReadableStream({
      async start(controller) {
        const sendSse = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        // Stream reading/thinking phase if enabled
        if (totalReadTime > 0 && !emotionalMode) {
          const startEvent = {
            event: "thinking_start",
            label: internetSearchRequested
              ? "Deeply searching the internet..."
              : (ventMode ? "Reading carefully..." : "🤔 Thinking..."),
          };
          sendSse(startEvent);
          
          await new Promise((resolve) => setTimeout(resolve, totalReadTime));
          
          sendSse({ event: "thinking_end" });
        } else if (totalReadTime > 0 && emotionalMode) {
          await new Promise((resolve) => setTimeout(resolve, totalReadTime));
        }
        
        // Provider chain: Mistral (primary) -> (optional Gemini fallback) -> Cloudflare Workers AI
        const aiAbort = new AbortController();
        const aiTimeout = setTimeout(() => aiAbort.abort(), 25000);
        try {
          if (!aiKey) throw new Error("MISTRAL_API_KEY not set, skipping to fallback");
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

          if (ENABLE_GEMINI_FALLBACK) {
            const geminiText = await runGeminiFallback(GEMINI_API_KEY, systemText, messages ?? []);
            if (geminiText) {
              sendSse({ choices: [{ delta: { content: geminiText } }] });
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              return;
            }
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
