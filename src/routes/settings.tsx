import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getUsageWindowLabel,
  hasFeatureAccess,
  loadSubscriptionSnapshot,
  PLAN_CATALOG,
  setSubscriptionPlan,
  STRIPE_BILLING_ENABLED,
  type MeteredFeature,
  type SubscriptionPlan,
  type SubscriptionSnapshot,
} from "@/lib/subscriptions";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Settings - RealTalk" }] }),
});

type BillingCycle = "monthly" | "annual";

const SUBSCRIPTION_FEATURE_LABELS: Record<MeteredFeature, string> = {
  deep_thinking: "Deep Thinking",
  plan: "Plan Mode",
  gmail_send: "Gmail send",
  voice_input: "Voice input",
  journal_save: "Journal saves",
};

function SettingsPage() {
  const navigate = useNavigate();
  const { user, session, loading, signOut, connectGoogleForGmail } = useAuth();
  const [subscriptionSnapshot, setSubscriptionSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [planUpdateBusy, setPlanUpdateBusy] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [weeklyEmailEnabled, setWeeklyEmailEnabled] = useState(false);
  const [scheduleEmailRemindersEnabled, setScheduleEmailRemindersEnabled] = useState(false);
  const [scheduleReminderMinutes, setScheduleReminderMinutes] = useState(30);
  const [scheduleReminderUseGmail, setScheduleReminderUseGmail] = useState(false);
  const [shareVentingWithDatabase, setShareVentingWithDatabase] = useState(false);
  const [autoPdfEnabled, setAutoPdfEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("autoPdfSave") !== "false";
    }
    return true;
  });
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) {
      setSubscriptionSnapshot(null);
      return;
    }

    const load = async () => {
      const [snapshotResult, settingsResult] = await Promise.all([
        loadSubscriptionSnapshot(user.id),
        supabase
          .from("user_insight_settings")
          .select("weekly_email_enabled, schedule_email_reminders_enabled, schedule_email_reminder_minutes, schedule_email_use_gmail, share_venting_with_database")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      setSubscriptionSnapshot(snapshotResult);

      const data = settingsResult.data;
      setWeeklyEmailEnabled(Boolean(data?.weekly_email_enabled));
      setScheduleEmailRemindersEnabled(Boolean(data?.schedule_email_reminders_enabled));
      setScheduleReminderMinutes(Number(data?.schedule_email_reminder_minutes ?? 30));
      setScheduleReminderUseGmail(Boolean(data?.schedule_email_use_gmail));
      setShareVentingWithDatabase(Boolean(data?.share_venting_with_database));
    };

    void load();
  }, [user]);

  if (!user) return null;

  const planLabel = subscriptionSnapshot?.plan
    ? subscriptionSnapshot.plan.charAt(0).toUpperCase() + subscriptionSnapshot.plan.slice(1)
    : "Loading";

  const formatUsageSummary = (feature: MeteredFeature) => {
    const usage = subscriptionSnapshot?.usage[feature];
    if (!usage) return "Loading...";
    if (feature === "voice_input") {
      const formatVoiceDuration = (seconds: number) => {
        const safeSeconds = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(safeSeconds / 60);
        const remainder = safeSeconds % 60;

        if (minutes > 0 && remainder > 0) return `${minutes}m ${remainder}s`;
        if (minutes > 0) return `${minutes}m`;
        return `${remainder}s`;
      };

      if (usage.limit === null) return "Unlimited today";
      return `${formatVoiceDuration(usage.remaining ?? 0)} left of ${formatVoiceDuration(usage.limit)} today`;
    }

    if (usage.limit === null) return `Unlimited ${getUsageWindowLabel(feature)}`;
    return `${usage.remaining} left of ${usage.limit} ${getUsageWindowLabel(feature)}`;
  };

  const formatGbp = (value: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

  const changePlan = async (plan: SubscriptionPlan) => {
    if (!user || planUpdateBusy) return;
    if (subscriptionSnapshot?.plan === plan) return;

    setPlanUpdateBusy(true);
    try {
      const next = await setSubscriptionPlan(user.id, plan);
      setSubscriptionSnapshot(next);
      toast.success(`Plan changed to ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to change plan");
    } finally {
      setPlanUpdateBusy(false);
    }
  };

  const startCheckout = async (plan: SubscriptionPlan, cycle: BillingCycle) => {
    if (!user || !session || checkoutBusy) return;
    setCheckoutBusy(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          },
          body: JSON.stringify({ plan, cycle, returnUrl: window.location.href }),
        },
      );
      const json = await resp.json();
      if (!resp.ok || !json.url) throw new Error(json.error || "Could not start checkout");
      window.location.href = json.url;
    } catch (e: any) {
      toast.error(e?.message || "Could not start checkout");
      setCheckoutBusy(false);
    }
  };

  useEffect(() => {
    if (!user || !session) return;
    const raw = localStorage.getItem("realtalk_pending_checkout");
    if (!raw) return;
    try {
      const { plan, cycle } = JSON.parse(raw) as {
        plan: "pro" | "platinum";
        cycle: "monthly" | "annual";
      };
      localStorage.removeItem("realtalk_pending_checkout");
      void startCheckout(plan, cycle);
    } catch {
      localStorage.removeItem("realtalk_pending_checkout");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session]);

  const openPortal = async () => {
    if (!user || !session || portalBusy) return;
    setPortalBusy(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          },
          body: JSON.stringify({ returnUrl: window.location.href }),
        },
      );
      const json = await resp.json();
      if (!resp.ok || !json.url) throw new Error(json.error || "Could not open billing portal");
      window.location.href = json.url;
    } catch (e: any) {
      toast.error(e?.message || "Could not open billing portal");
      setPortalBusy(false);
    }
  };

  const saveInsightSettings = async (payload: {
    weekly_email_enabled: boolean;
    schedule_email_reminders_enabled: boolean;
    schedule_email_reminder_minutes: number;
    schedule_email_use_gmail: boolean;
    share_venting_with_database: boolean;
  }) => {
    const { error } = await supabase.from("user_insight_settings").upsert({
      user_id: user.id,
      monitor_enabled: true,
      ...payload,
      updated_at: new Date().toISOString(),
    });
    return error;
  };

  const toggleWeeklyEmail = async (enabled: boolean) => {
    const previous = weeklyEmailEnabled;
    setWeeklyEmailEnabled(enabled);
    const error = await saveInsightSettings({
      weekly_email_enabled: enabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      share_venting_with_database: shareVentingWithDatabase,
    });
    if (error) {
      setWeeklyEmailEnabled(previous);
      toast.error("Failed to update weekly email setting");
      return;
    }
    toast.success(enabled ? "Weekly insight email enabled" : "Weekly insight email disabled");
  };

  const toggleScheduleEmailReminders = async (enabled: boolean) => {
    const previous = scheduleEmailRemindersEnabled;
    setScheduleEmailRemindersEnabled(enabled);
    const error = await saveInsightSettings({
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: enabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      share_venting_with_database: shareVentingWithDatabase,
    });
    if (error) {
      setScheduleEmailRemindersEnabled(previous);
      toast.error("Failed to update schedule reminder setting");
      return;
    }
    toast.success(enabled ? "Schedule email reminders enabled" : "Schedule email reminders disabled");
  };

  const changeScheduleReminderMinutes = async (value: string) => {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 180) return;

    const previous = scheduleReminderMinutes;
    setScheduleReminderMinutes(minutes);
    const error = await saveInsightSettings({
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: minutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      share_venting_with_database: shareVentingWithDatabase,
    });
    if (error) {
      setScheduleReminderMinutes(previous);
      toast.error("Failed to update reminder lead time");
      return;
    }
    toast.success(`Reminders will be sent ${minutes} minutes before schedule time`);
  };

  const toggleScheduleReminderChannel = async (useGmail: boolean) => {
    if (useGmail && !session?.provider_token) {
      toast.info("Connect Gmail to use Gmail delivery");
      const { error } = await connectGoogleForGmail();
      if (error) {
        toast.error(error);
      } else {
        toast.success("Redirecting to Google to connect Gmail");
      }
      return;
    }

    const previous = scheduleReminderUseGmail;
    setScheduleReminderUseGmail(useGmail);
    const error = await saveInsightSettings({
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: useGmail,
      share_venting_with_database: shareVentingWithDatabase,
    });
    if (error) {
      setScheduleReminderUseGmail(previous);
      toast.error("Failed to update reminder delivery channel");
      return;
    }
    toast.success(useGmail ? "Reminder channel set to Gmail" : "Reminder channel set to normal email");
  };

  const toggleAutoPdf = (enabled: boolean) => {
    setAutoPdfEnabled(enabled);
    localStorage.setItem("autoPdfSave", enabled ? "true" : "false");
    toast.success(enabled ? "PDF auto-save enabled" : "PDF auto-save disabled");
  };

  const toggleShareVenting = async (enabled: boolean) => {
    const previous = shareVentingWithDatabase;
    setShareVentingWithDatabase(enabled);
    const error = await saveInsightSettings({
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      share_venting_with_database: enabled,
    });
    if (error) {
      setShareVentingWithDatabase(previous);
      toast.error("Failed to update venting privacy setting");
      return;
    }

    toast.success(
      enabled
        ? "Venting share enabled. Vent conversations can be saved to your account."
        : "Private venting enabled by default. Vent conversations will stay out of your saved chat history.",
    );
  };

  const deleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      toast.error('Type DELETE to confirm account removal');
      return;
    }

    setDeletingAccount(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("You must be signed in to delete your account");
      }

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(json.error || "Failed to delete account");
      }

      await signOut();
      setDeleteDialogOpen(false);
      setDeleteConfirmText("");
      toast.success("Account deleted");
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete account");
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10">
      <div className="mb-6">
        <h1 className="font-serif text-3xl tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage subscription, delivery, and account controls.</p>
      </div>

      <div className="space-y-6 max-w-md">
        <div className="rounded-xl border border-border bg-surface/60 p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold text-foreground cursor-pointer">
                Subscription
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Current plan: {planLabel}
              </p>
            </div>
            <div className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {planLabel}
            </div>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>Schedule</span>
              <span>{subscriptionSnapshot ? (hasFeatureAccess(subscriptionSnapshot.plan, "schedule") ? "Included" : "Pro / Platinum") : "Loading..."}</span>
            </div>
            {(["deep_thinking", "plan", "gmail_send", "voice_input"] as MeteredFeature[]).map((feature) => (
              <div key={feature} className="flex items-center justify-between gap-3">
                <span>{SUBSCRIPTION_FEATURE_LABELS[feature]}</span>
                <span>{formatUsageSummary(feature)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {STRIPE_BILLING_ENABLED
              ? "Choose your plan. Changes take effect immediately."
              : "Billing is not live yet. All users are currently on Free until Stripe is enabled."}
          </p>
          <div className="inline-flex rounded-full border border-border/70 bg-background/30 p-1">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                billingCycle === "monthly" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("annual")}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                billingCycle === "annual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 pt-1">
            {PLAN_CATALOG.map((item) => {
              const selected = subscriptionSnapshot?.plan === item.plan;
              const cyclePrice = billingCycle === "monthly" ? item.pricing.monthlyGbp : item.pricing.annualGbp;
              const cycleSuffix = billingCycle === "monthly" ? "/month" : "/year";
              return (
                <div
                  key={item.plan}
                  className={`rounded-lg border px-3 py-3 ${selected ? "border-primary/60 bg-primary/10" : "border-border/60 bg-background/30"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="mt-1 text-base font-semibold text-foreground">
                        {formatGbp(cyclePrice)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">{cycleSuffix}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{item.blurb}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={selected ? "secondary" : "outline"}
                      disabled={
                        selected ||
                        !subscriptionSnapshot ||
                        checkoutBusy ||
                        planUpdateBusy
                      }
                      onClick={() => {
                        if (item.plan === "free") {
                          void openPortal();
                        } else {
                          void startCheckout(item.plan, billingCycle);
                        }
                      }}
                    >
                      {selected
                        ? "Current"
                        : checkoutBusy
                          ? "Loading…"
                          : item.plan === "free"
                            ? "Downgrade"
                            : "Subscribe"}
                    </Button>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {item.features.map((feature) => (
                      <div key={feature} className="text-[11px] text-muted-foreground">
                        • {feature}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Manage / cancel subscription for paid users */}
          {subscriptionSnapshot && subscriptionSnapshot.plan !== "free" && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-border/60 bg-background/30 px-3 py-2.5">
              <div>
                <p className="text-xs font-medium">Manage subscription</p>
                <p className="text-[11px] text-muted-foreground">Update payment method, download invoices, or cancel.</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={portalBusy}
                onClick={() => void openPortal()}
              >
                {portalBusy ? "Opening…" : "Billing portal"}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-foreground cursor-pointer">
                Weekly insight email
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Send your latest weekly insight summary to your email address. Uses Gmail when connected, otherwise standard email delivery.
              </p>
            </div>
            <Switch checked={weeklyEmailEnabled} onCheckedChange={toggleWeeklyEmail} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-foreground cursor-pointer">
                Schedule reminder emails
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Send a reminder email shortly before each upcoming schedule item.
              </p>
            </div>
            <Switch checked={scheduleEmailRemindersEnabled} onCheckedChange={toggleScheduleEmailReminders} />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Reminder timing</p>
            <select
              value={String(scheduleReminderMinutes)}
              onChange={(e) => void changeScheduleReminderMinutes(e.target.value)}
              className="rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-xs text-foreground"
              disabled={!scheduleEmailRemindersEnabled}
            >
              <option value="5">5 minutes before</option>
              <option value="10">10 minutes before</option>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="45">45 minutes before</option>
              <option value="60">60 minutes before</option>
              <option value="120">2 hours before</option>
              <option value="180">3 hours before</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Use Gmail for reminders</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Turn off to send with normal email provider instead of Gmail.
              </p>
            </div>
            <Switch
              checked={scheduleReminderUseGmail}
              onCheckedChange={toggleScheduleReminderChannel}
              disabled={!scheduleEmailRemindersEnabled}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Gmail mode uses your connected Google account. Normal email mode uses the platform provider.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-foreground cursor-pointer">
                Auto-save plans as PDF
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Automatically save plans as PDF files when you click "Save as Plan"
              </p>
            </div>
            <Switch checked={autoPdfEnabled} onCheckedChange={toggleAutoPdf} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold text-foreground cursor-pointer">
                Share vent chats with your database
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Off by default for private venting. Turn on only if you want vent-mode messages saved in your account history.
              </p>
            </div>
            <Switch checked={shareVentingWithDatabase} onCheckedChange={toggleShareVenting} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface/60 p-5 space-y-2">
          <Label className="text-sm font-semibold text-foreground cursor-pointer">
            Privacy & account data
          </Label>
          <p className="text-xs text-muted-foreground">
            Review policy details, export your data, or request account deletion.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
            <Link to="/terms" className="text-primary hover:underline">Terms</Link>
            <Link to="/account-data" className="text-primary hover:underline">Account & data export</Link>
            <Link to="/safety-admin" className="text-primary hover:underline">App policy</Link>
          </div>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 space-y-3">
          <div>
            <Label className="text-sm font-semibold text-foreground cursor-pointer">
              Delete account
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Permanently delete your account, chats, plans, insights, and related data. This cannot be undone.
            </p>
          </div>

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">Delete account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your account and associated data. Type DELETE to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE"
              />

              <AlertDialogFooter>
                <AlertDialogCancel disabled={deletingAccount}>Cancel</AlertDialogCancel>
                <Button variant="destructive" onClick={() => void deleteAccount()} disabled={deletingAccount}>
                  {deletingAccount ? "Deleting..." : "Permanently delete"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <p className="text-center text-xs text-muted-foreground/60 pb-2">RealTalk v1.0 &mdash; Your thinking companion</p>
      </div>
    </div>
  );
}
