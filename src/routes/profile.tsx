import { createFileRoute, useNavigate, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Brain, CalendarDays, Check, ChevronDown, Download, Pencil, X } from "lucide-react";
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
  PLAN_CATALOG,
  loadSubscriptionSnapshot,
  setSubscriptionPlan,
  STRIPE_BILLING_ENABLED,
  type MeteredFeature,
  type SubscriptionPlan,
  type SubscriptionSnapshot,
} from "@/lib/subscriptions";

const fileToOptimizedBlob = (file: File, maxSize = 512): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process selected image"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Could not process selected image"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          0.86,
        );
      };
      img.onerror = () => reject(new Error("Invalid image file"));
      img.src = String(reader.result ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read selected image"));
    reader.readAsDataURL(file);
  });
};

type ProfileTab = "plans" | "insights";

export const Route = createFileRoute("/profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      typeof search.tab === "string" && ["plans", "insights"].includes(search.tab)
        ? (search.tab as ProfileTab)
        : undefined,
  }),
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Your space — RealTalk" }] }),
});

type Plan = { id: string; title: string; content: string; created_at: string };
type Insight = {
  id: string;
  week_start: string;
  emotion_trend: string;
  thought_patterns: string;
  calm_progress: string;
  overthinking_reduction: string;
  ai_help_summary: string;
  what_worked: string;
  what_didnt: string;
  response_patterns: string;
  boundary_respect: string;
  updated_at: string;
};

type EditablePlanDraft = { title: string; content: string };
type MemoryProfile = { preference_notes: string | null; comfort_boundaries: string[] | null };
type BillingCycle = "monthly" | "annual";
type ScheduleItem = {
  id: string;
  title: string;
  notes: string;
  starts_at: string;
  ends_at: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
};

type LearningAttempt = {
  id: string;
  attempted_at: string;
  outcome: "changed" | "skipped";
  skip_reason: string | null;
  confidence: number | null;
  extracted_summary: Record<string, string> | null;
  message_count: number | null;
};

const SUBSCRIPTION_FEATURE_LABELS: Record<MeteredFeature, string> = {
  deep_thinking: "Deep Thinking",
  plan: "Plan Mode",
  gmail_send: "Gmail send",
  voice_input: "Voice input",
  journal_save: "Journal saves",
};

const getUtcWeekStart = (): string => {
  const now = new Date();
  const day = now.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  now.setUTCDate(now.getUTCDate() - diffToMonday);
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
};

const isWednesdayUtc = (): boolean => new Date().getUTCDay() === 3;

const planPreviewText = (content: string, maxChars = 140): string => {
  const cleaned = content
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars).trimEnd()}…`;
};

const toLocalInputDateTime = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toSafeFilename = (value: string) =>
  value
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "plan";

function ProfilePage() {
  const { user, session, loading, signOut, connectGoogleForGmail } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: ProfileTab };
  const [tab, setTab] = useState<ProfileTab>(search?.tab ?? "plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);
  const [planDraft, setPlanDraft] = useState<EditablePlanDraft | null>(null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isSavingPlanEdit, setIsSavingPlanEdit] = useState(false);
  const [insightMonitoringEnabled, setInsightMonitoringEnabled] = useState(false);
  const [weeklyEmailEnabled, setWeeklyEmailEnabled] = useState(false);
  const [scheduleEmailRemindersEnabled, setScheduleEmailRemindersEnabled] = useState(false);
  const [scheduleReminderMinutes, setScheduleReminderMinutes] = useState(30);
  const [scheduleReminderUseGmail, setScheduleReminderUseGmail] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [memoryProfile, setMemoryProfile] = useState<MemoryProfile | null>(null);
  const [brainOpen, setBrainOpen] = useState(false);
  const [quickCalendarOpen, setQuickCalendarOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [scheduleEditingId, setScheduleEditingId] = useState<string | null>(null);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleEndsAt, setScheduleEndsAt] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [learningAttempts, setLearningAttempts] = useState<LearningAttempt[]>([]);
  const [subscriptionSnapshot, setSubscriptionSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [planUpdateBusy, setPlanUpdateBusy] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [earlyInsight, setEarlyInsight] = useState<Partial<Insight> | null>(null);
  const [earlyInsightBusy, setEarlyInsightBusy] = useState(false);
  const alreadyGeneratedEarlyInsight =
    typeof window !== "undefined"
      ? localStorage.getItem(`early_insight_${typeof user !== "undefined" ? (user as any)?.id : ""}_${getUtcWeekStart()}`) === "1"
      : false;
  const [autoPdfEnabled, setAutoPdfEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("autoPdfSave") !== "false";
    }
    return true;
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  const refreshSubscription = async () => {
    if (!user) {
      setSubscriptionSnapshot(null);
      return null;
    }

    const snapshot = await loadSubscriptionSnapshot(user.id);
    setSubscriptionSnapshot(snapshot);
    return snapshot;
  };

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

  const planLabel = subscriptionSnapshot?.plan
    ? subscriptionSnapshot.plan.charAt(0).toUpperCase() + subscriptionSnapshot.plan.slice(1)
    : "Loading";

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

  useEffect(() => {
    if (!user) {
      setSubscriptionSnapshot(null);
      return;
    }

    void refreshSubscription();
  }, [user]);

  useEffect(() => {
    if (search?.tab && search.tab !== tab) {
      setTab(search.tab);
    }
  }, [search?.tab, tab]);

  useEffect(() => {
    if (!user) return;
    const initialName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "";
    setDisplayName(initialName);
    setPendingName(initialName);
    const localAvatar =
      typeof window !== "undefined" ? localStorage.getItem(`avatar_local_${user.id}`) || "" : "";
    const rawAvatar = (user.user_metadata?.avatar_url as string | undefined) || "";
    const remoteAvatar = rawAvatar.startsWith("data:") ? "" : rawAvatar;
    setAvatarDataUrl(remoteAvatar || localAvatar);

    const loadPlans = async () => {
      const { data } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false });
      setPlans(data ?? []);
    };

    const loadInsightSettings = async () => {
      const { data } = await supabase
        .from("user_insight_settings")
        .select("monitor_enabled, weekly_email_enabled, schedule_email_reminders_enabled, schedule_email_reminder_minutes, schedule_email_use_gmail")
        .eq("user_id", user.id)
        .maybeSingle();
      setInsightMonitoringEnabled(Boolean(data?.monitor_enabled));
      setWeeklyEmailEnabled(Boolean(data?.weekly_email_enabled));
      setScheduleEmailRemindersEnabled(Boolean(data?.schedule_email_reminders_enabled));
      setScheduleReminderMinutes(Number(data?.schedule_email_reminder_minutes ?? 30));
      setScheduleReminderUseGmail(Boolean(data?.schedule_email_use_gmail));
    };

    const loadInsights = async () => {
      const { data } = await supabase
        .from("user_weekly_insights")
        .select(
          "id,week_start,emotion_trend,thought_patterns,calm_progress,overthinking_reduction,ai_help_summary,what_worked,what_didnt,response_patterns,boundary_respect,updated_at",
        )
        .order("week_start", { ascending: false })
        .order("updated_at", { ascending: false });
      setInsights(data ?? []);
    };

    const loadMemoryProfile = async () => {
      const { data } = await supabase
        .from("user_memory_profiles")
        .select("preference_notes,comfort_boundaries")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setMemoryProfile(data as MemoryProfile);
    };

    const loadSchedules = async () => {
      const { data } = await supabase
        .from("user_schedules")
        .select("id,title,notes,starts_at,ends_at,is_completed,created_at,updated_at")
        .eq("user_id", user.id)
        .order("starts_at", { ascending: true });
      setSchedules((data as ScheduleItem[] | null) ?? []);
    };

    const loadLearningAttempts = async () => {
      const { data } = await (supabase as any)
        .from("user_learning_attempts")
        .select("id,attempted_at,outcome,skip_reason,confidence,extracted_summary,message_count")
        .eq("user_id", user.id)
        .order("attempted_at", { ascending: false })
        .limit(30);
      setLearningAttempts((data as LearningAttempt[] | null) ?? []);
    };

    void loadPlans();
    void loadInsightSettings();
    void loadInsights();
    void loadMemoryProfile();
    void loadSchedules();
    void loadLearningAttempts();

    const channel = supabase
      .channel(`profile-sync-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plans", filter: `user_id=eq.${user.id}` },
        () => void loadPlans(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_insight_settings", filter: `user_id=eq.${user.id}` },
        () => void loadInsightSettings(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_weekly_insights",
          filter: `user_id=eq.${user.id}`,
        },
        () => void loadInsights(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_memory_profiles",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as MemoryProfile | null;
          if (row) setMemoryProfile(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_schedules",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void supabase
            .from("user_schedules")
            .select("id,title,notes,starts_at,ends_at,is_completed,created_at,updated_at")
            .eq("user_id", user.id)
            .order("starts_at", { ascending: true })
            .then(({ data }) => setSchedules((data as ScheduleItem[] | null) ?? []));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user || !insightMonitoringEnabled || tab !== "insights") return;

    const now = new Date();
    const isFriday = now.getUTCDay() === 5;
    if (!isFriday) return;

    const weekStart = getUtcWeekStart();
    const runKey = `insights_generated_${user.id}_${weekStart}`;
    if (typeof window !== "undefined" && localStorage.getItem(runKey) === "1") return;

    const run = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        const insightsUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/insights`;

        const resp = await fetch(insightsUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ userId: user.id }),
        });

        if (!resp.ok) throw new Error("Failed to generate Friday insight");

        if (typeof window !== "undefined") {
          localStorage.setItem(runKey, "1");
        }
      } catch {
        // Silent fail: insights list still loads normally from stored rows.
      }
    };

    void run();
  }, [user, insightMonitoringEnabled, tab]);

  useEffect(() => {
    if (!user || !session || !weeklyEmailEnabled || insights.length === 0 || !user.email) return;

    const latest = insights[0];
    if (!latest?.week_start) return;

    const sendKey = `weekly_insight_email_${user.id}_${latest.week_start}`;
    if (typeof window !== "undefined" && localStorage.getItem(sendKey) === "1") return;

    const run = async () => {
      try {
        const body = [
          `Weekly RealTalk insight for week of ${new Date(latest.week_start).toLocaleDateString()}`,
          "",
          `What worked: ${latest.what_worked}`,
          `What didn't work: ${latest.what_didnt}`,
          `Your response pattern: ${latest.response_patterns}`,
          `Boundary comfort check: ${latest.boundary_respect}`,
          "",
          `Emotion trend: ${latest.emotion_trend}`,
          `Thought patterns: ${latest.thought_patterns}`,
          `Calm progress: ${latest.calm_progress}`,
          `Overthinking reduction: ${latest.overthinking_reduction}`,
          `How RealTalk helped: ${latest.ai_help_summary}`,
        ].join("\n");

        const { error } = await supabase.functions.invoke("gmail-send", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          },
          body: {
            to: user.email,
            subject: `Your RealTalk weekly insight (${latest.week_start})`,
            body,
            googleAccessToken: session.provider_token ?? null,
          },
        });

        if (error) {
          const json = await error.context?.json?.().catch(() => ({}));
          throw new Error(json?.error || error.message || "Failed to send weekly insight email");
        }

        if (typeof window !== "undefined") {
          localStorage.setItem(sendKey, "1");
        }
      } catch {
        // Silent fail: insights remain available in-app.
      }
    };

    void run();
  }, [user, session, weeklyEmailEnabled, insights]);

  if (!user) return null;

  const generateEarlyInsight = async () => {
    if (!user || !session) return;
    setEarlyInsightBusy(true);
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/insights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId: user.id, force: true }),
        },
      );
      if (!resp.ok) throw new Error("Failed to generate early insight");

      // Fetch the freshly generated row
      const { data } = await supabase
        .from("user_weekly_insights")
        .select("emotion_trend,thought_patterns,calm_progress")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) setEarlyInsight(data);
      if (typeof window !== "undefined") {
        localStorage.setItem(`early_insight_${user.id}_${getUtcWeekStart()}`, "1");
      }
      toast.success("Early insight generated");
    } catch {
      toast.error("Could not generate early insight. Try again later.");
    } finally {
      setEarlyInsightBusy(false);
    }
  };

  const deletePlan = async (id: string) => {
    await supabase.from("plans").delete().eq("id", id);
    setPlans((p) => p.filter((x) => x.id !== id));
    setOpenPlan(null);
    toast.success("Plan removed");
  };

  const openPlanModal = (plan: Plan) => {
    setOpenPlan(plan);
    setPlanDraft({ title: plan.title, content: plan.content });
    setIsEditingPlan(false);
  };

  const closePlanModal = () => {
    setOpenPlan(null);
    setPlanDraft(null);
    setIsEditingPlan(false);
  };

  const downloadPlanAsPdf = (plan: Plan) => {
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const maxTextWidth = pageWidth - margin * 2;
      let cursorY = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      const titleLines = doc.splitTextToSize(plan.title || "Plan", maxTextWidth);
      doc.text(titleLines, margin, cursorY);
      cursorY += titleLines.length * 20;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const bodyLines = doc.splitTextToSize(plan.content || "", maxTextWidth);

      for (const line of bodyLines) {
        if (cursorY > pageHeight - margin) {
          doc.addPage();
          cursorY = margin;
        }
        doc.text(line, margin, cursorY);
        cursorY += 16;
      }

      doc.save(`${toSafeFilename(plan.title)}.pdf`);
      toast.success("Plan downloaded as PDF");
    } catch {
      toast.error("Could not generate PDF");
    }
  };

  const downloadPlanAsWord = async (plan: Plan) => {
    try {
      const paragraphs: Paragraph[] = [
        new Paragraph({
          children: [new TextRun({ text: plan.title || "Plan", bold: true, size: 32 })],
          spacing: { after: 240 },
        }),
      ];

      const lines = (plan.content || "").split(/\r?\n/);
      for (const line of lines) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: line || " " })],
            spacing: { after: 120 },
          }),
        );
      }

      const doc = new Document({ sections: [{ children: paragraphs }] });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const element = document.createElement("a");
      element.setAttribute("href", url);
      element.setAttribute("download", `${toSafeFilename(plan.title)}.docx`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      URL.revokeObjectURL(url);
      toast.success("Plan downloaded as Word document");
    } catch {
      toast.error("Could not generate Word document");
    }
  };

  const savePlanEdits = async () => {
    if (!openPlan || !planDraft) return;

    const nextTitle = planDraft.title.trim() || "Untitled plan";
    const nextContent = planDraft.content.trim();
    if (!nextContent) {
      toast.error("Plan content cannot be empty");
      return;
    }

    setIsSavingPlanEdit(true);
    const { error } = await supabase
      .from("plans")
      .update({ title: nextTitle, content: nextContent })
      .eq("id", openPlan.id)
      .eq("user_id", user.id);
    setIsSavingPlanEdit(false);

    if (error) {
      toast.error("Failed to save plan changes");
      return;
    }

    setPlans((prev) => prev.map((plan) => (plan.id === openPlan.id ? { ...plan, title: nextTitle, content: nextContent } : plan)));
    setOpenPlan((prev) => (prev ? { ...prev, title: nextTitle, content: nextContent } : prev));
    setPlanDraft({ title: nextTitle, content: nextContent });
    setIsEditingPlan(false);
    toast.success("Plan updated");
  };

  const toggleAutoPdf = (enabled: boolean) => {
    setAutoPdfEnabled(enabled);
    localStorage.setItem("autoPdfSave", enabled ? "true" : "false");
    toast.success(enabled ? "PDF auto-save enabled" : "PDF auto-save disabled");
  };

  const toggleInsightMonitoring = async (enabled: boolean) => {
    if (!user) return;
    setInsightMonitoringEnabled(enabled);

    const { error } = await supabase.from("user_insight_settings").upsert({
      user_id: user.id,
      monitor_enabled: enabled,
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setInsightMonitoringEnabled(!enabled);
      toast.error("Failed to update insight monitoring setting");
      return;
    }

    toast.success(enabled ? "Weekly insights monitoring enabled" : "Weekly insights monitoring disabled");
  };

  const toggleWeeklyEmail = async (enabled: boolean) => {
    if (!user) return;
    setWeeklyEmailEnabled(enabled);

    const { error } = await supabase.from("user_insight_settings").upsert({
      user_id: user.id,
      monitor_enabled: insightMonitoringEnabled,
      weekly_email_enabled: enabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setWeeklyEmailEnabled(!enabled);
      toast.error("Failed to update weekly email setting");
      return;
    }

    toast.success(enabled ? "Weekly insight email enabled" : "Weekly insight email disabled");
  };

  const toggleScheduleEmailReminders = async (enabled: boolean) => {
    if (!user) return;

    setScheduleEmailRemindersEnabled(enabled);

    const { error } = await supabase.from("user_insight_settings").upsert({
      user_id: user.id,
      monitor_enabled: insightMonitoringEnabled,
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: enabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setScheduleEmailRemindersEnabled(!enabled);
      toast.error("Failed to update schedule reminder setting");
      return;
    }

    toast.success(enabled ? "Schedule email reminders enabled" : "Schedule email reminders disabled");
  };

  const changeScheduleReminderMinutes = async (value: string) => {
    if (!user) return;
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 180) return;

    const previous = scheduleReminderMinutes;
    setScheduleReminderMinutes(minutes);

    const { error } = await supabase.from("user_insight_settings").upsert({
      user_id: user.id,
      monitor_enabled: insightMonitoringEnabled,
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: minutes,
      schedule_email_use_gmail: scheduleReminderUseGmail,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setScheduleReminderMinutes(previous);
      toast.error("Failed to update reminder lead time");
      return;
    }

    toast.success(`Reminders will be sent ${minutes} minutes before schedule time`);
  };

  const toggleScheduleReminderChannel = async (useGmail: boolean) => {
    if (!user) return;

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

    const { error } = await supabase.from("user_insight_settings").upsert({
      user_id: user.id,
      monitor_enabled: insightMonitoringEnabled,
      weekly_email_enabled: weeklyEmailEnabled,
      schedule_email_reminders_enabled: scheduleEmailRemindersEnabled,
      schedule_email_reminder_minutes: scheduleReminderMinutes,
      schedule_email_use_gmail: useGmail,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setScheduleReminderUseGmail(previous);
      toast.error("Failed to update reminder delivery channel");
      return;
    }

    toast.success(useGmail ? "Reminder channel set to Gmail" : "Reminder channel set to normal email");
  };

  const saveProfileIdentity = async (nameInput = displayName, avatarInput = avatarDataUrl) => {
    if (!user) return;
    const cleanName = nameInput.trim();
    if (!cleanName) {
      toast.error("Please enter a name");
      return;
    }

    const sanitizedAvatar = avatarInput.startsWith("data:") ? "" : avatarInput;

    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        full_name: cleanName,
        name: cleanName,
        avatar_url: sanitizedAvatar || null,
        avatar_data_url: null,
      },
    });

    if (error) {
      setSavingProfile(false);
      toast.error(error.message || "Failed to update profile");
      return;
    }

    await supabase.auth.refreshSession();
    const { data: verifiedUserData } = await supabase.auth.getUser();
    const verifiedUser = verifiedUserData.user;
    const verifiedName =
      (verifiedUser?.user_metadata?.full_name as string | undefined) ||
      (verifiedUser?.user_metadata?.name as string | undefined) ||
      "";
    const verifiedAvatar = (verifiedUser?.user_metadata?.avatar_url as string | undefined) || "";

    const namePersisted = verifiedName.trim() === cleanName;
    const avatarPersisted = (verifiedAvatar || "") === (sanitizedAvatar || "");
    setSavingProfile(false);

    if (!namePersisted || !avatarPersisted) {
      toast.error("Profile save could not be confirmed on backend. Please try again.");
      return;
    }

    setDisplayName(cleanName);
    setPendingName(cleanName);
    setAvatarDataUrl(sanitizedAvatar || "");
    if (sanitizedAvatar && typeof window !== "undefined" && user?.id) {
      localStorage.removeItem(`avatar_local_${user.id}`);
    }
    window.dispatchEvent(new CustomEvent("profileUpdated", {
      detail: { name: cleanName, avatarUrl: sanitizedAvatar || "" },
    }));
    toast.success("Profile updated");
  };

  const onAvatarSelected = async (file?: File | null) => {
    if (!file || !user) return;
    try {
      const avatarBlob = await fileToOptimizedBlob(file);
      const avatarPath = `${user.id}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(avatarPath, avatarBlob, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
      const nextAvatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      setAvatarDataUrl(nextAvatarUrl);
      await saveProfileIdentity(displayName, nextAvatarUrl);
    } catch (e: any) {
      toast.error(e?.message || "Could not upload selected image. Profile photo was not saved to backend.");
    }
  };

  const saveNameFromPencil = async () => {
    await saveProfileIdentity(pendingName, avatarDataUrl);
    setEditingName(false);
  };

  const resetScheduleForm = () => {
    setScheduleEditingId(null);
    setScheduleTitle("");
    setScheduleNotes("");
    setScheduleStartsAt("");
    setScheduleEndsAt("");
  };

  const beginEditSchedule = (item: ScheduleItem) => {
    setScheduleEditingId(item.id);
    setScheduleTitle(item.title);
    setScheduleNotes(item.notes || "");
    setScheduleStartsAt(toLocalInputDateTime(item.starts_at));
    setScheduleEndsAt(toLocalInputDateTime(item.ends_at));
  };

  const saveSchedule = async () => {
    if (!user) return;
    const snapshot = await refreshSubscription();
    if (snapshot && !hasFeatureAccess(snapshot.plan, "schedule")) {
      toast.error("Schedule is available on Pro and Platinum.");
      return;
    }
    const title = scheduleTitle.trim();
    if (!title) {
      toast.error("Please add a title");
      return;
    }
    if (!scheduleStartsAt) {
      toast.error("Please choose start date/time");
      return;
    }

    const startsAtIso = new Date(scheduleStartsAt).toISOString();
    const endsAtIso = scheduleEndsAt ? new Date(scheduleEndsAt).toISOString() : null;
    if (endsAtIso && new Date(endsAtIso).getTime() < new Date(startsAtIso).getTime()) {
      toast.error("End time must be after start time");
      return;
    }

    setScheduleSaving(true);
    const payload = {
      user_id: user.id,
      title,
      notes: scheduleNotes.trim(),
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      updated_at: new Date().toISOString(),
    };

    const req = scheduleEditingId
      ? supabase.from("user_schedules").update(payload).eq("id", scheduleEditingId).eq("user_id", user.id)
      : supabase.from("user_schedules").insert({ ...payload, is_completed: false });

    const { error } = await req;
    setScheduleSaving(false);

    if (error) {
      toast.error(error.message || "Failed to save schedule");
      return;
    }

    toast.success(scheduleEditingId ? "Schedule updated" : "Schedule added");
    resetScheduleForm();
  };

  const toggleScheduleCompleted = async (item: ScheduleItem) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_schedules")
      .update({ is_completed: !item.is_completed, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to update schedule");
      return;
    }
    toast.success(item.is_completed ? "Marked as pending" : "Marked as completed");
  };

  const deleteSchedule = async (itemId: string) => {
    if (!user) return;
    const { error } = await supabase.from("user_schedules").delete().eq("id", itemId).eq("user_id", user.id);
    if (error) {
      toast.error("Failed to delete schedule");
      return;
    }
    setSchedules((prev) => prev.filter((item) => item.id !== itemId));
    if (scheduleEditingId === itemId) resetScheduleForm();
    toast.success("Schedule deleted");
  };

  const clearAllSchedules = async () => {
    if (!user) return;
    if (schedules.length === 0) {
      toast.error("No schedules to clear");
      return;
    }

    const confirmed = window.confirm("Clear all schedules from your profile calendar?");
    if (!confirmed) return;

    const { error } = await supabase.from("user_schedules").delete().eq("user_id", user.id);
    if (error) {
      toast.error("Failed to clear schedules");
      return;
    }

    setSchedules([]);
    resetScheduleForm();
    toast.success("Calendar cleared");
  };

  const deleteAccount = async () => {
    if (!user) return;
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
      <div className="flex items-end justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="h-14 w-14 rounded-full bg-primary/20 overflow-hidden flex items-center justify-center text-primary text-sm font-semibold hover:bg-primary/30 transition-colors"
            title="Change profile photo"
          >
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              (displayName || user.email || "U")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join("")
            )}
          </button>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onAvatarSelected(e.target.files?.[0])}
          />

          <div>
            <div className="flex items-center gap-2">
              {editingName ? (
                <input
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  className="rounded-md border border-border bg-background/60 px-2 py-1 text-base outline-none focus:border-primary/60"
                />
              ) : (
                <h1 className="font-serif text-3xl tracking-tight">{displayName || "Your space"}</h1>
              )}

              {editingName ? (
                <>
                  <button
                    type="button"
                    onClick={() => void saveNameFromPencil()}
                    title="Save name"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingName(displayName);
                      setEditingName(false);
                    }}
                    title="Cancel"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/70 text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setEditingName(true)} title="Edit name">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
            <p className="text-xs text-muted-foreground mt-1">Subscription: {planLabel}</p>
          </div>
        </div>

        <div className="relative flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setQuickCalendarOpen((v) => !v)}
            title="Open schedule"
          >
            <CalendarDays className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut} disabled={savingProfile}>
            Sign out
          </Button>

          {quickCalendarOpen && (
            <div className="absolute right-0 top-10 z-20 w-[320px] rounded-xl border border-border bg-background/95 shadow-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold">Your schedule</div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => void clearAllSchedules()}
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {schedules.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No schedule yet.</p>
                ) : (
                  schedules.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-md border border-border/70 px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm">{item.title}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {new Date(item.starts_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={() => void deleteSchedule(item.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mb-6 -mx-1">
          {(["plans", "insights"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              navigate({
                to: "/profile",
                search: { tab: t === "plans" ? undefined : t },
                replace: true,
              });
            }}
            className={`px-4 py-2.5 text-sm capitalize transition-colors relative ${
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {tab === t && (
              <motion.div
                layoutId="tab-underline"
                className="absolute left-0 right-0 -bottom-px h-px bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      {tab === "plans" && (
        <div className="grid grid-cols-1 gap-3 content-start items-start">
          {plans.length === 0 && (
            <EmptyState text="No saved plans yet. After a meaningful answer in chat, tap “Save as Plan”." />
          )}
          {plans.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => openPlanModal(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openPlanModal(p);
                }
              }}
              className="w-full text-left rounded-xl border border-border bg-surface/60 hover:bg-surface-elevated transition-colors p-5 cursor-pointer"
            >
              <div className="m-0 font-serif text-lg leading-6">{p.title}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(p.created_at).toLocaleDateString()}
              </div>
              <p className="m-0 text-sm leading-5 text-muted-foreground mt-2 break-words">
                {planPreviewText(p.content)}
              </p>
            </div>
          ))}
        </div>
      )}
      {tab === "insights" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setBrainOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-elevated transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">RealTalk's brain</span>
                <span className="text-[11px] text-muted-foreground">What I've learned about you</span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                  brainOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {brainOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-border/50">
                  <BrainCard
                    userId={user.id}
                    profile={{
                      preference_notes: memoryProfile?.preference_notes ?? null,
                      comfort_boundaries: memoryProfile?.comfort_boundaries ?? null,
                    }}
                  />
                  <LearningAttemptLog attempts={learningAttempts} />
              </div>
            )}
          </div>

          {/* Early insight preview - Wednesdays only */}
          {insightMonitoringEnabled && (
            <div className="rounded-xl border border-border bg-surface/60 p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">Early insight preview</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {isWednesdayUtc()
                      ? alreadyGeneratedEarlyInsight
                        ? "Already generated this week"
                        : "Available every Wednesday — partial snapshot"
                      : "Available on Wednesdays only"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!isWednesdayUtc() || alreadyGeneratedEarlyInsight || earlyInsightBusy}
                  onClick={generateEarlyInsight}
                  className="shrink-0"
                >
                  {earlyInsightBusy ? "Generating…" : "Get early insight"}
                </Button>
              </div>
              {earlyInsight && (
                <div className="mt-4 space-y-3 text-sm border-t border-border/50 pt-4">
                  <div className="text-xs text-muted-foreground mb-2">
                    Partial snapshot — full breakdown arrives Friday
                  </div>
                  <InsightRow title="Emotion trend" value={String(earlyInsight.emotion_trend ?? "")} />
                  <InsightRow title="Thought patterns" value={String(earlyInsight.thought_patterns ?? "")} />
                  <InsightRow title="Calm progress" value={String(earlyInsight.calm_progress ?? "")} />
                </div>
              )}
            </div>
          )}

          {insights.length === 0 && (
            <EmptyState text="No weekly insights yet. Insights are generated every Friday based on this week’s chats." />
          )}
          {insights.length > 0 && (() => {
            const [latest, ...older] = insights;
            return (
              <>
                <div className="rounded-xl border border-border bg-surface/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Week of {new Date(latest.week_start).toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">This week’s analysis</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">Updated every Friday</div>
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    <InsightRow title="Emotion trend" value={latest.emotion_trend} />
                    <InsightRow title="Thought patterns" value={latest.thought_patterns} />
                    <InsightRow title="Calm progress" value={latest.calm_progress} />
                    <InsightRow title="Overthinking reduction" value={latest.overthinking_reduction} />
                    <InsightRow title="How RealTalk helped" value={latest.ai_help_summary} />
                    <InsightRow title="What worked" value={latest.what_worked} />
                    <InsightRow title="What didn’t work" value={latest.what_didnt} />
                    <InsightRow title="Your response pattern" value={latest.response_patterns} />
                    <InsightRow title="Boundary comfort" value={latest.boundary_respect} />
                  </div>
                </div>
                {older.length > 0 && <InsightHistory insights={older} />}
              </>
            );
          })()}
        </div>
      )}

      {openPlan && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closePlanModal}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-border rounded-2xl max-w-xl w-full max-h-[80vh] overflow-y-auto p-7"
          >
            {isEditingPlan && planDraft ? (
              <>
                <input
                  value={planDraft.title}
                  onChange={(e) => setPlanDraft({ ...planDraft, title: e.target.value })}
                  className="w-full bg-transparent font-serif text-2xl mb-4 outline-none border-b border-border/70 pb-2"
                />
                <textarea
                  value={planDraft.content}
                  onChange={(e) => setPlanDraft({ ...planDraft, content: e.target.value })}
                  className="w-full min-h-[320px] resize-y rounded-xl border border-border bg-background/40 p-4 text-sm outline-none focus:border-primary/60"
                />
              </>
            ) : (
              <>
                <h2 className="font-serif text-2xl mb-4">{openPlan.title}</h2>
                <div className="prose-realtalk">
                  <ReactMarkdown>{openPlan.content}</ReactMarkdown>
                </div>
              </>
            )}
            <div className="flex justify-between mt-6 pt-4 border-t border-border">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => deletePlan(openPlan.id)}>
                  Delete
                </Button>
                {isEditingPlan ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={savePlanEdits} disabled={isSavingPlanEdit}>
                      {isSavingPlanEdit ? "Saving..." : "Save changes"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPlanDraft({ title: openPlan.title, content: openPlan.content });
                        setIsEditingPlan(false);
                      }}
                      disabled={isSavingPlanEdit}
                    >
                      Cancel edit
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPlanDraft({ title: openPlan.title, content: openPlan.content });
                      setIsEditingPlan(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadPlanAsPdf(isEditingPlan && planDraft ? { ...openPlan, ...planDraft } : openPlan)}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void downloadPlanAsWord(isEditingPlan && planDraft ? { ...openPlan, ...planDraft } : openPlan)}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export Word
                </Button>
              </div>
              <Button variant="secondary" size="sm" onClick={closePlanModal}>
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function InsightRow({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <p className="mt-1 text-foreground/90">{value}</p>
    </div>
  );
}

function parsePreferenceNotes(notes: string | null): Record<string, string> {
  if (!notes) return {};
  const result: Record<string, string> = {};

  const normalizeKey = (key: string): string => {
    const k = key.trim().toLowerCase().replace(/\s+/g, " ");
    if (k === "interests") return "interests";
    if (k === "communication style" || k === "communication_style" || k === "style") return "communication_style";
    if (k === "life context" || k === "life_context") return "life_context";
    if (k === "positive signals" || k === "positive_signals") return "positive_signals";
    return k.replace(/\s+/g, "_");
  };

  notes
    .split(/\n|\|/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const idx = part.indexOf(":");
      if (idx === -1) return;
      const key = normalizeKey(part.slice(0, idx));
      const val = part.slice(idx + 1).trim();
      if (key && val) result[key] = val;
    });

  return result;
}

function BrainCard({
  userId,
  profile,
}: {
  userId: string;
  profile: { preference_notes: string | null; comfort_boundaries: string[] | null };
}) {
  const fields = parsePreferenceNotes(profile.preference_notes);
  const interests = fields.interests ? fields.interests.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const positiveSignals = fields.positive_signals ? fields.positive_signals.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const boundaries = Array.isArray(profile.comfort_boundaries)
    ? profile.comfort_boundaries
        .map((b: any) => (typeof b === "string" ? b : String(b?.note ?? "")).trim())
        .filter(Boolean)
    : [];
  const scoreInterests = Math.min(interests.length / 8, 1);
  const scoreStyle = fields.communication_style ? 1 : 0;
  const scoreContext = fields.life_context ? 1 : 0;
  const scoreSignals = Math.min(positiveSignals.length / 6, 1);
  const scoreBoundaries = Math.min(boundaries.length / 5, 1);

  const rawGrowth = Math.round(
    ((scoreInterests + scoreStyle + scoreContext + scoreSignals + scoreBoundaries) / 5) * 100,
  );

  const [growth, setGrowth] = useState(0.5);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = `brain_growth_v3_${userId}`;
    const signatureKey = `brain_growth_sig_v3_${userId}`;

    const signature = JSON.stringify({
      i: interests,
      s: fields.communication_style ?? "",
      c: fields.life_context ?? "",
      p: positiveSignals,
      b: boundaries,
    });

    const previous = Number(localStorage.getItem(storageKey) || "0.5");
    const previousSig = localStorage.getItem(signatureKey) || "";
    const hasMeaningfulUpdate = previousSig !== signature;
    const clampedPrevious = Number.isFinite(previous) ? Math.max(0.5, previous) : 0.5;

    let next = clampedPrevious;
    if (rawGrowth > clampedPrevious && hasMeaningfulUpdate) {
      // Grow very slowly: only when new profile signals are learned, with small fractional steps.
      const gap = rawGrowth - clampedPrevious;
      const step = Math.min(1.2, Math.max(0.5, gap / 120));
      next = Math.min(rawGrowth, clampedPrevious + step);
    }

    const roundedNext = Number(next.toFixed(1));

    localStorage.setItem(storageKey, String(roundedNext));
    localStorage.setItem(signatureKey, signature);
    setGrowth(roundedNext);
  }, [
    userId,
    rawGrowth,
    fields.communication_style,
    fields.life_context,
    interests,
    positiveSignals,
    boundaries,
  ]);

  const growthDrivers = [
    {
      label: "Interests learned",
      value: interests.length,
      score: scoreInterests,
      hint: "More recurring interests increase memory depth.",
    },
    {
      label: "Communication style clarity",
      value: fields.communication_style ? 1 : 0,
      score: scoreStyle,
      hint: "When your preferred tone is clear, adaptation improves.",
    },
    {
      label: "Life context awareness",
      value: fields.life_context ? 1 : 0,
      score: scoreContext,
      hint: "Current life context helps RealTalk respond better.",
    },
    {
      label: "Positive response signals",
      value: positiveSignals.length,
      score: scoreSignals,
      hint: "What resonates with you strengthens the pattern map.",
    },
    {
      label: "Boundary awareness",
      value: boundaries.length,
      score: scoreBoundaries,
      hint: "Comfort boundaries make support safer and smarter.",
    },
  ];

  const neuronMeta = [
    {
      title: "Interests learned",
      score: scoreInterests,
      value: `${interests.length} interests mapped`,
      hint: "Recurring interests deepen memory depth and long-term personalization.",
    },
    {
      title: "Communication style",
      score: scoreStyle,
      value: fields.communication_style ? "Style identified" : "Style still emerging",
      hint: "The clearer your tone preferences are, the better RealTalk adapts responses.",
    },
    {
      title: "Life context",
      score: scoreContext,
      value: fields.life_context ? "Context identified" : "Context still emerging",
      hint: "Knowing your real-world context helps with relevance and timing.",
    },
    {
      title: "Positive signals",
      score: scoreSignals,
      value: `${positiveSignals.length} positive cues detected`,
      hint: "Signals from good moments teach RealTalk what works best for you.",
    },
    {
      title: "Boundary awareness",
      score: scoreBoundaries,
      value: `${boundaries.length} comfort boundaries tracked`,
      hint: "Boundary memory improves emotional safety and respect over time.",
    },
    {
      title: "Pattern linking",
      score: (scoreInterests + scoreSignals) / 2,
      value: "Interests + response resonance",
      hint: "This neuron connects what you care about to what helps you most.",
    },
    {
      title: "Adaptive tone balance",
      score: (scoreStyle + scoreContext) / 2,
      value: "Style + context fusion",
      hint: "This neuron tunes tone based on both how you talk and what you're facing.",
    },
    {
      title: "Safety calibration",
      score: (scoreContext + scoreBoundaries) / 2,
      value: "Context + boundaries alignment",
      hint: "This neuron helps RealTalk support you without crossing comfort lines.",
    },
  ];

  const [selectedNeuron, setSelectedNeuron] = useState<number | null>(null);

  const progressMultiplier = Math.max(0.08, growth / 100);

  const nodePower = [
    scoreInterests,
    scoreStyle,
    scoreContext,
    scoreSignals,
    scoreBoundaries,
    (scoreInterests + scoreSignals) / 2,
    (scoreStyle + scoreContext) / 2,
    (scoreContext + scoreBoundaries) / 2,
  ];

  const dotPositions = [
    { x: 28, y: 42 },
    { x: 39, y: 28 },
    { x: 52, y: 25 },
    { x: 65, y: 32 },
    { x: 72, y: 47 },
    { x: 61, y: 58 },
    { x: 46, y: 55 },
    { x: 34, y: 55 },
  ];

  const connectionPaths = [
    "M28 42 C34 31 42 28 52 25",
    "M39 28 C50 35 55 25 65 32",
    "M52 25 C63 34 70 38 72 47",
    "M28 42 C35 49 39 54 46 55",
    "M34 55 C45 45 52 50 61 58",
    "M46 55 C56 51 63 55 72 47",
    "M39 28 C37 41 34 47 34 55",
    "M65 32 C60 43 58 50 61 58",
  ];

  const foldPaths = [
    "M23 40 C20 31 26 24 35 25 C39 17 51 17 56 24 C66 19 78 27 77 39",
    "M27 42 C31 35 38 35 40 42 C44 32 55 33 56 43 C60 36 69 38 71 46",
    "M31 54 C38 51 41 45 38 39",
    "M46 58 C51 51 50 44 45 39",
    "M59 58 C58 50 63 45 70 46",
    "M53 25 C50 34 54 39 62 41",
    "M35 25 C36 32 32 37 25 39",
  ];

  const brainScale = 0.88 + Math.min(growth, 100) / 850;

  return (
    <div className="pt-4">
      <div className="rounded-xl border border-border/50 bg-background/35 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground">Neural growth</div>
          <div className="text-sm font-semibold text-primary">{growth.toFixed(1)}%</div>
        </div>

        <div className="relative mx-auto w-full max-w-[360px] aspect-[2/1.12] rounded-xl bg-primary/[0.04] border border-primary/10 overflow-hidden">
          <motion.svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 70"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            animate={{ scale: brainScale }}
            transition={{ duration: 14, ease: "easeInOut" }}
          >
            <defs>
              <radialGradient id="brainGlow" cx="50%" cy="48%" r="48%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="72%" stopColor="currentColor" stopOpacity="0.07" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path
              d="M20 42 C15 36 17 27 25 25 C27 16 39 13 47 18 C55 10 68 16 69 25 C80 25 87 35 83 46 C87 55 78 62 69 59 C64 67 51 66 47 59 C38 65 25 60 27 51 C21 51 17 47 20 42 Z"
              className="text-primary"
              fill="url(#brainGlow)"
            />
            <motion.path
              d="M20 42 C15 36 17 27 25 25 C27 16 39 13 47 18 C55 10 68 16 69 25 C80 25 87 35 83 46 C87 55 78 62 69 59 C64 67 51 66 47 59 C38 65 25 60 27 51 C21 51 17 47 20 42 Z"
              className="text-primary/45"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: Math.max(0.14, progressMultiplier) }}
              transition={{ duration: 8, ease: "easeInOut" }}
            />
            <g stroke="currentColor" className="text-primary/25" strokeWidth="0.75" fill="none" strokeLinecap="round">
              {foldPaths.map((path, idx) => (
                <motion.path
                  key={path}
                  d={path}
                  initial={{ pathLength: 0, opacity: 0.15 }}
                  animate={{
                    pathLength: Math.min(1, Math.max(0.08, progressMultiplier + idx * 0.025)),
                    opacity: 0.22 + progressMultiplier * 0.32,
                  }}
                  transition={{ duration: 10 + idx * 0.6, ease: "easeInOut" }}
                />
              ))}
            </g>
            <g stroke="currentColor" className="text-primary/35" strokeWidth="0.65" fill="none" strokeLinecap="round">
              {connectionPaths.map((path, idx) => (
                <motion.path
                  key={path}
                  d={path}
                  initial={{ pathLength: 0, opacity: 0.12 }}
                  animate={{
                    pathLength: Math.min(1, Math.max(0.1, (nodePower[idx] ?? 0.2) * progressMultiplier + 0.08)),
                    opacity: 0.18 + Math.min(0.38, (nodePower[idx] ?? 0.2) * 0.38),
                  }}
                  transition={{ duration: 12 + idx * 0.7, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                />
              ))}
            </g>
          </motion.svg>

          {dotPositions.map((p, idx) => {
            const power = Math.max(0.08, Math.min(1, (nodePower[idx] ?? 0) * progressMultiplier));
            const active = selectedNeuron === idx;
            return (
              <motion.button
                key={`${p.x}-${p.y}-${idx}`}
                type="button"
                aria-label={`Open neuron: ${neuronMeta[idx]?.title ?? `Neuron ${idx + 1}`}`}
                onClick={() => setSelectedNeuron((prev) => (prev === idx ? null : idx))}
                className="absolute rounded-full bg-primary border border-transparent hover:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/60"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: `${8 + power * 10}px`,
                  height: `${8 + power * 10}px`,
                  transform: "translate(-50%, -50%)",
                  opacity: active ? 1 : 0.18 + power * 0.82,
                  boxShadow: active
                    ? "0 0 22px rgba(59,130,246,0.75)"
                    : `0 0 ${8 + power * 14}px rgba(59,130,246,${0.2 + power * 0.35})`,
                }}
                animate={{ scale: [1, 1 + power * 0.16, 1], opacity: active ? 1 : [0.35 + power * 0.45, 0.5 + power * 0.5, 0.35 + power * 0.45] }}
                transition={{ duration: 8 + idx * 0.7, repeat: Infinity, ease: "easeInOut", delay: idx * 0.35 }}
              />
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {[scoreInterests, scoreStyle, scoreContext, scoreSignals, scoreBoundaries].map((s, idx) => (
            <div key={idx} className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(s * Math.max(0.12, growth / 100) * 100)}%` }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.08 * idx }}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tap a neuron to inspect growth</div>
          {selectedNeuron !== null && neuronMeta[selectedNeuron] && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-border/40 bg-background/40 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-foreground font-medium">{neuronMeta[selectedNeuron].title}</div>
                <div className="text-xs text-primary">
                  +{Math.round(neuronMeta[selectedNeuron].score * Math.max(0.12, growth / 100) * 100)}%
                </div>
              </div>
              <div className="mt-1 text-xs text-foreground/85">{neuronMeta[selectedNeuron].value}</div>
              <div className="mt-2 h-1.5 rounded-full bg-primary/10 overflow-hidden">
                <motion.div
                  className="h-full bg-primary/70"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(neuronMeta[selectedNeuron].score * Math.max(0.12, growth / 100) * 100)}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                />
              </div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">{neuronMeta[selectedNeuron].hint}</div>
            </motion.div>
          )}
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Brain growth is intentionally slow. RealTalk increases this as it learns consistent patterns over time.
        </p>
      </div>
    </div>
  );
}


function InsightHistory({ insights }: { insights: Insight[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/50 bg-surface/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-surface-elevated transition-colors"
      >
        <span className="text-sm text-muted-foreground">Previous weeks ({insights.length})</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="divide-y divide-border/40 border-t border-border/40">
          {insights.map((insight) => (
            <div key={insight.id} className="px-5 py-4">
              <div className="text-xs font-semibold text-muted-foreground mb-3">
                Week of {new Date(insight.week_start).toLocaleDateString()}
              </div>
              <div className="space-y-3 text-sm">
                <InsightRow title="Emotion trend" value={insight.emotion_trend} />
                <InsightRow title="Thought patterns" value={insight.thought_patterns} />
                <InsightRow title="Calm progress" value={insight.calm_progress} />
                <InsightRow title="Overthinking reduction" value={insight.overthinking_reduction} />
                <InsightRow title="How RealTalk helped" value={insight.ai_help_summary} />
                <InsightRow title="What worked" value={insight.what_worked} />
                <InsightRow title="What didn’t work" value={insight.what_didnt} />
                <InsightRow title="Your response pattern" value={insight.response_patterns} />
                <InsightRow title="Boundary comfort" value={insight.boundary_respect} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LearningAttemptLog({ attempts }: { attempts: LearningAttempt[] }) {
  if (attempts.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-background/20 px-5 py-6 text-center text-xs text-muted-foreground">
        No learning attempts yet. They'll appear here after your next chat session.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-background/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Learning attempt log</div>
        <div className="text-[11px] text-muted-foreground">last {attempts.length}</div>
      </div>
      <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
        {attempts.map((a) => {
          const summary = a.extracted_summary;
          const summaryParts = summary
            ? Object.entries(summary)
                .filter(([k, v]) => k !== "confidence" && String(v).trim())
                .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v).slice(0, 60)}`)
            : [];
          return (
            <div key={a.id} className="px-4 py-2.5 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      a.outcome === "changed"
                        ? "bg-green-500/15 text-green-600"
                        : "bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {a.outcome}
                  </span>
                  {a.skip_reason && (
                    <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                      {a.skip_reason}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  {a.confidence !== null && (
                    <span className="text-[11px] text-muted-foreground">
                      conf: {Math.round(a.confidence * 100)}%
                    </span>
                  )}
                  {a.message_count !== null && (
                    <span className="text-[11px] text-muted-foreground">{a.message_count} msgs</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(a.attempted_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              {summaryParts.length > 0 && (
                <div className="text-[11px] text-muted-foreground/70 truncate">
                  {summaryParts.join(" · ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
