import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Trash2, Flag } from "lucide-react";

export const Route = createFileRoute("/safety-admin")({
  component: SafetyAdminPage,
  head: () => ({ meta: [{ title: "Safety Admin - RealTalk" }] }),
});

type SafetyEvent = {
  id: string;
  user_id: string;
  category: string;
  severity: string;
  action: string;
  message_excerpt: string;
  created_at: string;
};

type SafetyRow = {
  user_id: string;
  strike_count: number;
  restricted_until: string | null;
  last_violation_at: string | null;
  updated_at: string;
  recent_events: SafetyEvent[];
};

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

function SafetyAdminPage() {
  const { user, session, loading } = useAuth();
  const [tab, setTab] = useState<"safety" | "pending" | "reports">("safety");
  const [rows, setRows] = useState<SafetyRow[]>([]);
  const [advicePosts, setAdvicePosts] = useState<AdvicePost[]>([]);
  const [adviceReports, setAdviceReports] = useState<AdviceReport[]>([]);
  const [adviceNoteMap, setAdviceNoteMap] = useState<Record<string, string>>({});
  const [adviceActionId, setAdviceActionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState(false);
  const [authCheckComplete, setAuthCheckComplete] = useState(false);
  const [authFailureReason, setAuthFailureReason] = useState<string>("");

  const isSignedIn = Boolean(user?.id);
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  };

  const isUnauthorizedError = async (error: any): Promise<boolean> => {
    const status = Number(error?.context?.status ?? error?.status ?? 0);
    if (status === 401 || status === 403) return true;

    const message = String(error?.message ?? "").toLowerCase();
    if (message.includes("401") || message.includes("403") || message.includes("unauthorized") || message.includes("forbidden")) {
      return true;
    }

    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        const body = await response.clone().json().catch(() => null);
        const bodyText = JSON.stringify(body ?? {}).toLowerCase();
        if (bodyText.includes("unauthorized") || bodyText.includes("forbidden") || bodyText.includes("401") || bodyText.includes("403")) {
          return true;
        }
      }
    } catch {
      // Ignore parse failures and fall back to standard error handling.
    }

    return false;
  };

  const getInvokeErrorDetails = async (error: any): Promise<string> => {
    const message = String(error?.message ?? "").trim();
    try {
      const response = error?.context;
      if (response && typeof response.clone === "function") {
        const body = await response.clone().json().catch(() => null);
        const backendError = String(body?.error ?? "").trim();
        const backendDebug = String(body?.debug ?? "").trim();
        if (backendError || backendDebug) {
          return [backendError, backendDebug].filter(Boolean).join(" - ");
        }
      }
    } catch {
      // Ignore parse failures and fall back to generic message.
    }

    return message || "Could not verify policy access right now.";
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (session?.access_token) return session.access_token;

    try {
      const { data } = await supabase.auth.refreshSession();
      if (data.session?.access_token) return data.session.access_token;
    } catch {
      // Ignore refresh failures and fall back to existing session lookup.
    }

    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const invokeAdviceAdmin = async (action: string, extra?: Record<string, unknown>) => {
    const token = await getAccessToken();
    if (!token) throw new Error("Missing access token.");
    const { data, error } = await supabase.functions.invoke("advice-admin", {
      body: { action, ...extra },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    return data;
  };

  const loadRows = async () => {
    if (!isSignedIn || loading) return;
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        setIsAuthorizedAdmin(false);
        setAuthCheckComplete(true);
        setRows([]);
        setAuthFailureReason("Unauthorized - Missing access token. Please sign out and sign in again.");
        return;
      }

      let { data, error } = await supabase.functions.invoke("safety-admin", {
        body: { action: "list", limit: 100 },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const unauthorized = await isUnauthorizedError(error);
        if (unauthorized) {
          const retryToken = await getAccessToken();
          if (!retryToken) throw error;
          const retry = await supabase.functions.invoke("safety-admin", {
            body: { action: "list", limit: 100 },
            headers: { Authorization: `Bearer ${retryToken}` },
          });
          data = retry.data;
          error = retry.error;
        }
      }

      if (error) throw error;
      setRows((data?.rows ?? []) as SafetyRow[]);
      setIsAuthorizedAdmin(true);
      setAuthCheckComplete(true);
      setAuthFailureReason("");

      // Load advice moderation data in parallel (best-effort — no auth failure if this one fails)
      try {
        const [pendingData, reportsData] = await Promise.all([
          invokeAdviceAdmin("list_pending"),
          invokeAdviceAdmin("list_reports"),
        ]);
        setAdvicePosts(pendingData?.posts ?? []);
        setAdviceReports(reportsData?.reports ?? []);
      } catch {
        // advice-admin may not be deployed yet — fail silently
      }
    } catch (e: any) {
      const details = await getInvokeErrorDetails(e);
      const unauthorized = await isUnauthorizedError(e);
      if (unauthorized) {
        setIsAuthorizedAdmin(false);
        setAuthCheckComplete(true);
        setRows([]);
        setAuthFailureReason(details);
        return;
      }

      toast.error(details || "Failed to load safety data. Please try again.");
      setRows([]);
      setAuthCheckComplete(true);
      setAuthFailureReason(details);
    } finally {
      setBusy(false);
    }
  };

  const handleAdviceAction = async (
    action: string,
    id: string,
    extra?: Record<string, unknown>,
  ) => {
    setAdviceActionId(id);
    try {
      await invokeAdviceAdmin(action, extra);
      toast.success(
        action === "approve" ? "Post approved."
          : action === "reject" ? "Post rejected."
          : action === "remove" || action === "remove_from_report" ? "Post removed."
          : "Report dismissed.",
      );
      const [pendingData, reportsData] = await Promise.all([
        invokeAdviceAdmin("list_pending"),
        invokeAdviceAdmin("list_reports"),
      ]);
      setAdvicePosts(pendingData?.posts ?? []);
      setAdviceReports(reportsData?.reports ?? []);
    } catch (e: any) {
      toast.error(String(e?.message ?? "Action failed."));
    } finally {
      setAdviceActionId(null);
    }
  };

  useEffect(() => {
    setRows([]);
    setActionUserId(null);
    setAdvicePosts([]);
    setAdviceReports([]);
    setIsAuthorizedAdmin(false);
    setAuthCheckComplete(false);
    setAuthFailureReason("");

    if (user?.id && !loading) {
      void loadRows();
    }
  }, [user?.id, session?.access_token, loading]);

  const activeRestrictions = useMemo(
    () => rows.filter((r) => r.restricted_until && new Date(r.restricted_until).getTime() > Date.now()).length,
    [rows],
  );

  const runAction = async (action: "unlock" | "reset_strikes", userId: string) => {
    setActionUserId(userId);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Missing access token. Please sign in again.");
      }

      let { error } = await supabase.functions.invoke("safety-admin", {
        body: { action, userId },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error) {
        const unauthorized = await isUnauthorizedError(error);
        if (unauthorized) {
          const retryToken = await getAccessToken();
          if (!retryToken) throw error;
          const retry = await supabase.functions.invoke("safety-admin", {
            body: { action, userId },
            headers: { Authorization: `Bearer ${retryToken}` },
          });
          error = retry.error;
        }
      }

      if (error) throw error;
      toast.success(action === "unlock" ? "User unlocked" : "Strikes reset");
      await loadRows();
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setActionUserId(null);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="flex-1 max-w-4xl w-full mx-auto px-5 py-10 space-y-4">
        <Button variant="outline" size="sm" onClick={handleBack} className="w-fit">
          Back
        </Button>
        <h1 className="font-serif text-3xl tracking-tight">App Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">Sign in to view your account policy and platform guidelines.</p>
      </div>
    );
  }

  if (!authCheckComplete) {
    return (
      <div className="flex-1 max-w-4xl w-full mx-auto px-5 py-10 space-y-4">
        <Button variant="outline" size="sm" onClick={handleBack} className="w-fit">
          Back
        </Button>
        <h1 className="font-serif text-3xl tracking-tight">App Policy</h1>
        <p className="text-sm text-muted-foreground">Loading policy information...</p>
      </div>
    );
  }

  if (authCheckComplete && !isAuthorizedAdmin) {
    return (
      <div className="flex-1 max-w-4xl w-full mx-auto px-5 py-10 space-y-4">
        <Button variant="outline" size="sm" onClick={handleBack} className="w-fit">
          Back
        </Button>
        <h1 className="font-serif text-3xl tracking-tight">App Policy</h1>
        <p className="text-sm text-muted-foreground">
          RealTalk applies automated and manual safeguards to help protect users and maintain a safe platform.
        </p>
        <div className="rounded-xl border border-border bg-surface/60 p-4 text-sm text-muted-foreground space-y-2">
          <p>We monitor policy-sensitive activity signals to prevent harm, abuse, and misuse.</p>
          <p>Enforcement actions may include warnings, temporary restrictions, and account review where necessary.</p>
          <p>Policy operations interfaces are restricted and not available on standard user accounts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-5 py-10 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Safety enforcement · Advice moderation
          </p>
        </div>
        <Button onClick={() => void loadRows()} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("safety")}
          className={`text-sm px-4 py-1.5 rounded-md transition-colors font-medium ${
            tab === "safety" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Safety ({rows.length})
        </button>
        <button
          onClick={() => setTab("pending")}
          className={`text-sm px-4 py-1.5 rounded-md transition-colors font-medium ${
            tab === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Pending ({advicePosts.length})
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`text-sm px-4 py-1.5 rounded-md transition-colors font-medium ${
            tab === "reports" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Reports ({adviceReports.length})
        </button>
      </div>

      {/* ── Safety tab ── */}
      {tab === "safety" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-surface/60 p-4">
              <p className="text-xs text-muted-foreground">Tracked users</p>
              <p className="text-2xl font-semibold mt-1">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface/60 p-4">
              <p className="text-xs text-muted-foreground">Active restrictions</p>
              <p className="text-2xl font-semibold mt-1">{activeRestrictions}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface/60 p-4">
              <p className="text-xs text-muted-foreground">High-risk users (2+ strikes)</p>
              <p className="text-2xl font-semibold mt-1">{rows.filter((r) => r.strike_count >= 2).length}</p>
            </div>
          </div>

          <div className="space-y-3">
            {rows.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface/60 p-4 text-sm text-muted-foreground">
                No safety records yet.
              </div>
            ) : (
              rows.map((row) => {
                const restrictionActive = row.restricted_until && new Date(row.restricted_until).getTime() > Date.now();
                return (
                  <div key={row.user_id} className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">User: {row.user_id}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Strikes: {row.strike_count} • Last violation: {row.last_violation_at ? new Date(row.last_violation_at).toLocaleString() : "N/A"}
                        </p>
                        <p className={`text-xs mt-1 ${restrictionActive ? "text-red-400" : "text-muted-foreground"}`}>
                          {restrictionActive ? `Restricted until ${new Date(row.restricted_until as string).toLocaleString()}` : "No active restriction"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionUserId === row.user_id}
                          onClick={() => void runAction("unlock", row.user_id)}
                        >
                          {actionUserId === row.user_id ? "Working..." : "Unlock"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actionUserId === row.user_id}
                          onClick={() => void runAction("reset_strikes", row.user_id)}
                        >
                          {actionUserId === row.user_id ? "Working..." : "Reset strikes"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Recent events</p>
                      {(row.recent_events ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No recent events.</p>
                      ) : (
                        row.recent_events.map((event) => (
                          <div key={event.id} className="rounded-lg border border-border/70 bg-background/40 p-3">
                            <p className="text-xs text-muted-foreground">
                              {new Date(event.created_at).toLocaleString()} • {event.category} • {event.severity} • {event.action}
                            </p>
                            <p className="text-sm mt-1 whitespace-pre-wrap">{event.message_excerpt}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ── Pending advice tab ── */}
      {tab === "pending" && (
        <div className="space-y-4">
          {advicePosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending submissions.</p>
          ) : (
            advicePosts.map((post) => (
              <div key={post.id} className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{post.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px] capitalize">{CATEGORY_LABELS[post.category] ?? post.category}</Badge>
                      {post.is_anonymous && <span className="text-[10px] text-muted-foreground">anonymous</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{post.body}</p>
                {(post.tags as string[]).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(post.tags as string[]).map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}
                <textarea
                  placeholder="Optional moderation note"
                  value={adviceNoteMap[post.id] ?? ""}
                  onChange={(e) => setAdviceNoteMap((prev) => ({ ...prev, [post.id]: e.target.value }))}
                  rows={2}
                  className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    disabled={adviceActionId === post.id}
                    onClick={() => handleAdviceAction("approve", post.id, { postId: post.id, notes: adviceNoteMap[post.id] ?? "" })}
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5"
                    disabled={adviceActionId === post.id}
                    onClick={() => handleAdviceAction("reject", post.id, { postId: post.id, notes: adviceNoteMap[post.id] ?? "" })}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Reports tab ── */}
      {tab === "reports" && (
        <div className="space-y-4">
          {adviceReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open reports.</p>
          ) : (
            adviceReports.map((report) => {
              const post = report.advice_posts;
              return (
                <div key={report.id} className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Flag className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{report.reason}</p>
                      {report.details && <p className="text-xs text-muted-foreground mt-0.5">{report.details}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(report.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {post && (
                    <div className="rounded-lg border border-border/60 bg-background/40 p-3 space-y-1">
                      <p className="text-xs font-medium">{post.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{post.body}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <Badge variant="secondary" className="text-[10px] capitalize">{CATEGORY_LABELS[post.category] ?? post.category}</Badge>
                        <Badge variant={post.status === "approved" ? "default" : "secondary"} className="text-[10px] capitalize">{post.status}</Badge>
                      </div>
                    </div>
                  )}
                  <textarea
                    placeholder="Optional note"
                    value={adviceNoteMap[report.id] ?? ""}
                    onChange={(e) => setAdviceNoteMap((prev) => ({ ...prev, [report.id]: e.target.value }))}
                    rows={2}
                    className="w-full text-xs bg-background border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    {post && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 gap-1.5"
                        disabled={adviceActionId === report.id}
                        onClick={() => handleAdviceAction("remove_from_report", report.id, { reportId: report.id, postId: post.id, notes: adviceNoteMap[report.id] ?? "" })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove post
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-1.5"
                      disabled={adviceActionId === report.id}
                      onClick={() => handleAdviceAction("dismiss_report", report.id, { reportId: report.id })}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
