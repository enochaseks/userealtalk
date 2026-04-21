import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

function SafetyAdminPage() {
  const { user, session, loading } = useAuth();
  const [rows, setRows] = useState<SafetyRow[]>([]);
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

  useEffect(() => {
    setRows([]);
    setActionUserId(null);
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
        <div className="rounded-xl border border-border bg-surface/60 p-4 text-sm text-muted-foreground">
          Please wait while we verify account access.
        </div>
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
          {authFailureReason ? <p className="text-xs opacity-80">Access check: {authFailureReason}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-5 py-10 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Safety Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitor safety strikes, recent violent/abusive incidents, and enforcement status.
          </p>
        </div>
        <Button onClick={() => void loadRows()} disabled={busy}>
          {busy ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

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
            No safety records yet, or your account is not authorized for safety admin access.
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
    </div>
  );
}
