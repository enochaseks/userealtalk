// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
