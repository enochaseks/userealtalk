import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/lib/auth";
import { loadSubscriptionSnapshot, canUseMeteredFeature, consumeMeteredFeature } from "@/lib/subscriptions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calculator, CircleHelp, PiggyBank, Trash2 } from "lucide-react";

export const Route = createFileRoute("/money-planner")({
  component: MoneyPlannerPage,
  head: () => ({
    meta: [{ title: "Money Planner - RealTalk" }],
  }),
});

type SavingsGoal = {
  title: string;
  targetAmount: number;
  targetDate: string;
  currentBalance: number;
  active: boolean;
};

type SpendEntry = {
  id: string;
  amount: number;
  category: string;
  note: string;
  spentAt: string;
};

type MoneyTask = {
  id: string;
  text: string;
  done: boolean;
};

type DebtItem = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
};

type MoneyPlannerState = {
  goal: SavingsGoal;
  spends: SpendEntry[];
  tasks: MoneyTask[];
  debts: DebtItem[];
  adviceMarkdown: string;
};

const FINANCIAL_CONSENT_STORAGE_KEY = "realtalk_financial_data_consent_v1";

const DEFAULT_STATE: MoneyPlannerState = {
  goal: {
    title: "",
    targetAmount: 0,
    targetDate: "",
    currentBalance: 0,
    active: false,
  },
  spends: [],
  tasks: [],
  debts: [],
  adviceMarkdown: "",
};

const UK_MONEY_SUPPORT_ORGS = [
  {
    name: "StepChange Debt Charity",
    help: "Free debt advice and debt management support",
    url: "https://www.stepchange.org",
  },
  {
    name: "Citizens Advice",
    help: "Money, benefits, and debt support in your local area",
    url: "https://www.citizensadvice.org.uk/debt-and-money/",
  },
  {
    name: "National Debtline",
    help: "Independent debt advice and practical debt options",
    url: "https://nationaldebtline.org",
  },
  {
    name: "MoneyHelper",
    help: "Budgeting tools, calculators, and guidance",
    url: "https://www.moneyhelper.org.uk",
  },
  {
    name: "Turn2us",
    help: "Benefits and grants finder for financial hardship",
    url: "https://www.turn2us.org.uk",
  },
];

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const parseAmount = (value: string): number => {
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

function MoneyPlannerPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [state, setState] = useState<MoneyPlannerState>(DEFAULT_STATE);
  const [goalDraft, setGoalDraft] = useState<SavingsGoal>(DEFAULT_STATE.goal);
  const [dbLoaded, setDbLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [spendAmount, setSpendAmount] = useState("");
  const [spendCategory, setSpendCategory] = useState("Food");
  const [spendNote, setSpendNote] = useState("");

  const [taskDraft, setTaskDraft] = useState("");

  const [debtName, setDebtName] = useState("");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtApr, setDebtApr] = useState("");
  const [debtMinPayment, setDebtMinPayment] = useState("");

  const [adviceBusy, setAdviceBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setConsentAccepted(window.localStorage.getItem(FINANCIAL_CONSENT_STORAGE_KEY) === "true");
  }, []);

  const storageKey = user ? `money-planner:${user.id}` : null;

  const parseStoredState = (parsed: Partial<MoneyPlannerState>): MoneyPlannerState => ({
    goal: {
      title: String(parsed.goal?.title ?? ""),
      targetAmount: Number(parsed.goal?.targetAmount ?? 0) || 0,
      targetDate: String(parsed.goal?.targetDate ?? ""),
      currentBalance: Number(parsed.goal?.currentBalance ?? 0) || 0,
      active: Boolean(parsed.goal?.active),
    },
    spends: Array.isArray(parsed.spends)
      ? parsed.spends
          .map((entry) => ({
            id: String(entry.id ?? crypto.randomUUID()),
            amount: Number(entry.amount ?? 0) || 0,
            category: String(entry.category ?? "Other"),
            note: String(entry.note ?? ""),
            spentAt: String(entry.spentAt ?? new Date().toISOString()),
          }))
          .sort((a, b) => b.spentAt.localeCompare(a.spentAt))
      : [],
    tasks: Array.isArray(parsed.tasks)
      ? parsed.tasks.map((task) => ({
          id: String(task.id ?? crypto.randomUUID()),
          text: String(task.text ?? ""),
          done: Boolean(task.done),
        }))
      : [],
    debts: Array.isArray(parsed.debts)
      ? parsed.debts.map((debt) => ({
          id: String(debt.id ?? crypto.randomUUID()),
          name: String(debt.name ?? "Debt"),
          balance: Number(debt.balance ?? 0) || 0,
          apr: Number(debt.apr ?? 0) || 0,
          minPayment: Number(debt.minPayment ?? 0) || 0,
        }))
      : [],
    adviceMarkdown: String(parsed.adviceMarkdown ?? ""),
  });

  // Load from Supabase on mount; fall back to localStorage for one-time migration
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      const { data } = await (supabase as any)
        .from("user_money_planner")
        .select("goal,spends,tasks,debts,advice_markdown")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        const next = parseStoredState({
          goal: data.goal ?? {},
          spends: data.spends ?? [],
          tasks: data.tasks ?? [],
          debts: data.debts ?? [],
          adviceMarkdown: String(data.advice_markdown ?? ""),
        });
        setState(next);
        setGoalDraft(next.goal);
        setDbLoaded(true);
        return;
      }

      // No DB row yet — check localStorage for migration
      if (storageKey && typeof window !== "undefined") {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<MoneyPlannerState>;
            const next = parseStoredState(parsed);
            setState(next);
            setGoalDraft(next.goal);
            // Persist migrated data straight to DB and clear localStorage
            await (supabase as any).from("user_money_planner").upsert({
              user_id: user.id,
              goal: next.goal,
              spends: next.spends,
              tasks: next.tasks,
              debts: next.debts,
              advice_markdown: next.adviceMarkdown,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            window.localStorage.removeItem(storageKey);
          } catch {
            setState(DEFAULT_STATE);
            setGoalDraft(DEFAULT_STATE.goal);
          }
          setDbLoaded(true);
          return;
        }
      }

      setState(DEFAULT_STATE);
      setGoalDraft(DEFAULT_STATE.goal);
      setDbLoaded(true);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Debounced save to Supabase whenever state changes (after initial load)
  useEffect(() => {
    if (!user || !dbLoaded) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (supabase as any).from("user_money_planner").upsert({
        user_id: user.id,
        goal: state.goal,
        spends: state.spends,
        tasks: state.tasks,
        debts: state.debts,
        advice_markdown: state.adviceMarkdown,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }, 800);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, user, dbLoaded]);

  const goalActive = state.goal.active && state.goal.targetAmount > 0;

  const totalSpent = useMemo(
    () => state.spends.reduce((sum, item) => sum + item.amount, 0),
    [state.spends],
  );

  const currentLiveBalance = useMemo(
    () => Math.max(0, state.goal.currentBalance - totalSpent),
    [state.goal.currentBalance, totalSpent],
  );

  const remainingToGoal = useMemo(
    () => Math.max(0, state.goal.targetAmount - currentLiveBalance),
    [state.goal.targetAmount, currentLiveBalance],
  );

  const daysLeft = useMemo(() => {
    if (!state.goal.targetDate) return null;
    const target = new Date(state.goal.targetDate);
    if (Number.isNaN(target.getTime())) return null;
    const diffMs = target.getTime() - Date.now();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [state.goal.targetDate]);

  const weeksLeft = useMemo(() => {
    if (!daysLeft) return null;
    return Math.max(1, Math.ceil(daysLeft / 7));
  }, [daysLeft]);

  const weeklySaveRequired = useMemo(() => {
    if (!goalActive || !weeksLeft) return 0;
    return remainingToGoal / weeksLeft;
  }, [goalActive, remainingToGoal, weeksLeft]);

  const safeToSpendThisWeek = useMemo(() => {
    if (!goalActive) return 0;
    return Math.max(0, currentLiveBalance - weeklySaveRequired);
  }, [goalActive, currentLiveBalance, weeklySaveRequired]);

  const totalDebt = useMemo(() => state.debts.reduce((sum, debt) => sum + debt.balance, 0), [state.debts]);
  const totalMinDebtPayment = useMemo(
    () => state.debts.reduce((sum, debt) => sum + debt.minPayment, 0),
    [state.debts],
  );
  const debtMonthsEstimate = useMemo(() => {
    if (!totalDebt || !totalMinDebtPayment) return null;
    return Math.ceil(totalDebt / totalMinDebtPayment);
  }, [totalDebt, totalMinDebtPayment]);

  const applyConsent = () => {
    if (!consentChecked) {
      toast.error("Please confirm consent before continuing.");
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(FINANCIAL_CONSENT_STORAGE_KEY, "true");
    }
    setConsentAccepted(true);
    toast.success("Financial assistant consent saved.");
  };

  const saveGoal = () => {
    const title = goalDraft.title.trim();
    if (!title) {
      toast.error("Add what you are saving for.");
      return;
    }
    if (goalDraft.targetAmount <= 0) {
      toast.error("Target amount must be more than 0.");
      return;
    }
    if (!goalDraft.targetDate) {
      toast.error("Choose a target date.");
      return;
    }

    setState((prev) => ({
      ...prev,
      goal: {
        ...goalDraft,
        title,
        active: true,
      },
      adviceMarkdown: "",
    }));
    toast.success("Savings goal updated.");
  };

  const addSpend = () => {
    if (!goalActive) {
      toast.error("Create a savings goal first.");
      return;
    }

    const amount = parseAmount(spendAmount);
    if (amount <= 0) {
      toast.error("Enter a valid spend amount.");
      return;
    }

    setState((prev) => ({
      ...prev,
      spends: [
        {
          id: crypto.randomUUID(),
          amount,
          category: spendCategory,
          note: spendNote.trim(),
          spentAt: new Date().toISOString(),
        },
        ...prev.spends,
      ],
      adviceMarkdown: "",
    }));

    setSpendAmount("");
    setSpendNote("");
    toast.success("Spending entry added.");
  };

  const removeSpend = (id: string) => {
    setState((prev) => ({
      ...prev,
      spends: prev.spends.filter((entry) => entry.id !== id),
    }));
  };

  const addTask = () => {
    const text = taskDraft.trim();
    if (!text) return;

    setState((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: crypto.randomUUID(), text, done: false }],
    }));
    setTaskDraft("");
  };

  const toggleTask = (id: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)),
    }));
  };

  const removeTask = (id: string) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((task) => task.id !== id),
    }));
  };

  const addDebt = () => {
    const name = debtName.trim();
    const balance = parseAmount(debtBalance);
    const apr = parseAmount(debtApr);
    const minPayment = parseAmount(debtMinPayment);

    if (!name || balance <= 0 || minPayment <= 0) {
      toast.error("Add debt name, balance, and minimum payment.");
      return;
    }

    setState((prev) => ({
      ...prev,
      debts: [...prev.debts, { id: crypto.randomUUID(), name, balance, apr, minPayment }],
      adviceMarkdown: "",
    }));

    setDebtName("");
    setDebtBalance("");
    setDebtApr("");
    setDebtMinPayment("");
  };

  const removeDebt = (id: string) => {
    setState((prev) => ({
      ...prev,
      debts: prev.debts.filter((debt) => debt.id !== id),
    }));
  };

  const buildAdvisorPrompt = () => {
    const spendRows = state.spends
      .slice(0, 40)
      .map((item) => `- ${item.spentAt.slice(0, 10)} | ${item.category} | ${formatMoney(item.amount)} | ${item.note || "No note"}`)
      .join("\n");

    const taskRows = state.tasks
      .map((task) => `- [${task.done ? "x" : " "}] ${task.text}`)
      .join("\n");

    const debtRows = state.debts
      .map((debt) => `- ${debt.name}: balance ${formatMoney(debt.balance)}, APR ${debt.apr}%, min ${formatMoney(debt.minPayment)}`)
      .join("\n");

    return [
      "You are a practical money accountability coach.",
      "The user is trying to save for a goal and may overthink spending decisions.",
      "Give concise and direct guidance.",
      "Output sections in this order:",
      "1) Money Advice (3 short bullets)",
      "2) This Week Plan (5 bullets max)",
      "3) To-Do Checklist (5-8 markdown checkboxes)",
      "4) Debt Move (if debt exists)",
      "5) One anti-impulse spending rule",
      "Include this line at the end: This is educational guidance, not regulated financial advice.",
      "",
      "Savings goal:",
      `- Title: ${state.goal.title}`,
      `- Target amount: ${formatMoney(state.goal.targetAmount)}`,
      `- Current live balance: ${formatMoney(currentLiveBalance)}`,
      `- Remaining to goal: ${formatMoney(remainingToGoal)}`,
      `- Target date: ${state.goal.targetDate || "Not set"}`,
      `- Days left: ${daysLeft ?? "Unknown"}`,
      `- Weekly save required: ${formatMoney(weeklySaveRequired)}`,
      `- Safe to spend this week: ${formatMoney(safeToSpendThisWeek)}`,
      "",
      "Spending entries:",
      spendRows || "- None yet",
      "",
      "Existing to-do items:",
      taskRows || "- None yet",
      "",
      "Debt snapshot:",
      debtRows || "- None",
    ].join("\n");
  };

  const generateAdvice = async () => {
    if (!goalActive) {
      toast.error("Create an active savings goal first.");
      return;
    }

    if (!user) return;

    // Check money coach plan limit
    const snapshot = await loadSubscriptionSnapshot(user.id);
    if (!canUseMeteredFeature("money_coach_plan", snapshot)) {
      const usage = snapshot.usage["money_coach_plan"];
      toast.error(
        `Money Planner AI limit reached (${usage.used}/${usage.limit} this month). Upgrade to get more plan generations.`,
      );
      return;
    }

    setAdviceBusy(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: buildAdvisorPrompt() }],
          beReal: false,
          emotionalMode: false,
          logicalMode: true,
          thinkDeeply: false,
          forcePlan: true,
          forceVent: false,
          ventAdviceMode: "none",
          userId: user?.id,
        }),
      });

      if (!resp.ok || !resp.body) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(String(errJson?.error || "Could not generate money advice"));
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let buffer = "";
      let output = "";

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });

        let newline = -1;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;

          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(payload);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) output += String(delta);
          } catch {
            // Ignore malformed stream chunks.
          }
        }
      }

      if (!output.trim()) {
        throw new Error("No advice returned.");
      }

      setState((prev) => ({ ...prev, adviceMarkdown: output.trim() }));
      toast.success("Money advice ready.");

      // Consume usage after successful generation
      await consumeMeteredFeature(user.id, "money_coach_plan").catch(() => {
        // Non-blocking: advice was already generated, don't fail the user
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate money advice");
    } finally {
      setAdviceBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-5 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Money Planner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plan your savings goal, track every spend, and let AI keep your money plan practical.
        </p>
      </div>

      {!consentAccepted && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">Financial Data Consent Required</CardTitle>
            <CardDescription>
              You must confirm consent before using money planning features. Sensitive bank statements are not stored in the database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="money-consent"
                checked={consentChecked}
                onCheckedChange={(checked) => setConsentChecked(checked === true)}
              />
              <Label htmlFor="money-consent" className="text-sm leading-6">
                I allow RealTalk to process my financial inputs to provide saving support. I understand this guidance is educational and not regulated financial advice.
              </Label>
            </div>
            <Button type="button" onClick={applyConsent}>Accept and continue</Button>
          </CardContent>
        </Card>
      )}

      {consentAccepted && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Current live balance</CardDescription>
                <CardTitle>{formatMoney(currentLiveBalance)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Remaining to goal</CardDescription>
                <CardTitle>{formatMoney(remainingToGoal)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Safe to spend this week</CardDescription>
                <CardTitle>{formatMoney(safeToSpendThisWeek)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBank className="h-4 w-4" />
                Savings Goal
              </CardTitle>
              <CardDescription>
                Spending management activates when a savings goal is active.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="goal-title">What are you saving for?</Label>
                <Input
                  id="goal-title"
                  value={goalDraft.title}
                  onChange={(event) => setGoalDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Emergency fund, rent buffer, laptop, etc."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-target">Target amount</Label>
                <Input
                  id="goal-target"
                  inputMode="decimal"
                  value={String(goalDraft.targetAmount || "")}
                  onChange={(event) =>
                    setGoalDraft((prev) => ({ ...prev, targetAmount: parseAmount(event.target.value) }))
                  }
                  placeholder="2000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-balance">Current balance</Label>
                <Input
                  id="goal-balance"
                  inputMode="decimal"
                  value={String(goalDraft.currentBalance || "")}
                  onChange={(event) =>
                    setGoalDraft((prev) => ({ ...prev, currentBalance: parseAmount(event.target.value) }))
                  }
                  placeholder="850"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="goal-date">Target date</Label>
                <Input
                  id="goal-date"
                  type="date"
                  value={goalDraft.targetDate}
                  onChange={(event) => setGoalDraft((prev) => ({ ...prev, targetDate: event.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" className="w-full" onClick={saveGoal}>Save goal</Button>
              </div>
            </CardContent>
          </Card>

          {!goalActive && (
            <Card className="border-dashed">
              <CardContent className="py-4 text-sm text-muted-foreground">
                Create a goal first. Spend tracking and AI money management only run when you are saving for something.
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Spend Tracker</CardTitle>
                <CardDescription>Add every spend so the planner can keep you on track.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    inputMode="decimal"
                    value={spendAmount}
                    onChange={(event) => setSpendAmount(event.target.value)}
                    placeholder="Amount"
                    disabled={!goalActive}
                  />
                  <select
                    value={spendCategory}
                    onChange={(event) => setSpendCategory(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    disabled={!goalActive}
                  >
                    <option>Food</option>
                    <option>Transport</option>
                    <option>Bills</option>
                    <option>Subscriptions</option>
                    <option>Shopping</option>
                    <option>Other</option>
                  </select>
                </div>
                <Input
                  value={spendNote}
                  onChange={(event) => setSpendNote(event.target.value)}
                  placeholder="What was this spend for?"
                  disabled={!goalActive}
                />
                <Button type="button" onClick={addSpend} disabled={!goalActive}>Log spend</Button>

                <div className="space-y-2">
                  {state.spends.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No spending entries yet.</p>
                  ) : (
                    state.spends.slice(0, 12).map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-md border border-border/70 p-2.5 flex items-start justify-between gap-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{formatMoney(entry.amount)} · {entry.category}</p>
                          <p className="text-xs text-muted-foreground">{entry.note || "No note"}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{new Date(entry.spentAt).toLocaleString()}</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSpend(entry.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Money To-Do List</CardTitle>
                <CardDescription>Action checklist for this week.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    value={taskDraft}
                    onChange={(event) => setTaskDraft(event.target.value)}
                    placeholder="Add a money task"
                  />
                  <Button type="button" onClick={addTask}>Add</Button>
                </div>

                <div className="space-y-2">
                  {state.tasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tasks yet.</p>
                  ) : (
                    state.tasks.map((task) => (
                      <div key={task.id} className="rounded-md border border-border/70 p-2.5 flex items-start gap-2">
                        <Checkbox checked={task.done} onCheckedChange={() => toggleTask(task.id)} />
                        <p className={`text-sm flex-1 ${task.done ? "line-through text-muted-foreground" : ""}`}>
                          {task.text}
                        </p>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTask(task.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Debt Tools
                </CardTitle>
                <CardDescription>Track debt pressure and estimate payoff pace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input value={debtName} onChange={(event) => setDebtName(event.target.value)} placeholder="Debt name" />
                  <Input inputMode="decimal" value={debtBalance} onChange={(event) => setDebtBalance(event.target.value)} placeholder="Balance" />
                  <Input inputMode="decimal" value={debtApr} onChange={(event) => setDebtApr(event.target.value)} placeholder="APR %" />
                  <Input inputMode="decimal" value={debtMinPayment} onChange={(event) => setDebtMinPayment(event.target.value)} placeholder="Min payment" />
                </div>
                <Button type="button" onClick={addDebt}>Add debt</Button>

                <div className="rounded-md border border-border/70 p-2.5 text-sm space-y-1">
                  <p>Total debt: <strong>{formatMoney(totalDebt)}</strong></p>
                  <p>Monthly minimums: <strong>{formatMoney(totalMinDebtPayment)}</strong></p>
                  <p>
                    Rough payoff estimate: <strong>{debtMonthsEstimate ? `${debtMonthsEstimate} months` : "Not enough data"}</strong>
                  </p>
                </div>

                <div className="space-y-2">
                  {state.debts.map((debt) => (
                    <div key={debt.id} className="rounded-md border border-border/70 p-2.5 flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{debt.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(debt.balance)} · APR {debt.apr}% · min {formatMoney(debt.minPayment)}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDebt(debt.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CircleHelp className="h-4 w-4" />
                  Money Support Organisations
                </CardTitle>
                <CardDescription>Trusted help for debt and financial stress.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {UK_MONEY_SUPPORT_ORGS.map((org) => (
                  <a
                    key={org.name}
                    href={org.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-md border border-border/70 p-2.5 hover:bg-surface-elevated transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.help}</p>
                  </a>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Money Advice</CardTitle>
              <CardDescription>
                AI advice uses your current goal, spending logs, debt, and checklist.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void generateAdvice()} disabled={adviceBusy || !goalActive}>
                  {adviceBusy ? "Generating..." : "Generate money plan"}
                </Button>
                {goalActive ? (
                  <Badge variant="outline">Goal active</Badge>
                ) : (
                  <Badge variant="secondary">Goal required</Badge>
                )}
              </div>

              {state.adviceMarkdown ? (
                <div className="rounded-md border border-border/70 bg-surface/40 p-4 prose-realtalk text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.adviceMarkdown}</ReactMarkdown>
                </div>
              ) : (
                <Textarea
                  value="No AI advice generated yet. Click Generate money plan after setting your goal and logging spending."
                  readOnly
                  className="min-h-[90px] text-sm"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
