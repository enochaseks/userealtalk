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

const buildMimeMessage = ({ to, subject, body }: { to: string; subject: string; body: string }) => {
  const encodedSubject = /[^\x00-\x7F]/.test(subject) ? encodeWordQ(subject) : subject;
  // Encode body as base64 for reliable UTF-8 transport
  const bodyBytes = new TextEncoder().encode(body);
  const encodedBody = encodeBase64Url(bodyBytes);
  return [
    `To: ${to}`,
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, subject, body, googleAccessToken } = await req.json();

    if (!to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Missing to, subject, or body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!googleAccessToken) {
      return new Response(JSON.stringify({ error: "Missing Google access token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mime = buildMimeMessage({ to, subject, body });
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
      JSON.stringify({ ok: true, id: gmailJson?.id ?? null, threadId: gmailJson?.threadId ?? null }),
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
