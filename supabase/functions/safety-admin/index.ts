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
      return new Response(JSON.stringify({ error: "No safety admins configured." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: authData, error: authErr } = await admin.auth.getUser(token);

    if (authErr || !authData?.user?.email) {
      console.error("Auth error:", authErr);
      console.error("Auth data:", authData);
      return new Response(JSON.stringify({ 
        error: "Unauthorized",
        debug: `Token validation failed. Error: ${authErr?.message || "unknown"}`,
      }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requesterEmail = String(authData.user.email).toLowerCase();
    console.log("Requester email:", requesterEmail);
    console.log("Allowed emails:", Array.from(adminEmails));
    
    if (!adminEmails.has(requesterEmail)) {
      return new Response(JSON.stringify({ 
        error: "Forbidden",
        debug: `Email ${requesterEmail} not in admin list. Allowed: ${Array.from(adminEmails).join(", ")}`,
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list");

    if (action === "list") {
      const limitRaw = Number(body?.limit ?? 100);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100;

      const [{ data: enforcementRows, error: enforcementErr }, { data: eventRows, error: eventErr }] = await Promise.all([
        admin
          .from("user_safety_enforcement")
          .select("user_id, strike_count, restricted_until, last_violation_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(limit),
        admin
          .from("user_safety_events")
          .select("id, user_id, category, severity, action, message_excerpt, created_at")
          .order("created_at", { ascending: false })
          .limit(limit * 4),
      ]);

      if (enforcementErr) throw enforcementErr;
      if (eventErr) throw eventErr;

      const eventsByUser = new Map<string, any[]>();
      for (const ev of eventRows ?? []) {
        const key = String(ev.user_id);
        const existing = eventsByUser.get(key) ?? [];
        if (existing.length < 5) {
          existing.push(ev);
          eventsByUser.set(key, existing);
        }
      }

      const rows = (enforcementRows ?? []).map((row: any) => ({
        ...row,
        recent_events: eventsByUser.get(String(row.user_id)) ?? [],
      }));

      return new Response(JSON.stringify({ rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "unlock") {
      const userId = String(body?.userId ?? "").trim();
      if (!userId) throw new Error("userId is required");

      const { error } = await admin
        .from("user_safety_enforcement")
        .update({ restricted_until: null, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reset_strikes") {
      const userId = String(body?.userId ?? "").trim();
      if (!userId) throw new Error("userId is required");

      const { error } = await admin
        .from("user_safety_enforcement")
        .update({
          strike_count: 0,
          restricted_until: null,
          last_violation_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (error) throw error;

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
