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

const normalizeList = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
};

const buildAdminNotificationRecipients = (value: string | undefined): string[] => {
  const fixed = ["realtalklimited@gmail.com"];
  const all = [...fixed, ...normalizeList(value)];
  const excluded = new Set(["enochaseks@yahoo.co.uk"]);
  return Array.from(new Set(all)).filter((email) => !excluded.has(email));
};

const sendEmailViaResend = async (to: string | string[], subject: string, text: string): Promise<boolean> => {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) return false;

  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) return false;

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: recipients,
        subject,
        text,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("resend send failed", resp.status, errBody);
      return false;
    }

    return true;
  } catch (err) {
    console.error("resend send threw", err);
    return false;
  }
};

const getUserEmailById = async (admin: any, userId: string): Promise<string | null> => {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) return null;
    return String(data?.user?.email ?? "").trim() || null;
  } catch {
    return null;
  }
};

const postUrl = (slugOrId: string): string => `https://userealtalk.co.uk/advice/${encodeURIComponent(slugOrId)}`;

const sendAdviceStatusEmail = async (
  admin: any,
  params: {
    authorUserId: string;
    title: string;
    slugOrId: string;
    status: "approved" | "rejected" | "pending";
    reason?: string;
    source: "ai" | "admin";
  },
) => {
  const email = await getUserEmailById(admin, params.authorUserId);
  if (!email) return;

  const outcomeLabel = params.status === "approved"
    ? "approved"
    : params.status === "rejected"
      ? "rejected"
      : "submitted for review";

  const subject = `Advice update: ${outcomeLabel}`;
  const lines = [
    "Your advice post has a new moderation update.",
    "",
    `Title: ${params.title || "Untitled"}`,
    `Link: ${postUrl(params.slugOrId)}`,
    `Status: ${outcomeLabel}`,
    `Reviewed by: ${params.source === "ai" ? "AI moderation" : "Admin moderation"}`,
  ];

  const cleanReason = String(params.reason ?? "").trim();
  if (cleanReason) {
    lines.push(`Reason: ${cleanReason}`);
  }

  if (params.status === "approved") {
    lines.push("", "Your post is now live in the Advice Library.");
  }
  if (params.status === "rejected") {
    lines.push("", "You can edit your advice and submit a safer, clearer version.");
  }
  if (params.status === "pending") {
    lines.push("", "Your post is queued for manual review.");
  }

  lines.push("", "RealTalk");
  await sendEmailViaResend(email, subject, lines.join("\n"));
};

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
    const adminNotificationRecipients = buildAdminNotificationRecipients(SAFETY_ADMIN_EMAILS);

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

    if (action === "create_report") {
      const postId = String(body?.postId ?? "").trim();
      const reason = String(body?.reason ?? "Potentially unsafe or misleading").trim().slice(0, 120);
      const details = String(body?.details ?? "Flagged by user from advice library.").trim().slice(0, 1000);
      if (!postId) return toJsonResponse({ error: "postId is required" }, 400);

      const reporterUserId = String(authData.user.id);
      const reporterEmail = String(authData.user.email ?? "").trim();

      const { data: post, error: postErr } = await admin
        .from("advice_posts")
        .select("id, title, slug, status, body, category, tags, author_user_id")
        .eq("id", postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) return toJsonResponse({ error: "Post not found" }, 404);

      const postRef = String(post.slug ?? post.id);
      const publicUrl = postUrl(postRef);
      const postTitle = String(post.title ?? "Untitled");
      const processAfter = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      // Run AI moderation now on approved posts — store decision for deferred execution
      let aiDecision: string | null = null;
      let aiConfidence: number | null = null;
      let aiSummary: string | null = null;
      let aiSource: string | null = null;

      if (String(post.status) === "approved") {
        const aiResult = await moderateWithAi({
          title: String(post.title ?? ""),
          body: String(post.body ?? ""),
          category: String(post.category ?? "general"),
          tags: Array.isArray(post.tags) ? post.tags : [],
        });
        const modResult = aiResult ?? heuristicModeration({
          title: String(post.title ?? ""),
          body: String(post.body ?? ""),
          tags: Array.isArray(post.tags) ? post.tags : [],
        });
        aiDecision = modResult.decision;
        aiConfidence = modResult.confidence;
        aiSummary = modResult.summary;
        aiSource = modResult.source ?? "heuristic";
      }

      // Save report with AI result stored; execution deferred 24h
      const upsertPayload: Record<string, unknown> = {
        advice_post_id: postId,
        reporter_user_id: reporterUserId,
        reason,
        details,
        status: "open",
        process_after: processAfter,
        ...(aiDecision !== null && {
          ai_decision: aiDecision,
          ai_confidence: aiConfidence,
          ai_summary: aiSummary,
          ai_source: aiSource,
        }),
      };

      const { error: upsertErr } = await admin
        .from("advice_reports")
        .upsert(upsertPayload, { onConflict: "advice_post_id,reporter_user_id" });
      if (upsertErr) throw upsertErr;

      // Email reporter: received, will update in 24h
      if (reporterEmail) {
        await sendEmailViaResend(reporterEmail, `Report received: ${postTitle}`, [
          "Thanks for reporting this advice post.",
          "",
          `Post: ${postTitle}`,
          `Link: ${publicUrl}`,
          `Reason: ${reason}`,
          "",
          "What happens next:",
          "- Our moderation system has reviewed it and will take action within 24 hours.",
          "- You will get another email once a decision has been made.",
          "",
          "RealTalk",
        ].join("\n"));
      }

      // Email admin: new report + AI preview (they have 24h to manually override)
      if (adminNotificationRecipients.length > 0) {
        const aiPreview = aiDecision
          ? [
              "",
              `AI assessment (pending — executes in 24h):`,
              `  Decision: ${aiDecision} (confidence: ${((aiConfidence ?? 0) * 100).toFixed(0)}%)`,
              `  Summary: ${aiSummary}`,
              `  Source: ${aiSource}`,
              "",
              "You can manually approve, reject, or dismiss this report in Advice Admin before 24h to override.",
            ].join("\n")
          : "";

        await sendEmailViaResend(adminNotificationRecipients, `[Advice Report] ${postTitle}`, [
          "A new advice report was submitted.",
          "",
          `Post: ${postTitle}`,
          `Link: ${publicUrl}`,
          `Reason: ${reason}`,
          `Details: ${details || "(none)"}`,
          `Reporter: ${reporterEmail || reporterUserId}`,
          aiPreview,
          "",
          "Action: Review in Advice Admin.",
        ].join("\n"));
      }

      // Email post author: their post has been reported
      const authorUserId = String(post.author_user_id ?? "");
      if (authorUserId && authorUserId !== reporterUserId) {
        const authorEmail = await getUserEmailById(admin, authorUserId);
        if (authorEmail) {
          await sendEmailViaResend(authorEmail, `Your advice post has been reported`, [
            "One of your advice posts has been flagged for review by a community member.",
            "",
            `Post: ${postTitle}`,
            `Link: ${publicUrl}`,
            `Reason given: ${reason}`,
            "",
            "What this means:",
            "- Our moderation team will review the post within 24 hours.",
            "- No action will be taken without a review.",
            "- If the post is found to be fine, it will remain live.",
            "- If your post is removed you will receive a separate email.",
            "",
            "If you believe this report is incorrect, you don't need to do anything — we review all reports carefully.",
            "",
            "RealTalk",
          ].join("\n"));
        }
      }

      return toJsonResponse({ ok: true });
    }

    if (action === "process_pending_reports") {
      // Processes reports where the 24h review window has passed and AI decision is stored.
      // Called automatically when admin loads the advice-admin page.
      const requesterEmail = String(authData.user.email ?? "").toLowerCase();
      if (!adminEmails.has(requesterEmail)) {
        return toJsonResponse({ error: "Forbidden" }, 403);
      }

      const { data: pendingReports, error: prErr } = await admin
        .from("advice_reports")
        .select("id, advice_post_id, reporter_user_id, reason, details, ai_decision, ai_confidence, ai_summary, ai_source")
        .eq("status", "open")
        .not("ai_decision", "is", null)
        .is("ai_processed_at", null)
        .lte("process_after", new Date().toISOString())
        .limit(20);

      if (prErr) throw prErr;
      const reports = Array.isArray(pendingReports) ? pendingReports : [];

      const HIGH_CONF = 0.75;
      let processed = 0;

      for (const report of reports) {
        const rPostId = String(report.advice_post_id);
        const rReporterUserId = String(report.reporter_user_id);
        const rReason = String(report.reason ?? "");
        const rDetails = String(report.details ?? "");
        const decision = String(report.ai_decision ?? "review");
        const confidence = Number(report.ai_confidence ?? 0);
        const summary = String(report.ai_summary ?? "");
        const source = String(report.ai_source ?? "unknown");

        const { data: rPost } = await admin
          .from("advice_posts")
          .select("id, title, slug, status, author_user_id")
          .eq("id", rPostId)
          .maybeSingle();

        if (!rPost || String(rPost.status) !== "approved") {
          // Post already handled — mark as processed and skip
          await admin.from("advice_reports").update({
            ai_processed_at: new Date().toISOString(),
          }).eq("id", report.id);
          processed++;
          continue;
        }

        const rTitle = String(rPost.title ?? "Untitled");
        const rPostRef = String(rPost.slug ?? rPost.id);
        const rPublicUrl = postUrl(rPostRef);
        const rReporterEmail = await getUserEmailById(admin, rReporterUserId);

        if (decision === "reject" && confidence >= HIGH_CONF) {
          await admin.from("advice_posts").update({
            status: "removed",
            moderation_notes: `[auto-report-mod] ${summary}`,
            updated_at: new Date().toISOString(),
          }).eq("id", rPostId);

          await admin.from("advice_reports").update({
            status: "reviewed",
            ai_processed_at: new Date().toISOString(),
          }).eq("id", report.id);

          if (rReporterEmail) {
            await sendEmailViaResend(rReporterEmail, `Report resolved: ${rTitle}`, [
              "Thank you for your report.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              `Reason: ${rReason}`,
              "",
              "Our moderation system reviewed the content and took action — the post has been removed.",
              "",
              "RealTalk",
            ].join("\n"));
          }

          const authorEmail = await getUserEmailById(admin, String(rPost.author_user_id));
          if (authorEmail) {
            await sendEmailViaResend(authorEmail, `Advice update: post removed after report`, [
              "Your advice post has been removed following a community report and moderation review.",
              "",
              `Title: ${rTitle}`,
              `Reason: ${summary}`,
              "",
              "If you believe this is a mistake, please contact support.",
              "",
              "RealTalk",
            ].join("\n"));
          }

          if (adminNotificationRecipients.length > 0) {
            await sendEmailViaResend(adminNotificationRecipients, `[AI Report Mod] Auto-removed: ${rTitle}`, [
              "AI auto-removed a reported advice post after the 24h review window.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              `Report reason: ${rReason}`,
              `Details: ${rDetails || "(none)"}`,
              `Reporter: ${rReporterEmail || rReporterUserId}`,
              "",
              `AI decision: ${decision} (confidence: ${(confidence * 100).toFixed(0)}%)`,
              `AI summary: ${summary}`,
              `Source: ${source}`,
            ].join("\n"));
          }
        } else if (decision === "approve" && confidence >= HIGH_CONF) {
          await admin.from("advice_reports").update({
            status: "dismissed",
            ai_processed_at: new Date().toISOString(),
          }).eq("id", report.id);

          if (rReporterEmail) {
            await sendEmailViaResend(rReporterEmail, `Report update: dismissed — ${rTitle}`, [
              "Thank you for your report.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              `Reason: ${rReason}`,
              "",
              "After reviewing the content, our moderation system found no violation of community guidelines. The report has been dismissed.",
              "",
              "RealTalk",
            ].join("\n"));
          }

          // Notify author: their post was reviewed and cleared
          const authorEmailDismissed = await getUserEmailById(admin, String(rPost.author_user_id));
          if (authorEmailDismissed) {
            await sendEmailViaResend(authorEmailDismissed, `Your advice post has been cleared`, [
              "A recent report against one of your advice posts has been reviewed and dismissed.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              "",
              "Our moderation system found no violation of community guidelines. Your post remains live.",
              "",
              "RealTalk",
            ].join("\n"));
          }

          if (adminNotificationRecipients.length > 0) {
            await sendEmailViaResend(adminNotificationRecipients, `[AI Report Mod] Dismissed: ${rTitle}`, [
              "AI dismissed a report as unfounded after the 24h review window.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              `Report reason: ${rReason}`,
              `Reporter: ${rReporterEmail || rReporterUserId}`,
              "",
              `AI decision: approve (confidence: ${(confidence * 100).toFixed(0)}%)`,
              `AI summary: ${summary}`,
              `Source: ${source}`,
            ].join("\n"));
          }
        } else {
          // Uncertain — escalate to admin for manual review
          await admin.from("advice_reports").update({
            ai_processed_at: new Date().toISOString(),
          }).eq("id", report.id);

          if (rReporterEmail) {
            await sendEmailViaResend(rReporterEmail, `Report update: under manual review — ${rTitle}`, [
              "Thank you for your report.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              `Reason: ${rReason}`,
              "",
              "Our team is reviewing this manually and will follow up shortly.",
              "",
              "RealTalk",
            ].join("\n"));
          }

          // Notify author: their post is under manual review
          const authorEmailEscalated = await getUserEmailById(admin, String(rPost.author_user_id));
          if (authorEmailEscalated) {
            await sendEmailViaResend(authorEmailEscalated, `Your advice post is under manual review`, [
              "A community report against one of your advice posts is being reviewed manually by our team.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              "",
              "We will contact you once a decision has been made. No action has been taken yet.",
              "",
              "RealTalk",
            ].join("\n"));
          }

          if (adminNotificationRecipients.length > 0) {
            await sendEmailViaResend(adminNotificationRecipients, `[AI Escalation] Manual review needed: ${rTitle}`, [
              "AI could not reach a confident decision on this report after 24h. Manual review required.",
              "",
              `Post: ${rTitle}`,
              `Link: ${rPublicUrl}`,
              `Report reason: ${rReason}`,
              `Details: ${rDetails || "(none)"}`,
              `Reporter: ${rReporterEmail || rReporterUserId}`,
              "",
              `AI decision: ${decision} (confidence: ${(confidence * 100).toFixed(0)}%)`,
              `AI summary: ${summary}`,
              `Source: ${source}`,
              "",
              "Action: Review in Advice Admin.",
            ].join("\n"));
          }
        }

        processed++;
      }

      return toJsonResponse({ ok: true, processed });
    }

    if (action === "resubmit_post") {
      const postId = String(body?.postId ?? "").trim();
      const title = String(body?.title ?? "").trim();
      const postBody = String(body?.body ?? "").trim();
      const category = String(body?.category ?? "general").trim();
      const tagsRaw = Array.isArray(body?.tags) ? body.tags : [];
      const tags = tagsRaw.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 8);

      if (!postId) return toJsonResponse({ error: "postId is required" }, 400);
      if (title.length < 8 || title.length > 140) return toJsonResponse({ error: "Title should be 8-140 characters." }, 400);
      if (postBody.length < 30 || postBody.length > 4000) return toJsonResponse({ error: "Advice should be 30-4000 characters." }, 400);

      const { data: post, error: postErr } = await admin
        .from("advice_posts")
        .select("id, title, slug, author_user_id, status")
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

      if (!["pending", "rejected", "removed"].includes(String(post.status))) {
        return toJsonResponse({ error: "Post is not resubmittable" }, 400);
      }

      const { error: updateErr } = await admin
        .from("advice_posts")
        .update({
          title,
          body: postBody,
          category,
          tags,
          status: "pending",
          moderation_notes: "",
          published_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
      if (updateErr) throw updateErr;

      const authorEmail = await getUserEmailById(admin, String(post.author_user_id));
      if (authorEmail) {
        const userSubject = "Advice update: resubmitted for review";
        const userBody = [
          "Your advice post has been resubmitted.",
          "",
          `Title: ${title}`,
          `Link: ${postUrl(String(post.slug ?? post.id))}`,
          "Status: submitted for review",
          "",
          "We will review it again and email you when approved or rejected.",
          "",
          "RealTalk",
        ].join("\n");
        await sendEmailViaResend(authorEmail, userSubject, userBody);
      }

      if (adminNotificationRecipients.length > 0) {
        const adminSubject = `[Advice Resubmitted] ${title}`;
        const adminBody = [
          "An advice post was resubmitted for moderation.",
          "",
          `Post id: ${postId}`,
          `Title: ${title}`,
          `Category: ${category}`,
          `Tags: ${tags.join(", ") || "(none)"}`,
          `Link: ${postUrl(String(post.slug ?? post.id))}`,
          `Author user id: ${String(post.author_user_id)}`,
          `Resubmitted by: ${String(authData.user.email ?? "unknown")}`,
          "",
          "Action: Review in Advice Admin.",
        ].join("\n");
        await sendEmailViaResend(adminNotificationRecipients, adminSubject, adminBody);
      }

      return toJsonResponse({ ok: true });
    }

    // ── AI auto moderation for submitters (does not require admin email) ───
    if (action === "auto_moderate") {
      const postId = String(body?.postId ?? "").trim();
      if (!postId) return toJsonResponse({ error: "postId is required" }, 400);

      const { data: post, error: postErr } = await admin
        .from("advice_posts")
        .select("id, author_user_id, title, body, category, tags, status, slug")
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

      const userReason = result.reasons.length > 0 ? result.reasons.join(" | ") : result.summary;
      await sendAdviceStatusEmail(admin, {
        authorUserId: String(post.author_user_id),
        title: String(post.title ?? "Untitled"),
        slugOrId: String(post.slug ?? post.id),
        status: nextStatus,
        reason: userReason,
        source: "ai",
      });

      if (adminNotificationRecipients.length > 0) {
        const adminSubject = `[AI Moderation] ${nextStatus.toUpperCase()} - ${String(post.title ?? "Untitled")}`;
        const adminBody = [
          "AI moderation completed for an advice post.",
          "",
          `Post id: ${postId}`,
          `Title: ${String(post.title ?? "Untitled")}`,
          `Decision: ${result.decision}`,
          `Status: ${nextStatus}`,
          `Source: ${result.source}`,
          `Confidence: ${Number(result.confidence ?? 0).toFixed(2)}`,
          `Summary: ${result.summary}`,
          `Reasons: ${result.reasons.join(" | ") || "(none)"}`,
        ].join("\n");
        await sendEmailViaResend(adminNotificationRecipients, adminSubject, adminBody);
      }

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

      const { data: post, error: postErr } = await admin
        .from("advice_posts")
        .select("id, title, slug, author_user_id")
        .eq("id", postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) return toJsonResponse({ error: "Post not found" }, 404);

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

      await sendAdviceStatusEmail(admin, {
        authorUserId: String(post.author_user_id),
        title: String(post.title ?? "Untitled"),
        slugOrId: String(post.slug ?? post.id),
        status: "approved",
        reason: notes,
        source: "admin",
      });

      return toJsonResponse({ ok: true });
    }

    // ── Reject a post ───────────────────────────────────────────────────────
    if (action === "reject") {
      const postId = String(body?.postId ?? "").trim();
      const notes = String(body?.notes ?? "").trim();
      if (!postId) throw new Error("postId is required");

      const { data: post, error: postErr } = await admin
        .from("advice_posts")
        .select("id, title, slug, author_user_id")
        .eq("id", postId)
        .maybeSingle();
      if (postErr) throw postErr;
      if (!post) return toJsonResponse({ error: "Post not found" }, 404);

      const { error } = await admin
        .from("advice_posts")
        .update({
          status: "rejected",
          moderation_notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
      if (error) throw error;

      await sendAdviceStatusEmail(admin, {
        authorUserId: String(post.author_user_id),
        title: String(post.title ?? "Untitled"),
        slugOrId: String(post.slug ?? post.id),
        status: "rejected",
        reason: notes,
        source: "admin",
      });

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

      const { data: reportRow, error: reportFetchErr } = await admin
        .from("advice_reports")
        .select("id, reason, reporter_user_id, advice_post_id, advice_posts(id, title, slug)")
        .eq("id", reportId)
        .maybeSingle();
      if (reportFetchErr) throw reportFetchErr;
      if (!reportRow) return toJsonResponse({ error: "Report not found" }, 404);

      const { error } = await admin
        .from("advice_reports")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", reportId);
      if (error) throw error;

      const reporterEmail = await getUserEmailById(admin, String(reportRow.reporter_user_id));
      const postRef = String(reportRow?.advice_posts?.slug ?? reportRow?.advice_posts?.id ?? reportRow.advice_post_id);
      const publicUrl = postUrl(postRef);
      if (reporterEmail) {
        const subject = `Report update: dismissed`;
        const bodyText = [
          "Update on the advice report you submitted:",
          "",
          `Post: ${String(reportRow?.advice_posts?.title ?? "Untitled")}`,
          `Link: ${publicUrl}`,
          "Outcome: Dismissed",
          "",
          "Reason: After review, the post did not break our safety rules.",
          "",
          "Thanks for helping keep RealTalk safe.",
        ].join("\n");
        await sendEmailViaResend(reporterEmail, subject, bodyText);
      }

      if (adminNotificationRecipients.length > 0) {
        const subject = `[Report Resolved] Dismissed - ${String(reportRow?.advice_posts?.title ?? reportRow.advice_post_id)}`;
        const bodyText = [
          "A report was resolved as dismissed.",
          "",
          `Report id: ${reportId}`,
          `Post: ${String(reportRow?.advice_posts?.title ?? "Untitled")}`,
          `Reason: ${String(reportRow.reason ?? "")}`,
          `Resolved by: ${requesterEmail}`,
        ].join("\n");
        await sendEmailViaResend(adminNotificationRecipients, subject, bodyText);
      }

      return toJsonResponse({ ok: true });
    }

    // ── Remove post from a report (mark report reviewed + post removed) ─────
    if (action === "remove_from_report") {
      const reportId = String(body?.reportId ?? "").trim();
      const postId = String(body?.postId ?? "").trim();
      const notes = String(body?.notes ?? "").trim();
      if (!reportId || !postId) throw new Error("reportId and postId are required");

      const { data: reportRow, error: reportFetchErr } = await admin
        .from("advice_reports")
        .select("id, reason, reporter_user_id, advice_post_id, advice_posts(id, title, slug)")
        .eq("id", reportId)
        .maybeSingle();
      if (reportFetchErr) throw reportFetchErr;
      if (!reportRow) return toJsonResponse({ error: "Report not found" }, 404);

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

      const reporterEmail = await getUserEmailById(admin, String(reportRow.reporter_user_id));
      const postRef = String(reportRow?.advice_posts?.slug ?? reportRow?.advice_posts?.id ?? reportRow.advice_post_id);
      const publicUrl = postUrl(postRef);
      if (reporterEmail) {
        const subject = `Report update: action taken`;
        const bodyText = [
          "Update on the advice report you submitted:",
          "",
          `Post: ${String(reportRow?.advice_posts?.title ?? "Untitled")}`,
          `Link: ${publicUrl}`,
          "Outcome: Reviewed and removed",
          "",
          "Action: The reported advice was removed after review.",
          notes ? `Moderator note: ${notes}` : "",
          "",
          "Thanks for helping keep RealTalk safe.",
        ]
          .filter(Boolean)
          .join("\n");
        await sendEmailViaResend(reporterEmail, subject, bodyText);
      }

      if (adminNotificationRecipients.length > 0) {
        const subject = `[Report Resolved] Removed - ${String(reportRow?.advice_posts?.title ?? reportRow.advice_post_id)}`;
        const bodyText = [
          "A report was resolved with post removal.",
          "",
          `Report id: ${reportId}`,
          `Post: ${String(reportRow?.advice_posts?.title ?? "Untitled")}`,
          `Reason: ${String(reportRow.reason ?? "")}`,
          `Resolved by: ${requesterEmail}`,
          notes ? `Moderator note: ${notes}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        await sendEmailViaResend(adminNotificationRecipients, subject, bodyText);
      }

      return toJsonResponse({ ok: true });
    }

    return toJsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    const SAFETY_ADMIN_EMAILS = Deno.env.get("SAFETY_ADMIN_EMAILS");
    const adminNotificationRecipients = buildAdminNotificationRecipients(SAFETY_ADMIN_EMAILS);
    if (adminNotificationRecipients.length > 0) {
      const message = e instanceof Error ? e.message : "Unknown error";
      await sendEmailViaResend(
        adminNotificationRecipients,
        "[Advice Admin Issue] Function error",
        `advice-admin function error:\n${message}`,
      );
    }
    return toJsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
