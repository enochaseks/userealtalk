import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/account-data")({
  component: AccountDataPage,
  head: () => ({ meta: [{ title: "Account & Data Export — RealTalk" }] }),
});

function AccountDataPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const exportMyData = async () => {
    if (!user) {
      toast.error("Sign in first to export your data");
      return;
    }

    setBusy(true);
    try {
      const [conversationsRes, messagesRes, plansRes, insightsRes, settingsRes] = await Promise.all([
        supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("messages").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
        supabase.from("plans").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase
          .from("conversation_weekly_insights")
          .select("*")
          .eq("user_id", user.id)
          .order("week_start", { ascending: false }),
        supabase.from("user_insight_settings").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
        },
        conversations: conversationsRes.data ?? [],
        messages: messagesRes.data ?? [],
        plans: plansRes.data ?? [],
        weekly_insights: insightsRes.data ?? [],
        insight_settings: settingsRes.data ?? null,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `realtalk-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Data export downloaded");
    } catch (e: any) {
      toast.error(e?.message || "Failed to export data");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10">
      <button
        onClick={() => navigate({ to: "/profile", search: { tab: undefined } })}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>
      <h1 className="font-serif text-3xl tracking-tight">Account & data export</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Use these options to manage your account data and privacy rights.
      </p>

      <div className="mt-6 space-y-5">
        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <h2 className="text-base font-semibold">Export your data</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Download your account data as JSON (conversations, messages, plans, and insights).
          </p>
          <div className="mt-3">
            <Button onClick={() => void exportMyData()} disabled={busy}>
              {busy ? "Exporting..." : "Export my data"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <h2 className="text-base font-semibold">Delete account in settings</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Account deletion is handled from your profile settings so you can confirm it securely while signed in.
          </p>
          <div className="mt-3">
            <Link
              to="/profile"
              search={{ tab: "settings" }}
              className="text-primary hover:underline text-sm"
            >
              Go to profile settings
            </Link>
          </div>
        </div>

        {!user && (
          <div className="rounded-xl border border-border bg-surface/60 p-5 text-sm text-muted-foreground">
            You are currently signed out. <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to export your data.
          </div>
        )}
      </div>
    </div>
  );
}
