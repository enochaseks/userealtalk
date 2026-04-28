// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── System prompts ────────────────────────────────────────────────────────────

const JOB_MATCH_SYSTEM = `You are an ATS (Applicant Tracking System) specialist and CV expert.
Analyse how well the provided CV matches the job description.
Respond with raw JSON only — no markdown, no prose outside the JSON.
Schema:
{
  "atsScore": 7.2,
  "summary": "One paragraph summary of fit.",
  "matchedKeywords": ["keyword1", "keyword2"],
  "missingKeywords": ["keyword3", "keyword4"],
  "suggestions": ["Specific actionable suggestion 1", "Suggestion 2"]
}
Rules:
- atsScore: 0–10 reflecting how well the CV matches the job description
- matchedKeywords: skills/terms present in both CV and JD
- missingKeywords: important skills/terms in JD that are absent from the CV
- suggestions: up to 6 specific, actionable improvements to better match this role
- Do not invent content. Only reference what is actually in the CV and JD.`;

const COVER_LETTER_SYSTEM = `You are an expert career coach and professional writer.
Write a tailored cover letter based on the candidate's CV and the job description provided.
Respond with raw JSON only — no markdown, no prose outside the JSON.
Schema:
{
  "coverLetter": "Full cover letter text here, using \\n for line breaks."
}
Rules:
- Address it generically (Dear Hiring Manager) unless a name is in the JD
- 3-4 paragraphs: opening hook, relevant experience match, why this company, call to action
- Use the candidate's actual experience from the CV — never invent
- Professional but natural tone, not stiff or generic
- Do not include subject line or address headers — body only`;

const REWRITE_SYSTEM = `You are an expert CV editor.
Rewrite the provided CV section to be more impactful, concise, and achievement-focused.
Respond with raw JSON only — no markdown, no prose outside the JSON.
Schema:
{
  "rewritten": "The improved section text, preserving line breaks with \\n."
}
Rules:
- Use strong action verbs
- Add measurable outcomes where the original hints at them
- Remove weak, vague, or filler language
- Keep factual accuracy — do not invent metrics or roles
- Match the style and length of the original unless brevity helps`;

const TRANSFERABLE_SYSTEM = `You are a career coach specialising in helping students and career changers identify their transferable skills.
Analyse the CV and extract transferable skills, especially from non-traditional experience (part-time jobs, volunteering, projects, hobbies, sports, clubs).
Respond with raw JSON only — no markdown, no prose outside the JSON.
Schema:
{
  "skills": [
    { "skill": "Skill name", "evidence": "Specific example from the CV", "relevance": "Why this matters to employers" }
  ],
  "summary": "Short paragraph coaching the candidate on how to present these skills."
}
Rules:
- Focus on skills that appear in non-obvious places (retail, hospitality, sport, volunteering)
- Up to 8 skills
- Be specific — reference actual roles, projects, or activities from the CV
- Relevance should connect to real workplace needs`;

const PERSONAL_STATEMENT_SYSTEM = `You are an expert in writing personal statements for university applications (UCAS) and graduate scheme applications.
Write a compelling personal statement based on the candidate's CV and their stated goal.
Respond with raw JSON only — no markdown, no prose outside the JSON.
Schema:
{
  "personalStatement": "Full personal statement text, using \\n for paragraph breaks."
}
Rules:
- Open with a hook — not "I have always been passionate about..."
- Draw on specific experiences, projects, and achievements from the CV
- 3-4 paragraphs, roughly 500-600 words
- End with a forward-looking closing sentence
- Genuine, specific, and grounded in the CV — no invented content`;

// ─── AI call helper ────────────────────────────────────────────────────────────

const buildWorkersPrompt = (systemText: string, userPrompt: string): string =>
  `${systemText}\n\nUSER: ${userPrompt}\n\nASSISTANT:`.trim();

const callAi = async (systemText: string, userPrompt: string): Promise<string | null> => {
  const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const WORKERS_API_KEY = Deno.env.get("WORKERS_API_KEY");
  const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") ?? Deno.env.get("CLOUDFLARE_ACCOUNT_ID");

  if (MISTRAL_API_KEY) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    try {
      const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "mistral-small-latest",
          stream: false,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemText },
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
    } catch { /* fall through */ } finally { clearTimeout(t); }
  }

  if (GEMINI_API_KEY) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemText }] },
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
    } catch { /* fall through */ } finally { clearTimeout(t); }
  }

  if (WORKERS_API_KEY && CF_ACCOUNT_ID) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 30000);
    try {
      const resp = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CF_ACCOUNT_ID)}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${WORKERS_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: buildWorkersPrompt(systemText, userPrompt), max_tokens: 1500 }),
          signal: ac.signal,
        },
      );
      if (resp.ok) {
        const json = await resp.json().catch(() => ({}));
        const text = String(json?.result?.response ?? "").trim();
        if (text) return text;
      }
    } catch { /* no more fallback */ } finally { clearTimeout(t); }
  }

  return null;
};

// ─── JSON parse helper ─────────────────────────────────────────────────────────

const safeParseJson = (raw: string): unknown | null => {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* try extraction */ }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(cleaned.slice(first, last + 1)); } catch { /* fail */ }
  }
  return null;
};

// ─── Request handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { tool, cvText, jobDescription, sectionName, sectionText, targetGoal } = body;

    if (!tool) return respond({ error: "tool is required" }, 400);

    const cv = typeof cvText === "string" ? cvText.trim().slice(0, 12000) : "";

    // ── 1. Job description matcher ──────────────────────────────────────────────
    if (tool === "job-match") {
      const jd = typeof jobDescription === "string" ? jobDescription.trim().slice(0, 8000) : "";
      if (cv.length < 100) return respond({ error: "CV text is too short." }, 400);
      if (jd.length < 50) return respond({ error: "Job description is too short." }, 400);

      const userPrompt = `CV:\n${cv}\n\nJob Description:\n${jd}`;
      const raw = await callAi(JOB_MATCH_SYSTEM, userPrompt);
      if (!raw) return respond({ error: "AI unavailable. Try again." }, 503);
      const parsed = safeParseJson(raw);
      if (!parsed) return respond({ error: "Could not parse AI response.", raw }, 422);
      return respond({ result: parsed });
    }

    // ── 2. Cover letter generator ────────────────────────────────────────────────
    if (tool === "cover-letter") {
      const jd = typeof jobDescription === "string" ? jobDescription.trim().slice(0, 8000) : "";
      if (cv.length < 100) return respond({ error: "CV text is too short." }, 400);
      if (jd.length < 50) return respond({ error: "Job description is too short." }, 400);

      const userPrompt = `CV:\n${cv}\n\nJob Description:\n${jd}`;
      const raw = await callAi(COVER_LETTER_SYSTEM, userPrompt);
      if (!raw) return respond({ error: "AI unavailable. Try again." }, 503);
      const parsed = safeParseJson(raw);
      if (!parsed) return respond({ error: "Could not parse AI response.", raw }, 422);
      return respond({ result: parsed });
    }

    // ── 3. CV section rewrite ────────────────────────────────────────────────────
    if (tool === "cv-rewrite") {
      const section = typeof sectionName === "string" ? sectionName.trim() : "Section";
      const text = typeof sectionText === "string" ? sectionText.trim().slice(0, 4000) : "";
      if (text.length < 30) return respond({ error: "Section text is too short to rewrite." }, 400);

      const userPrompt = `Section: ${section}\n\nOriginal text:\n${text}`;
      const raw = await callAi(REWRITE_SYSTEM, userPrompt);
      if (!raw) return respond({ error: "AI unavailable. Try again." }, 503);
      const parsed = safeParseJson(raw);
      if (!parsed) return respond({ error: "Could not parse AI response.", raw }, 422);
      return respond({ result: parsed });
    }

    // ── 4. Transferable skills extractor ────────────────────────────────────────
    if (tool === "transferable-skills") {
      if (cv.length < 100) return respond({ error: "CV text is too short." }, 400);

      const userPrompt = `CV:\n${cv}`;
      const raw = await callAi(TRANSFERABLE_SYSTEM, userPrompt);
      if (!raw) return respond({ error: "AI unavailable. Try again." }, 503);
      const parsed = safeParseJson(raw);
      if (!parsed) return respond({ error: "Could not parse AI response.", raw }, 422);
      return respond({ result: parsed });
    }

    // ── 5. Personal statement helper ─────────────────────────────────────────────
    if (tool === "personal-statement") {
      if (cv.length < 100) return respond({ error: "CV text is too short." }, 400);
      const goal = typeof targetGoal === "string" ? targetGoal.trim() : "";

      const userPrompt = [
        goal ? `Application goal: ${goal}` : "Application goal: Not specified",
        "",
        `CV:\n${cv}`,
      ].join("\n");
      const raw = await callAi(PERSONAL_STATEMENT_SYSTEM, userPrompt);
      if (!raw) return respond({ error: "AI unavailable. Try again." }, 503);
      const parsed = safeParseJson(raw);
      if (!parsed) return respond({ error: "Could not parse AI response.", raw }, 422);
      return respond({ result: parsed });
    }

    // ── 6. Server-side PDF text extraction via Mistral OCR ─────────────────────
    if (tool === "extract-text") {
      const pdfBase64 = typeof body.pdfBase64 === "string" ? body.pdfBase64 : null;
      if (!pdfBase64) return respond({ error: "pdfBase64 is required" }, 400);

      const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
      if (!MISTRAL_API_KEY) return respond({ error: "PDF extraction not configured." }, 503);

      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 55000);
        const resp = await fetch("https://api.mistral.ai/v1/ocr", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "mistral-ocr-latest",
            document: {
              type: "document_url",
              document_url: `data:application/pdf;base64,${pdfBase64}`,
            },
          }),
          signal: ac.signal,
        });
        clearTimeout(t);

        const rawBody = await resp.text();
        if (!resp.ok) {
          console.error(`[cv-tools] Mistral OCR HTTP ${resp.status}:`, rawBody.slice(0, 600));
          return respond({ error: `PDF extraction failed (${resp.status}): ${rawBody.slice(0, 300)}` }, 502);
        }

        const json = JSON.parse(rawBody);
        const text = Array.isArray(json?.pages)
          ? json.pages.map((p: any) => String(p?.markdown ?? p?.text ?? "")).join("\n\n").trim()
          : "";

        if (text.length < 50) {
          return respond({ error: "Could not extract enough text from the PDF. Please paste your CV as text instead." }, 422);
        }

        return respond({ text });
      } catch (e: any) {
        const msg = e?.name === "AbortError"
          ? "PDF extraction timed out. Please paste your CV as text instead."
          : "PDF extraction error: " + (e?.message ?? "unknown");
        return respond({ error: msg }, 422);
      }
    }

    return respond({ error: `Unknown tool: ${tool}` }, 400);
  } catch (err: any) {
    return respond({ error: err?.message ?? "Unexpected error" }, 500);
  }
});
