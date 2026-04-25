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
      const client = supabase as any;
      const [conversationsRes, messagesRes, plansRes, insightsRes, settingsRes, memoryProfileRes, advicePostsRes, adviceFeedbackRes, adviceReportsRes] = await Promise.all([
        supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("messages").select("*").eq("user_id", user.id).order("created_at", { ascending: true }),
        supabase.from("plans").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase
          .from("conversation_weekly_insights")
          .select("*")
          .eq("user_id", user.id)
          .order("week_start", { ascending: false }),
        supabase.from("user_insight_settings").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_memory_profiles").select("*").eq("user_id", user.id).maybeSingle(),
        client.from("advice_posts").select("*").eq("author_user_id", user.id).order("created_at", { ascending: false }),
        client.from("advice_feedback").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        client.from("advice_reports").select("*").eq("reporter_user_id", user.id).order("created_at", { ascending: false }),
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
        learned_profile_preferences: memoryProfileRes.data ?? null,
        advice_posts: advicePostsRes.data ?? [],
        advice_feedback: adviceFeedbackRes.data ?? [],
        advice_reports: adviceReportsRes.data ?? [],
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
      <h1 className="font-serif text-3xl tracking-tight">Account &amp; Data</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Manage your data and privacy settings in RealTalk.
      </p>

      <div className="mt-6 space-y-5">
        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <h2 className="text-base font-semibold">Export your data</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Download your account data as a JSON file before deleting your account.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">This includes:</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>conversations and messages</li>
            <li>saved plans</li>
            <li>advice submissions, feedback, and reports</li>
            <li>insights and summaries</li>
            <li>venting privacy settings (including whether you opted in to sharing vent chats)</li>
            <li>learned profile preferences (such as communication style and behavioural patterns)</li>
          </ul>
          <div className="mt-3">
            <Button onClick={() => void exportMyData()} disabled={busy}>
              {busy ? "Exporting..." : "Export my data"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <h2 className="text-base font-semibold">Delete your account</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You can permanently delete your account from your profile settings.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">Deleting your account will remove:</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li>all conversations</li>
            <li>all insights and summaries</li>
            <li>saved plans</li>
            <li>learned profile data</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">This action cannot be undone.</p>
          <div className="mt-3">
            <Link
              to="/settings"
              className="text-primary hover:underline text-sm"
            >
              Go to profile settings
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <h2 className="text-base font-semibold">How your data is used</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            RealTalk uses your conversations to generate insights and personalise responses.
            Your data is used only to improve your experience and is never sold.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vent mode is private by default. Vent chats are not saved unless you explicitly enable vent sharing in Settings.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <h2 className="text-base font-semibold">Access requirement</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You must be signed in to export or manage your data.
          </p>
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
