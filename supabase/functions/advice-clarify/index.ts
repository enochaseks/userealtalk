// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLARIFY_LIMITS: Record<"free" | "pro" | "platinum" | "student" | "professional", number | null> = {
  free: 10,
  pro: 50,
  platinum: null,
  student: null,
  professional: null,
};

const toJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return toJsonResponse({ error: "Server misconfiguration" }, 500);
  }
  if (!MISTRAL_API_KEY) {
    return toJsonResponse({ error: "AI service not configured" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Optional auth — guests get unlimited (no quota); logged-in users are quota-checked
  const authHeader = req.headers.get("Authorization");
  let userId: string | null = null;
  let verifiedPlan: "free" | "pro" | "platinum" | "student" | "professional" = "free";

  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: { user } } = await admin.auth.getUser(token);
    if (user) {
      userId = user.id;
      const { data: subRow } = await admin
        .from("user_subscriptions")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();
      const raw = String(subRow?.plan ?? "free");
      if (raw === "pro" || raw === "platinum" || raw === "student" || raw === "professional") {
        verifiedPlan = raw;
      }
    }
  }

  // Quota check for authenticated users
  if (userId) {
    const limit = CLARIFY_LIMITS[verifiedPlan];
    if (limit !== null) {
      const now = new Date();
      const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

      const { data: usageRow } = await admin
        .from("user_feature_usage")
        .select("id, used_count")
        .eq("user_id", userId)
        .eq("feature", "advice_clarify")
        .eq("period_type", "month")
        .eq("period_key", periodKey)
        .maybeSingle();

      const used = Number(usageRow?.used_count ?? 0);
      if (used >= limit) {
        return toJsonResponse(
          { error: `You've used all ${limit} AI clarifications this month on the ${verifiedPlan} plan. Upgrade or come back next month.` },
          429,
        );
      }

      if (usageRow) {
        await admin.from("user_feature_usage").update({ used_count: used + 1 }).eq("id", usageRow.id);
      } else {
        await admin.from("user_feature_usage").insert({
          user_id: userId,
          feature: "advice_clarify",
          period_type: "month",
          period_key: periodKey,
          used_count: 1,
        });
      }
    }
  }

  const body = await req.json().catch(() => ({}));
  const postId = String(body?.postId ?? "").trim();
  if (!postId) return toJsonResponse({ error: "postId is required" }, 400);

  const { data: post, error: postErr } = await admin
    .from("advice_posts")
    .select("id, title, body, category, tags")
    .eq("id", postId)
    .eq("status", "approved")
    .maybeSingle();

  if (postErr) return toJsonResponse({ error: "Database error" }, 500);
  if (!post) return toJsonResponse({ error: "Post not found or not approved" }, 404);

  const title = String(post.title ?? "");
  const postBody = String(post.body ?? "");
  const category = String(post.category ?? "general");
  const tags = Array.isArray(post.tags) ? post.tags.join(", ") : "";

  const systemPrompt = `You are a thoughtful assistant helping someone understand a piece of community advice. 
Your job is to clarify, expand, and add practical context to the advice provided — without lecturing or padding.

Guidelines:
- Explain *why* the advice works or when it applies.
- Add 1-2 concrete examples or scenarios where it would help.
- If there are any important caveats or situations where it might not apply, briefly note them.
- Be warm and practical. Write in plain, clear prose — no bullet walls or headings.
- Keep it focused: 3-5 short paragraphs max. Quality over quantity.
- Do not repeat the title back verbatim as the first sentence.`;

  const userPrompt = `Here is a piece of community advice from the "${category}" category:

Title: ${title}
${tags ? `Tags: ${tags}\n` : ""}
Advice:
${postBody}

Please clarify and expand on this advice to help me understand it better and apply it to my life.`;

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 20000);

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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 600,
        temperature: 0.6,
      }),
      signal: ac.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("Mistral error", resp.status, errText);
      return toJsonResponse({ error: "AI service error. Please try again." }, 502);
    }

    const json = await resp.json().catch(() => null);
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    if (!text) return toJsonResponse({ error: "Empty AI response. Please try again." }, 502);

    return toJsonResponse({ text });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      return toJsonResponse({ error: "AI took too long to respond. Please try again." }, 504);
    }
    console.error("advice-clarify error", err);
    return toJsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
