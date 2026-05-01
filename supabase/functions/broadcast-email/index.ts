// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const V1_1_EMAIL_SUBJECT = "RealTalk v1.1 is here — here's what's new 🎉";

const V1_1_EMAIL_BODY = `Hi,

We've been heads-down building and RealTalk v1.1 is now live at userealtalk.co.uk.

Here's everything that's new:

──────────────────────────────────────
  JOURNAL
──────────────────────────────────────
Your journal is now smarter. Write freely and RealTalk reads back what you've captured — spotting patterns, mood trends, and things you might have missed in the moment.

──────────────────────────────────────
  ADVICE LIBRARY
──────────────────────────────────────
A growing library of real, peer-reviewed advice on relationships, anxiety, career, money stress, and more. Each piece is verified by RealTalk before it goes live so you only ever see quality guidance.

──────────────────────────────────────
  MONEY PLANNER
──────────────────────────────────────
The most significant new tool we've shipped. The Money Planner lets you:

• Set a savings goal and track every spend against it
• Track debt — balances, APR, minimum payments, next due dates
• Get RealTalk debt support on demand — streamed, personalised guidance on each debt
• Log employment type, take-home pay, and pay dates
• Add benefits income so your plan reflects your actual money
• Opt into weekly debt check-in emails — RealTalk checks in, asks what's blocking payment, and keeps supporting you until each debt is cleared
• Generate a full RealTalk money plan from your goal, spending, and debt snapshot

──────────────────────────────────────
  CV REVIEW
──────────────────────────────────────
Upload your CV and RealTalk gives you a detailed, structured review — scoring impact, layout, skills match, and rewrite suggestions so you can compete for the roles you want.

──────────────────────────────────────
  WHAT'S COMING NEXT
──────────────────────────────────────
More personalisation, better weekly insights, and continued improvements across every tool.

You can log in and explore everything now:
https://userealtalk.co.uk

Thanks for being here,
The RealTalk team

---
You're receiving this because you have a RealTalk account.
To manage your notifications, visit: https://userealtalk.co.uk/settings
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL");
    const BROADCAST_SECRET = Deno.env.get("BROADCAST_SECRET");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require the broadcast secret to prevent unauthorised sends
    const body = await req.json().catch(() => ({}));
    if (BROADCAST_SECRET && body?.secret !== BROADCAST_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dryRun = body?.dryRun === true;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Paginate through all auth users (max 1000 per page)
    let allUsers: Array<{ id: string; email?: string }> = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users?.length) break;
      allUsers = allUsers.concat(data.users);
      if (data.users.length < 1000) break;
      page++;
    }

    const results: Array<{ email: string; status: string; error?: string }> = [];

    for (const u of allUsers) {
      if (!u.email) continue;

      if (dryRun) {
        results.push({ email: u.email, status: "dry-run" });
        continue;
      }

      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: RESEND_FROM_EMAIL,
            to: [u.email],
            subject: V1_1_EMAIL_SUBJECT,
            text: V1_1_EMAIL_BODY,
          }),
        });

        if (resp.ok) {
          results.push({ email: u.email, status: "sent" });
        } else {
          const errJson = await resp.json().catch(() => ({}));
          results.push({ email: u.email, status: "failed", error: String(errJson?.message ?? resp.status) });
        }
      } catch (sendErr) {
        results.push({ email: u.email, status: "error", error: String(sendErr) });
      }

      // Brief pause to avoid hitting Resend rate limits on large user lists
      await new Promise((r) => setTimeout(r, 100));
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed" || r.status === "error").length;

    return new Response(
      JSON.stringify({ ok: true, total: allUsers.length, sent, failed, dryRun, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[broadcast-email]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
