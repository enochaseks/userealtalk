// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toAdminEmailSet = (value: string | undefined): Set<string> => {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
};

const toJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJsonObjectFromText = (text: string): any | null => {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const heuristicModeration = (post: { title: string; body: string; tags: string[] }) => {
  const text = `${post.title} ${post.body}`.toLowerCase();
  const flags = {
    profanity: false,
    offensive: false,
    misinformation: false,
    unsafe: false,
    low_quality: false,
    spam: false,
  };
  const reasons: string[] = [];

  const profanityTerms = ["fuck", "shit", "bitch", "asshole", "wtf"];
  const offensiveTerms = ["nigger", "faggot", "kike", "retard", "tranny"];
  const unsafeTerms = ["kill yourself", "suicide method", "harm yourself", "overdose", "poison", "attack"];
  const spamTerms = ["buy now", "click here", "free money", "guaranteed cure", "crypto giveaway"];

  if (profanityTerms.some((w) => text.includes(w))) {
    flags.profanity = true;
    reasons.push("Contains profanity.");
  }
  if (offensiveTerms.some((w) => text.includes(w))) {
    flags.offensive = true;
    reasons.push("Contains offensive/hate language.");
  }
  if (unsafeTerms.some((w) => text.includes(w))) {
    flags.unsafe = true;
    reasons.push("Contains unsafe or harmful guidance.");
  }
  if (spamTerms.some((w) => text.includes(w))) {
    flags.spam = true;
    reasons.push("Looks promotional or spam-like.");
  }

  const compactText = text.replace(/\s+/g, " ").trim();
  if (compactText.length < 120 || post.body.split(/\s+/).length < 35) {
    flags.low_quality = true;
    reasons.push("Advice is too short or lacks practical detail.");
  }

  if (/\b(always|never|100%|guaranteed)\b/.test(text) && /\b(cure|fix|heal|proof)\b/.test(text)) {
    flags.misinformation = true;
    reasons.push("Contains absolute claims that may be misleading.");
  }

  let decision: "approve" | "reject" | "review" = "approve";
  let confidence = 0.65;

  if (flags.offensive || flags.unsafe) {
    decision = "reject";
    confidence = 0.9;
  } else if (flags.profanity || flags.misinformation || flags.spam || flags.low_quality) {
    decision = "review";
    confidence = 0.72;
  }

  return {
    decision,
    confidence,
    reasons,
    flags,
    summary:
      decision === "approve"
        ? "Looks safe and useful."
        : decision === "reject"
          ? "Rejected due to harmful/offensive content risk."
          : "Needs manual moderation review.",
    source: "heuristic",
  };
};

const moderateWithAi = async (post: { title: string; body: string; category: string; tags: string[] }) => {
  const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY");
  if (!MISTRAL_API_KEY) return null;

  const systemText = `You are a strict content moderator for community advice posts.
Return ONLY JSON with keys:
- decision: one of "approve", "reject", "review"
- confidence: number between 0 and 1
- reasons: string[]
- summary: short string
- flags: object with booleans: profanity, offensive, misinformation, unsafe, low_quality, spam

Rules:
- reject when clearly harmful, hateful, abusive, explicit self-harm instructions, violence instructions, or severe harassment.
- review when uncertain, potentially misleading, risky claims, heavy profanity, or weak/low-value advice.
- approve only when advice is safe, respectful, and practically useful.
Keep output compact and valid JSON only.`;

  const userPrompt = JSON.stringify(
    {
      title: post.title,
      body: post.body,
      category: post.category,
      tags: post.tags,
    },
    null,
    2,
  );

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 15000);
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
          { role: "system", content: systemText },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: ac.signal,
    });

    if (!resp.ok) return null;
    const json = await resp.json().catch(() => ({}));
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = parseJsonObjectFromText(text);
    if (!parsed) return null;

    const decision = String(parsed?.decision ?? "review").toLowerCase();
    if (!["approve", "reject", "review"].includes(decision)) return null;

    return {
      decision,
      confidence: Number(parsed?.confidence ?? 0.5),
      reasons: Array.isArray(parsed?.reasons)
        ? parsed.reasons.map((x: any) => String(x)).slice(0, 6)
        : [],
      summary: String(parsed?.summary ?? "AI moderation decision."),
      flags: {
        profanity: Boolean(parsed?.flags?.profanity),
        offensive: Boolean(parsed?.flags?.offensive),
        misinformation: Boolean(parsed?.flags?.misinformation),
        unsafe: Boolean(parsed?.flags?.unsafe),
        low_quality: Boolean(parsed?.flags?.low_quality),
        spam: Boolean(parsed?.flags?.spam),
      },
      source: "ai",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SAFETY_ADMIN_EMAILS = Deno.env.get("SAFETY_ADMIN_EMAILS");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration.");
    }

    const adminEmails = toAdminEmailSet(SAFETY_ADMIN_EMAILS);

    const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    if (!token) return toJsonResponse({ error: "Unauthorized", debug: "Missing Authorization header." }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: authData, error: authErr } = await admin.auth.getUser(token);

    if (authErr || !authData?.user?.email || !authData?.user?.id) {
      return toJsonResponse(
        {
          error: "Unauthorized",
          debug: `Token validation failed: ${authErr?.message ?? "unknown"}`,
        },
        401,
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list_pending");

    // ── AI auto moderation for submitters (does not require admin email) ───
    if (action === "auto_moderate") {
      const postId = String(body?.postId ?? "").trim();
      if (!postId) return toJsonResponse({ error: "postId is required" }, 400);

      const { data: post, error: postErr } = await admin
        .from("advice_posts")
        .select("id, author_user_id, title, body, category, tags, status")
        .eq("id", postId)
        .maybeSingle();

      if (postErr) throw postErr;
      if (!post) return toJsonResponse({ error: "Post not found" }, 404);

      const requesterId = String(authData.user.id);
      const requesterEmail = String(authData.user.email).toLowerCase();
      const isAdminRequester = adminEmails.has(requesterEmail);

      if (!isAdminRequester && String(post.author_user_id) !== requesterId) {
        return toJsonResponse({ error: "Forbidden" }, 403);
      }

      if (String(post.status) !== "pending") {
        return toJsonResponse({
          ok: true,
          decision: "review",
          status: post.status,
          message: "Post is no longer pending.",
        });
      }

      const aiResult = await moderateWithAi({
        title: String(post.title ?? ""),
        body: String(post.body ?? ""),
        category: String(post.category ?? "general"),
        tags: Array.isArray(post.tags) ? (post.tags as string[]) : [],
      });
      const result = aiResult ?? heuristicModeration({
        title: String(post.title ?? ""),
        body: String(post.body ?? ""),
        tags: Array.isArray(post.tags) ? (post.tags as string[]) : [],
      });

      const nowIso = new Date().toISOString();
      const reasonsText = result.reasons.length > 0 ? result.reasons.join(" ") : result.summary;
      let nextStatus: "approved" | "rejected" | "pending" = "pending";
      if (result.decision === "approve") nextStatus = "approved";
      if (result.decision === "reject") nextStatus = "rejected";

      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        updated_at: nowIso,
        moderation_notes: `[auto:${result.source}] ${reasonsText}`.slice(0, 800),
      };
      if (nextStatus === "approved") {
        updatePayload.published_at = nowIso;
      }

      const { error: updateErr } = await admin.from("advice_posts").update(updatePayload).eq("id", postId);
      if (updateErr) throw updateErr;

      return toJsonResponse({
        ok: true,
        decision: result.decision,
        status: nextStatus,
        confidence: result.confidence,
        source: result.source,
        flags: result.flags,
        summary: result.summary,
      });
    }

    if (adminEmails.size === 0) return toJsonResponse({ error: "No admins configured." }, 403);

    const requesterEmail = String(authData.user.email).toLowerCase();
    if (!adminEmails.has(requesterEmail)) {
      return toJsonResponse(
        {
          error: "Forbidden",
          debug: `Email ${requesterEmail} is not in the admin list.`,
        },
        403,
      );
    }

    // ── List pending posts ──────────────────────────────────────────────────
    if (action === "list_pending") {
      const { data, error } = await admin
        .from("advice_posts")
        .select("id, title, body, category, tags, status, moderation_notes, report_count, helpful_count, created_at, author_user_id, is_anonymous")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return toJsonResponse({ posts: data ?? [] });
    }

    // ── List open reports ───────────────────────────────────────────────────
    if (action === "list_reports") {
      const { data, error } = await admin
        .from("advice_reports")
        .select(`
          id,
          reason,
          details,
          status,
          created_at,
          reporter_user_id,
          advice_post_id,
          advice_posts (
            id, title, body, category, status
          )
        `)
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return toJsonResponse({ reports: data ?? [] });
    }

    // ── Approve a post ──────────────────────────────────────────────────────
    if (action === "approve") {
      const postId = String(body?.postId ?? "").trim();
      const notes = String(body?.notes ?? "").trim();
      if (!postId) throw new Error("postId is required");

      const { error } = await admin
        .from("advice_posts")
        .update({
          status: "approved",
          moderation_notes: notes,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
      if (error) throw error;

      return toJsonResponse({ ok: true });
    }

    // ── Reject a post ───────────────────────────────────────────────────────
    if (action === "reject") {
      const postId = String(body?.postId ?? "").trim();
      const notes = String(body?.notes ?? "").trim();
      if (!postId) throw new Error("postId is required");

      const { error } = await admin
        .from("advice_posts")
        .update({
          status: "rejected",
          moderation_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
      if (error) throw error;

      return toJsonResponse({ ok: true });
    }

    // ── Remove an approved/published post ───────────────────────────────────
    if (action === "remove") {
      const postId = String(body?.postId ?? "").trim();
      const notes = String(body?.notes ?? "").trim();
      if (!postId) throw new Error("postId is required");

      const { error } = await admin
        .from("advice_posts")
        .update({
          status: "removed",
          moderation_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
      if (error) throw error;

      return toJsonResponse({ ok: true });
    }

    // ── Dismiss a report ────────────────────────────────────────────────────
    if (action === "dismiss_report") {
      const reportId = String(body?.reportId ?? "").trim();
      if (!reportId) throw new Error("reportId is required");

      const { error } = await admin
        .from("advice_reports")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", reportId);
      if (error) throw error;

      return toJsonResponse({ ok: true });
    }

    // ── Remove post from a report (mark report reviewed + post removed) ─────
    if (action === "remove_from_report") {
      const reportId = String(body?.reportId ?? "").trim();
      const postId = String(body?.postId ?? "").trim();
      const notes = String(body?.notes ?? "").trim();
      if (!reportId || !postId) throw new Error("reportId and postId are required");

      const [{ error: reportErr }, { error: postErr }] = await Promise.all([
        admin
          .from("advice_reports")
          .update({ status: "reviewed", updated_at: new Date().toISOString() })
          .eq("id", reportId),
        admin
          .from("advice_posts")
          .update({ status: "removed", moderation_notes: notes, updated_at: new Date().toISOString() })
          .eq("id", postId),
      ]);
      if (reportErr) throw reportErr;
      if (postErr) throw postErr;

      return toJsonResponse({ ok: true });
    }

    return toJsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    return toJsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
