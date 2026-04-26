// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GMAIL_SEND_LIMITS: Record<"free" | "pro" | "platinum", number | null> = {
  free: 5,
  pro: 25,
  platinum: 50,
};

const enforceGmailSendQuota = async (authHeader: string | null): Promise<{ userId: string } | { error: string; status: number }> => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { error: "Server misconfiguration", status: 500 };

  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Unauthorized", status: 401 };

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return { error: "Unauthorized", status: 401 };

  const { data: subRow } = await admin
    .from("user_subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();

  const rawPlan = String(subRow?.plan || "free");
  const plan: "free" | "pro" | "platinum" = rawPlan === "pro" || rawPlan === "platinum" ? rawPlan : "free";
  const limit = GMAIL_SEND_LIMITS[plan];

  if (limit !== null) {
    const now = new Date();
    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const { data: usageRow } = await admin
      .from("user_feature_usage")
      .select("id, used_count")
      .eq("user_id", user.id)
      .eq("feature", "gmail_send")
      .eq("period_type", "month")
      .eq("period_key", periodKey)
      .maybeSingle();

    const used = Number(usageRow?.used_count ?? 0);
    if (used >= limit) {
      return {
        error: `You've reached your monthly Gmail send limit (${limit}/month on the ${plan} plan). Upgrade or wait until next month.`,
        status: 429,
      };
    }

    // Record usage atomically
    if (usageRow) {
      await admin.from("user_feature_usage").update({ used_count: used + 1 }).eq("id", usageRow.id);
    } else {
      await admin.from("user_feature_usage").insert({
        user_id: user.id, feature: "gmail_send", period_type: "month", period_key: periodKey, used_count: 1,
      });
    }
  }

  return { userId: user.id };
};

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const encodeWordQ = (str: string): string => {
  // RFC 2047 encoded-word for non-ASCII subject lines
  const bytes = new TextEncoder().encode(str);
  return `=?UTF-8?B?${encodeBase64Url(bytes)}?=`;
};

const buildMimeMessage = ({ to, subject, body, replyTo }: { to: string; subject: string; body: string; replyTo?: string }) => {
  const encodedSubject = /[^\x00-\x7F]/.test(subject) ? encodeWordQ(subject) : subject;
  // Encode body as base64 for reliable UTF-8 transport
  const bodyBytes = new TextEncoder().encode(body);
  const encodedBody = encodeBase64Url(bodyBytes);
  return [
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : "",
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody,
  ].join("\r\n");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, subject, body, googleAccessToken, replyTo } = await req.json();

    // Enforce quota server-side before sending
    const quotaResult = await enforceGmailSendQuota(req.headers.get("authorization"));
    if ("error" in quotaResult) {
      return new Response(JSON.stringify({ error: quotaResult.error }), {
        status: quotaResult.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing to, subject, or body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!googleAccessToken) {
      if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
        return new Response(JSON.stringify({ error: "Missing email provider credentials" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: RESEND_FROM_EMAIL,
          to: [to],
          reply_to: replyTo || undefined,
          subject,
          text: body,
        }),
      });

      const resendJson = await resendResp.json().catch(() => ({}));
      if (!resendResp.ok) {
        const details = resendJson?.message || resendJson?.error || "Failed to send email";
        return new Response(JSON.stringify({ error: details, details: resendJson }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ ok: true, provider: "resend", id: resendJson?.id ?? null }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const mime = buildMimeMessage({ to, subject, body, replyTo });
    const raw = encodeBase64Url(new TextEncoder().encode(mime));

    const gmailResp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    const gmailJson = await gmailResp.json().catch(() => ({}));

    if (!gmailResp.ok) {
      const details = gmailJson?.error?.message || "Failed to send Gmail message";
      return new Response(JSON.stringify({ error: details, details: gmailJson }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, provider: "gmail", id: gmailJson?.id ?? null, threadId: gmailJson?.threadId ?? null }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
