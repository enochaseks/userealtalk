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
    if (adminEmails.size === 0) {
      return new Response(JSON.stringify({ error: "No admins configured." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized", debug: "Missing Authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: authData, error: authErr } = await admin.auth.getUser(token);

    if (authErr || !authData?.user?.email) {
      return new Response(JSON.stringify({
        error: "Unauthorized",
        debug: `Token validation failed: ${authErr?.message ?? "unknown"}`,
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requesterEmail = String(authData.user.email).toLowerCase();
    if (!adminEmails.has(requesterEmail)) {
      return new Response(JSON.stringify({
        error: "Forbidden",
        debug: `Email ${requesterEmail} is not in the admin list.`,
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list_pending");

    // ── List pending posts ──────────────────────────────────────────────────
    if (action === "list_pending") {
      const { data, error } = await admin
        .from("advice_posts")
        .select("id, title, body, category, tags, status, moderation_notes, report_count, helpful_count, created_at, author_user_id, is_anonymous")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      return new Response(JSON.stringify({ posts: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ reports: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
