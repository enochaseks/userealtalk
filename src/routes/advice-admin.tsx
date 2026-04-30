import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Trash2, ChevronLeft, Flag } from "lucide-react";

export const Route = createFileRoute("/advice-admin")({
  component: AdviceAdminPage,
  head: () => ({ meta: [{ title: "Advice Moderation - RealTalk" }] }),
});

type AdvicePost = {
  id: string;
  title: string;
  body: string;
  category: string;
  tags: string[];
  status: string;
  moderation_notes: string;
  report_count: number;
  helpful_count: number;
  created_at: string;
  author_user_id: string;
  is_anonymous: boolean;
};

type AdviceReport = {
  id: string;
  reason: string;
  details: string;
  status: string;
  created_at: string;
  reporter_user_id: string;
  advice_post_id: string;
  advice_posts: {
    id: string;
    title: string;
    body: string;
    category: string;
    status: string;
  } | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  benefits: "Benefits",
  money: "Money",
  "mental-health": "Mental Health",
  work: "Work",
  relationships: "Relationships",
};

function AdviceAdminPage() {
  const { user, session, loading } = useAuth();
  const [tab, setTab] = useState<"pending" | "reports">("pending");
  const [posts, setPosts] = useState<AdvicePost[]>([]);
  const [reports, setReports] = useState<AdviceReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState(false);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);
  const [authFailureReason, setAuthFailureReason] = useState("");

  const isSignedIn = Boolean(user?.id);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (session?.access_token) return session.access_token;
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) return data.session.access_token;
    } catch {
      // ignore
    }
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const isUnauthorizedError = async (error: any): Promise<boolean> => {
    const status = Number(error?.context?.status ?? error?.status ?? 0);
    if (status === 401 || status === 403) return true;
    const message = String(error?.message ?? "").toLowerCase();
    if (message.includes("401") || message.includes("403") || message.includes("unauthorized") || message.includes("forbidden")) return true;
    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        const body = await response.clone().json().catch(() => null);
        const text = JSON.stringify(body ?? {}).toLowerCase();
        if (text.includes("unauthorized") || text.includes("forbidden") || text.includes("401") || text.includes("403")) return true;
      }
    } catch {
      // ignore
    }
    return false;
  };

  const invoke = async (action: string, extra?: Record<string, unknown>) => {
    const token = await getAccessToken();
    if (!token) throw new Error("Missing access token.");
    const { data, error } = await supabase.functions.invoke("advice-admin", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  const loadData = async () => {
    if (!isSignedIn || loading) return;
    setBusy(true);
    try {
      const [pendingData, reportsData] = await Promise.all([
        invoke("list_pending"),
        invoke("list_reports"),
      ]);
      setPosts(pendingData?.posts ?? []);
      setReports(reportsData?.reports ?? []);
      setIsAuthorizedAdmin(true);
      setAuthCheckComplete(true);
      setAuthFailureReason("");
      // Process any matured AI report decisions (24h window) — fire-and-forget
      invoke("process_pending_reports").catch(() => {});
    } catch (e: any) {
      const unauthorized = await isUnauthorizedError(e);
      if (unauthorized) {
        setIsAuthorizedAdmin(false);
        setAuthCheckComplete(true);
        setAuthFailureReason(String(e?.message ?? "Access denied."));
        return;
      }
      toast.error("Failed to load moderation queue.");
      setAuthCheckComplete(true);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setPosts([]);
    setReports([]);
    setIsAuthorizedAdmin(false);
    setAuthCheckComplete(false);
    setAuthFailureReason("");
    if (user?.id && !loading) void loadData();
  }, [user?.id, session?.access_token, loading]);

  const handleAction = async (
    action: string,
    id: string,
    extra?: Record<string, unknown>,
  ) => {
    setActionId(id);
    try {
      await invoke(action, extra);
      toast.success(
        action === "approve"
          ? "Post approved."
          : action === "reject"
            ? "Post rejected."
            : action === "remove" || action === "remove_from_report"
              ? "Post removed."
              : "Report dismissed.",
      );
      await loadData();
    } catch (e: any) {
      toast.error(String(e?.message ?? "Action failed."));
    } finally {
      setActionId(null);
    }
  };

  // ── Loading / auth states ─────────────────────────────────────────────────
  if (loading || !authCheckComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Checking access…</p>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted-foreground text-sm">You need to be signed in to view this page.</p>
        <Button variant="outline" onClick={handleBack}>Go back</Button>
      </div>
    );
  }

  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm font-medium text-destructive">Access denied</p>
        <p className="text-xs text-muted-foreground text-center max-w-xs">{authFailureReason || "You are not authorised to view this page."}</p>
        <Button variant="outline" onClick={handleBack}>Go back</Button>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleBack}
            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Advice Moderation</h1>
            <p className="text-xs text-muted-foreground">
              {posts.length} pending · {reports.length} open {reports.length === 1 ? "report" : "reports"}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-surface rounded-lg p-1">
          <button
            onClick={() => setTab("pending")}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium ${
              tab === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending ({posts.length})
          </button>
          <button
            onClick={() => setTab("reports")}
            className={`flex-1 text-sm py-1.5 rounded-md transition-colors font-medium ${
              tab === "reports" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Reports ({reports.length})
          </button>
        </div>

        {/* Pending posts */}
        {tab === "pending" && (
          <div className="space-y-4">
            {busy && posts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
            )}
            {!busy && posts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">No pending submissions.</p>
            )}
            {posts.map((post) => (
              <div key={post.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">{post.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px] capitalize">{CATEGORY_LABELS[post.category] ?? post.category}</Badge>
                      {post.is_anonymous && <span className="text-[10px] text-muted-foreground">anonymous</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{post.body}</p>

                {(post.tags as string[]).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(post.tags as string[]).map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}

                {/* Moderation notes */}
                <textarea
                  placeholder="Optional moderation note (shown to submitter on reject)"
                  value={noteMap[post.id] ?? ""}
                  onChange={(e) => setNoteMap((prev) => ({ ...prev, [post.id]: e.target.value }))}
                  rows={2}
                  className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    disabled={actionId === post.id}
                    onClick={() => handleAction("approve", post.id, { postId: post.id, notes: noteMap[post.id] ?? "" })}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    disabled={actionId === post.id}
                    onClick={() => handleAction("reject", post.id, { postId: post.id, notes: noteMap[post.id] ?? "" })}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reports */}
        {tab === "reports" && (
          <div className="space-y-4">
            {busy && reports.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
            )}
            {!busy && reports.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-10">No open reports.</p>
            )}
            {reports.map((report) => {
              const post = report.advice_posts;
              return (
                <div key={report.id} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Flag className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{report.reason}</p>
                      {report.details && (
                        <p className="text-xs text-muted-foreground mt-0.5">{report.details}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(report.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {post && (
                    <div className="rounded-lg border border-border/60 bg-background p-3 space-y-1">
                      <p className="text-xs font-medium text-foreground">{post.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{post.body}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <Badge variant="secondary" className="text-[10px] capitalize">{CATEGORY_LABELS[post.category] ?? post.category}</Badge>
                        <Badge
                          variant={post.status === "approved" ? "default" : "secondary"}
                          className="text-[10px] capitalize"
                        >
                          {post.status}
                        </Badge>
                      </div>
                    </div>
                  )}

                  {/* Note for removal */}
                  <textarea
                    placeholder="Optional note"
                    value={noteMap[report.id] ?? ""}
                    onChange={(e) => setNoteMap((prev) => ({ ...prev, [report.id]: e.target.value }))}
                    rows={2}
                    className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  />

                  <div className="flex gap-2">
                    {post && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 gap-1.5"
                        disabled={actionId === report.id}
                        onClick={() =>
                          handleAction("remove_from_report", report.id, {
                            reportId: report.id,
                            postId: post.id,
                            notes: noteMap[report.id] ?? "",
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove post
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5"
                      disabled={actionId === report.id}
                      onClick={() => handleAction("dismiss_report", report.id, { reportId: report.id })}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
