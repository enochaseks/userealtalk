import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Check, Download, Pencil, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const fileToDataUrl = (file: File, maxSize = 256): Promise<string> => {
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
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Invalid image file"));
      img.src = String(reader.result ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read selected image"));
    reader.readAsDataURL(file);
  });
};

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Your space — RealTalk" }] }),
});

type Plan = { id: string; title: string; content: string; created_at: string };
type Conv = { id: string; title: string; updated_at: string };
type Insight = {
  id: string;
  conversation_id: string;
  week_start: string;
  emotion_trend: string;
  thought_patterns: string;
  calm_progress: string;
  overthinking_reduction: string;
  ai_help_summary: string;
  updated_at: string;
};

type EditablePlanDraft = { title: string; content: string };

function ProfilePage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"plans" | "chats" | "insights" | "settings">("plans");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [convs, setConvs] = useState<Conv[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [openPlan, setOpenPlan] = useState<Plan | null>(null);
  const [planDraft, setPlanDraft] = useState<EditablePlanDraft | null>(null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isSavingPlanEdit, setIsSavingPlanEdit] = useState(false);
  const [insightMonitoringEnabled, setInsightMonitoringEnabled] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [autoPdfEnabled, setAutoPdfEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("autoPdfSave") !== "false";
    }
    return true;
  });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    const initialName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      "";
    setDisplayName(initialName);
    setPendingName(initialName);
    setAvatarDataUrl(
      (user.user_metadata?.avatar_url as string | undefined) ||
      (user.user_metadata?.avatar_data_url as string | undefined) ||
      "",
    );

    supabase
      .from("plans")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPlans(data ?? []));
    supabase
      .from("conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .then(({ data }) => setConvs(data ?? []));

    supabase
      .from("user_insight_settings")
      .select("monitor_enabled")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setInsightMonitoringEnabled(Boolean(data?.monitor_enabled)));

    supabase
      .from("conversation_weekly_insights")
      .select(
        "id,conversation_id,week_start,emotion_trend,thought_patterns,calm_progress,overthinking_reduction,ai_help_summary,updated_at",
      )
      .order("week_start", { ascending: false })
      .order("updated_at", { ascending: false })
      .then(({ data }) => setInsights(data ?? []));
  }, [user]);

  if (!user) return null;

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

  const downloadPlanAsText = (plan: Plan) => {
    const content = `${plan.title}\n\n${plan.content}`;
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(content));
    element.setAttribute("download", `${plan.title}.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success("Plan downloaded as text");
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
      updated_at: new Date().toISOString(),
    });

    if (error) {
      setInsightMonitoringEnabled(!enabled);
      toast.error("Failed to update insight monitoring setting");
      return;
    }

    toast.success(enabled ? "Weekly insights monitoring enabled" : "Weekly insights monitoring disabled");
  };

  const saveProfileIdentity = async (nameInput = displayName, avatarInput = avatarDataUrl) => {
    if (!user) return;
    const cleanName = nameInput.trim();
    if (!cleanName) {
      toast.error("Please enter a name");
      return;
    }

    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: {
        ...user.user_metadata,
        full_name: cleanName,
        name: cleanName,
        avatar_url: avatarInput || null,
        avatar_data_url: avatarInput || null,
      },
    });
    setSavingProfile(false);

    if (error) {
      toast.error(error.message || "Failed to update profile");
      return;
    }

    setDisplayName(cleanName);
    setPendingName(cleanName);
    setAvatarDataUrl(avatarInput || "");
    window.dispatchEvent(new CustomEvent("profileUpdated", {
      detail: { name: cleanName, avatarUrl: avatarInput || "" },
    }));
    toast.success("Profile updated");
  };

  const onAvatarSelected = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setAvatarDataUrl(dataUrl);
      await saveProfileIdentity(displayName, dataUrl);
    } catch (e: any) {
      toast.error(e?.message || "Could not use selected image");
    }
  };

  const saveNameFromPencil = async () => {
    await saveProfileIdentity(pendingName, avatarDataUrl);
    setEditingName(false);
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
                  <button type="button" onClick={() => void saveNameFromPencil()} title="Save name">
                    <Check className="h-4 w-4 text-primary" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingName(displayName);
                      setEditingName(false);
                    }}
                    title="Cancel"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setEditingName(true)} title="Edit name">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} disabled={savingProfile}>
          Sign out
        </Button>
      </div>

      <div className="flex gap-1 border-b border-border mb-6 -mx-1">
        {(["plans", "chats", "insights", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
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
        <div className="space-y-3">
          {plans.length === 0 && (
            <EmptyState text="No saved plans yet. After a meaningful answer in chat, tap “Save as Plan”." />
          )}
          {plans.map((p) => (
            <button
              key={p.id}
              onClick={() => openPlanModal(p)}
              className="w-full text-left rounded-xl border border-border bg-surface/60 hover:bg-surface-elevated transition-colors p-5"
            >
              <div className="font-serif text-lg">{p.title}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(p.created_at).toLocaleDateString()}
              </div>
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2 whitespace-pre-line">
                {p.content.replace(/[#*_`>]/g, "").trim()}
              </p>
            </button>
          ))}
        </div>
      )}

      {tab === "chats" && (
        <div className="space-y-2">
          {convs.length === 0 && <EmptyState text="No conversations yet. Head to chat to begin." />}
          {convs.map((c) => (
            <Link
              key={c.id}
              to="/"
              search={{ c: c.id } as never}
              className="block rounded-xl border border-border bg-surface/60 hover:bg-surface-elevated transition-colors p-4"
            >
              <div className="text-sm">{c.title}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {new Date(c.updated_at).toLocaleString()}
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "insights" && (
        <div className="space-y-3">
          {!insightMonitoringEnabled && (
            <EmptyState text="Turn on Insights Monitoring in Settings to start receiving weekly emotional and thinking-pattern insights." />
          )}
          {insightMonitoringEnabled && insights.length === 0 && (
            <EmptyState text="No weekly insights yet. Keep chatting and check back this week." />
          )}
          {insightMonitoringEnabled &&
            insights.map((insight) => {
              const conv = convs.find((c) => c.id === insight.conversation_id);
              return (
                <div key={insight.id} className="rounded-xl border border-border bg-surface/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Week of {new Date(insight.week_start).toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {conv?.title ?? "Conversation"}
                      </div>
                    </div>
                    <Link
                      to="/"
                      search={{ c: insight.conversation_id } as never}
                      className="text-xs text-primary hover:underline"
                    >
                      Open chat
                    </Link>
                  </div>

                  <div className="mt-4 space-y-3 text-sm">
                    <InsightRow title="Emotion trend" value={insight.emotion_trend} />
                    <InsightRow title="Thought patterns" value={insight.thought_patterns} />
                    <InsightRow title="Calm progress" value={insight.calm_progress} />
                    <InsightRow
                      title="Overthinking reduction"
                      value={insight.overthinking_reduction}
                    />
                    <InsightRow title="How RealTalk helped" value={insight.ai_help_summary} />
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-6 max-w-md">
          <div className="rounded-xl border border-border bg-surface/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold text-foreground cursor-pointer">
                  Weekly insights monitoring
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Allow RealTalk to analyze conversation patterns weekly and surface emotional trends,
                  thought loops, and progress toward calmer thinking.
                </p>
              </div>
              <Switch checked={insightMonitoringEnabled} onCheckedChange={toggleInsightMonitoring} />
            </div>
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
                  onClick={() => downloadPlanAsText(isEditingPlan && planDraft ? { ...openPlan, ...planDraft } : openPlan)}
                  className="gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
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
