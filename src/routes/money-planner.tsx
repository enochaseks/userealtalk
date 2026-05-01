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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calculator, CircleHelp, Pencil, PiggyBank, Plus, Save, Trash2 } from "lucide-react";

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

type DebtStatus = "active" | "missed" | "paid-off";
type DebtCategory = "credit-card" | "loan" | "overdraft" | "bnpl" | "utilities" | "rent" | "tax" | "other";

type DebtItem = {
  id: string;
  name: string;
  category: DebtCategory;
  balance: number;
  apr: number;
  minPayment: number;
  nextPaymentDate: string;
  lastPaymentDate: string;
  paymentStatus: DebtStatus;
  paymentBarrier: string;
};

type BenefitEntry = {
  id: string;
  name: string;
  amountMonthly: number;
  paymentFrequency: "weekly" | "fortnightly" | "monthly" | "four-weekly";
};

type EmploymentType = "employed" | "self-employed" | "unemployed" | null;

type JobIncome = {
  employer: string;
  amount: number;
  frequency: "weekly" | "fortnightly" | "four-weekly" | "monthly";
  nextPayDate: string; // ISO date string YYYY-MM-DD
};

type MoneyPlannerState = {
  goal: SavingsGoal;
  spends: SpendEntry[];
  tasks: MoneyTask[];
  debts: DebtItem[];
  benefits: BenefitEntry[];
  onBenefits: boolean | null;
  nextBenefitPayDate: string; // ISO date string YYYY-MM-DD
  employmentType: EmploymentType;
  jobIncome: JobIncome;
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
  benefits: [],
  onBenefits: null,
  nextBenefitPayDate: "",
  employmentType: null,
  jobIncome: { employer: "", amount: 0, frequency: "monthly", nextPayDate: "" },
  adviceMarkdown: "",
};

const UK_BENEFITS_LIST = [
  "Universal Credit",
  "Personal Independence Payment (PIP)",
  "Employment and Support Allowance (ESA)",
  "Jobseeker's Allowance (JSA)",
  "Housing Benefit",
  "Child Benefit",
  "Child Tax Credit",
  "Working Tax Credit",
  "Carer's Allowance",
  "Disability Living Allowance (DLA)",
  "Attendance Allowance",
  "Pension Credit",
  "Statutory Sick Pay (SSP)",
  "Maternity Allowance",
  "Council Tax Reduction",
  "Free School Meals",
  "Other benefit / grant",
] as const;

const DEBT_CATEGORIES: Array<{ value: DebtCategory; label: string }> = [
  { value: "credit-card", label: "Credit card" },
  { value: "loan", label: "Loan" },
  { value: "overdraft", label: "Overdraft" },
  { value: "bnpl", label: "Buy now pay later" },
  { value: "utilities", label: "Utilities" },
  { value: "rent", label: "Rent arrears" },
  { value: "tax", label: "Tax" },
  { value: "other", label: "Other" },
];

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

const serializePlannerState = (value: MoneyPlannerState) => JSON.stringify(value);

const totalDebtBalance = (state: MoneyPlannerState) => state.debts.reduce((sum, debt) => sum + debt.balance, 0);

const activeDebtCount = (state: MoneyPlannerState) =>
  state.debts.filter((debt) => debt.balance > 0 && debt.paymentStatus !== "paid-off").length;

const totalSpendAmount = (state: MoneyPlannerState) => state.spends.reduce((sum, spend) => sum + spend.amount, 0);

const totalBenefitMonthly = (state: MoneyPlannerState) => state.benefits.reduce((sum, benefit) => {
  if (benefit.paymentFrequency === "weekly") return sum + benefit.amountMonthly * (52 / 12);
  if (benefit.paymentFrequency === "fortnightly") return sum + benefit.amountMonthly * (26 / 12);
  if (benefit.paymentFrequency === "four-weekly") return sum + benefit.amountMonthly * (13 / 12);
  return sum + benefit.amountMonthly;
}, 0);

const getPlannerChangeLines = (previous: MoneyPlannerState | null, next: MoneyPlannerState) => {
  if (!previous) return ["Money Planner was created or synced for the first time."];

  const lines: string[] = [];

  if (
    previous.goal.title !== next.goal.title ||
    previous.goal.targetAmount !== next.goal.targetAmount ||
    previous.goal.targetDate !== next.goal.targetDate ||
    previous.goal.currentBalance !== next.goal.currentBalance
  ) {
    lines.push(
      `Goal updated: ${next.goal.title || "No title"}, target ${formatMoney(next.goal.targetAmount)}, live balance ${formatMoney(next.goal.currentBalance)}.`,
    );
  }

  if (
    previous.spends.length !== next.spends.length ||
    totalSpendAmount(previous) !== totalSpendAmount(next)
  ) {
    lines.push(
      `Spending changed: ${next.spends.length} entries, ${formatMoney(totalSpendAmount(next))} recorded in total.`,
    );
  }

  const previousTasksDone = previous.tasks.filter((task) => task.done).length;
  const nextTasksDone = next.tasks.filter((task) => task.done).length;
  if (previous.tasks.length !== next.tasks.length || previousTasksDone !== nextTasksDone) {
    lines.push(`Tasks changed: ${nextTasksDone}/${next.tasks.length} marked complete.`);
  }

  if (JSON.stringify(previous.debts) !== JSON.stringify(next.debts)) {
    lines.push(`Debt details changed: ${next.debts.length} debts, ${formatMoney(totalDebtBalance(next))} outstanding.`);
  }

  if (
    previous.onBenefits !== next.onBenefits ||
    previous.nextBenefitPayDate !== next.nextBenefitPayDate ||
    previous.benefits.length !== next.benefits.length ||
    totalBenefitMonthly(previous) !== totalBenefitMonthly(next)
  ) {
    lines.push(
      `Benefits changed: ${next.benefits.length} benefit entries, about ${formatMoney(totalBenefitMonthly(next))} per month.`
    );
  }

  if (
    previous.employmentType !== next.employmentType ||
    previous.jobIncome.employer !== next.jobIncome.employer ||
    previous.jobIncome.amount !== next.jobIncome.amount ||
    previous.jobIncome.frequency !== next.jobIncome.frequency ||
    previous.jobIncome.nextPayDate !== next.jobIncome.nextPayDate
  ) {
    lines.push(
      `Income details changed: ${next.employmentType ?? "not set"}, ${next.jobIncome.employer || "no employer"}, ${formatMoney(next.jobIncome.amount)} ${next.jobIncome.frequency}.`,
    );
  }

  if (previous.adviceMarkdown !== next.adviceMarkdown) {
    lines.push("RealTalk money plan notes were updated.");
  }

  return lines.length > 0 ? lines : ["General planner details were updated."];
};

const buildPlannerSecurityEmailBody = (previous: MoneyPlannerState | null, next: MoneyPlannerState) => {
  const changes = getPlannerChangeLines(previous, next);
  const completedTasks = next.tasks.filter((task) => task.done).length;

  return [
    "Hi,",
    "",
    "A change was made to your RealTalk Money Planner.",
    "",
    ...changes.map((line) => `- ${line}`),
    "",
    `Current goal: ${next.goal.title || "Not set"}`,
    `Target amount: ${formatMoney(next.goal.targetAmount)}`,
    `Current balance: ${formatMoney(next.goal.currentBalance)}`,
    `Spending logged: ${next.spends.length} entries totalling ${formatMoney(totalSpendAmount(next))}`,
    `Tasks: ${completedTasks}/${next.tasks.length} complete`,
    `Debt tracked: ${activeDebtCount(next)} active item(s), ${formatMoney(totalDebtBalance(next))} total`,
    `Employment: ${next.employmentType ?? "not set"}`,
    `Job income: ${next.jobIncome.employer || "Not set"} - ${formatMoney(next.jobIncome.amount)} ${next.jobIncome.frequency}`,
    `Benefits: ${next.benefits.length} item(s), about ${formatMoney(totalBenefitMonthly(next))} per month`,
    "",
    "If this wasn't you, review your account immediately.",
    "Money Planner: userealtalk.co.uk/money-planner",
    "",
    "This is an automated RealTalk security notification.",
  ].join("\n");
};

const buildDebtSecurityEmailBody = (previous: MoneyPlannerState | null, next: MoneyPlannerState) => {
  const lines: string[] = [];
  if (!previous) {
    lines.push("Debt details were created for the first time.");
  } else {
    if (previous.debts.length !== next.debts.length) {
      lines.push(`Debt items changed from ${previous.debts.length} to ${next.debts.length}.`);
    }

    const previousOpenDebts = activeDebtCount(previous);
    const nextOpenDebts = activeDebtCount(next);
    if (previousOpenDebts !== nextOpenDebts) {
      lines.push(`Active debts changed from ${previousOpenDebts} to ${nextOpenDebts}.`);
    }

    const previousTotal = totalDebtBalance(previous);
    const nextTotal = totalDebtBalance(next);
    if (previousTotal !== nextTotal) {
      lines.push(`Total debt changed from ${formatMoney(previousTotal)} to ${formatMoney(nextTotal)}.`);
    }

    if (JSON.stringify(previous.debts) !== JSON.stringify(next.debts) && lines.length === 0) {
      lines.push("Debt details were edited.");
    }
  }

  if (lines.length === 0) lines.push("Debt details were reviewed and saved.");

  return [
    "Hi,",
    "",
    "Your debt updates were manually saved in RealTalk Money Planner.",
    "",
    ...lines.map((line) => `- ${line}`),
    "",
    `Active debts: ${activeDebtCount(next)}`,
    `Total debt tracked: ${formatMoney(totalDebtBalance(next))}`,
    "",
    "If this wasn't you, review your account immediately.",
    "Money Planner: userealtalk.co.uk/money-planner",
    "",
    "This is an automated RealTalk security notification.",
  ].join("\n");
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
  const [debtCategory, setDebtCategory] = useState<DebtCategory>("credit-card");
  const [debtBalance, setDebtBalance] = useState("");
  const [debtApr, setDebtApr] = useState("");
  const [debtMinPayment, setDebtMinPayment] = useState("");
  const [debtNextPaymentDate, setDebtNextPaymentDate] = useState("");

  const [onBenefits, setOnBenefits] = [
    state.onBenefits,
    (val: boolean | null) => setState((prev) => ({ ...prev, onBenefits: val })),
  ] as const;

  const setEmploymentType = (val: EmploymentType) =>
    setState((prev) => ({ ...prev, employmentType: val }));
  const setJobIncome = (patch: Partial<JobIncome>) =>
    setState((prev) => ({ ...prev, jobIncome: { ...prev.jobIncome, ...patch } }));

  const [jobAmountInput, setJobAmountInput] = useState(
    state.jobIncome.amount > 0 ? String(state.jobIncome.amount) : ""
  );
  const [benefitName, setBenefitName] = useState(UK_BENEFITS_LIST[0] as string);
  const [benefitAmount, setBenefitAmount] = useState("");
  const [benefitFrequency, setBenefitFrequency] = useState<BenefitEntry["paymentFrequency"]>("monthly");

  const [balanceEditOpen, setBalanceEditOpen] = useState(false);
  const [balanceEditInput, setBalanceEditInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [plannerEmailNotificationsEnabled, setPlannerEmailNotificationsEnabled] = useState(true);
  const [plannerNotificationSettingBusy, setPlannerNotificationSettingBusy] = useState(false);
  const [debtWeeklyCheckinEnabled, setDebtWeeklyCheckinEnabled] = useState(false);
  const [debtWeeklyCheckinEmailEnabled, setDebtWeeklyCheckinEmailEnabled] = useState(false);
  const [debtSupportBusy, setDebtSupportBusy] = useState(false);
  const [debtSupportMarkdown, setDebtSupportMarkdown] = useState("");
  const [debtChangesPending, setDebtChangesPending] = useState(false);
  const [debtSaveBusy, setDebtSaveBusy] = useState(false);
  const lastSavedSnapshotRef = useRef("");
  const lastSavedStateRef = useRef<MoneyPlannerState | null>(null);

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
          category: (DEBT_CATEGORIES.map((item) => item.value) as string[]).includes(debt.category as string)
            ? debt.category as DebtCategory
            : "other",
          balance: Number(debt.balance ?? 0) || 0,
          apr: Number(debt.apr ?? 0) || 0,
          minPayment: Number(debt.minPayment ?? 0) || 0,
          nextPaymentDate: String(debt.nextPaymentDate ?? ""),
          lastPaymentDate: String(debt.lastPaymentDate ?? ""),
          paymentStatus: (["active", "missed", "paid-off"] as string[]).includes(debt.paymentStatus as string)
            ? debt.paymentStatus as DebtStatus
            : "active",
          paymentBarrier: String(debt.paymentBarrier ?? ""),
        }))
      : [],
    benefits: Array.isArray(parsed.benefits)
      ? parsed.benefits.map((b) => ({
          id: String(b.id ?? crypto.randomUUID()),
          name: String(b.name ?? "Benefit"),
          amountMonthly: Number(b.amountMonthly ?? 0) || 0,
          paymentFrequency: (["weekly", "fortnightly", "monthly", "four-weekly"] as const).includes(b.paymentFrequency)
            ? b.paymentFrequency
            : "monthly",
        }))
      : [],
    onBenefits: parsed.onBenefits === true ? true : parsed.onBenefits === false ? false : null,
    nextBenefitPayDate: String(parsed.nextBenefitPayDate ?? ""),
    employmentType: (["employed", "self-employed", "unemployed"] as string[]).includes(parsed.employmentType as string)
      ? parsed.employmentType as EmploymentType
      : null,
    jobIncome: {
      employer: String(parsed.jobIncome?.employer ?? ""),
      amount: Number(parsed.jobIncome?.amount ?? 0) || 0,
      frequency: (["weekly", "fortnightly", "four-weekly", "monthly"] as string[]).includes(parsed.jobIncome?.frequency as string)
        ? parsed.jobIncome?.frequency as JobIncome["frequency"]
        : "monthly",
      nextPayDate: String(parsed.jobIncome?.nextPayDate ?? ""),
    },
    adviceMarkdown: String(parsed.adviceMarkdown ?? ""),
  });

  // Load from Supabase on mount; fall back to localStorage for one-time migration
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    // Step 1: Load localStorage immediately so data shows instantly
    if (storageKey && typeof window !== "undefined") {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<MoneyPlannerState>;
          const next = parseStoredState(parsed);
          setState(next);
          setGoalDraft(next.goal);
        } catch { /* ignore corrupt data */ }
      }
    }

    // Step 2: Load from Supabase and overwrite only if it has a goal title
    void (async () => {
      const [{ data }, { data: settingData }] = await Promise.all([
        (supabase as any)
          .from("user_money_planner")
          .select("goal,spends,tasks,debts,benefits,on_benefits,next_benefit_pay_date,employment_type,job_income,advice_markdown")
          .eq("user_id", user.id)
          .maybeSingle(),
        (supabase as any)
          .from("user_insight_settings")
          .select("money_planner_email_notifications_enabled,debt_weekly_checkin_enabled,debt_weekly_checkin_email_enabled")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      setPlannerEmailNotificationsEnabled(settingData?.money_planner_email_notifications_enabled ?? true);
      setDebtWeeklyCheckinEnabled(Boolean(settingData?.debt_weekly_checkin_enabled));
      setDebtWeeklyCheckinEmailEnabled(Boolean(settingData?.debt_weekly_checkin_email_enabled));

      if (data && data.goal?.title) {
        const next = parseStoredState({
          goal: data.goal ?? {},
          spends: data.spends ?? [],
          tasks: data.tasks ?? [],
          debts: data.debts ?? [],
          benefits: data.benefits ?? [],
          onBenefits: data.on_benefits ?? null,
          nextBenefitPayDate: data.next_benefit_pay_date ?? "",
          employmentType: data.employment_type ?? null,
          jobIncome: data.job_income ?? { employer: "", amount: 0, frequency: "monthly", nextPayDate: "" },
          adviceMarkdown: String(data.advice_markdown ?? ""),
        });
        setState(next);
        setGoalDraft(next.goal);
      }

      setDbLoaded(true);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Auto-sync goalDraft changes into state.goal so they auto-save to Supabase
  useEffect(() => {
    if (!dbLoaded) return;
    const isComplete = goalDraft.title.trim() && goalDraft.targetAmount > 0 && goalDraft.targetDate;
    setState((prev) => ({
      ...prev,
      goal: {
        ...goalDraft,
        active: isComplete ? true : prev.goal.active,
      },
    }));
  }, [goalDraft, dbLoaded]);

  useEffect(() => {
    if (!dbLoaded) return;
    if (lastSavedSnapshotRef.current) return;
    lastSavedSnapshotRef.current = serializePlannerState(state);
    lastSavedStateRef.current = state;
  }, [dbLoaded, state]);

  // Save to Supabase and localStorage on every state change (after initial load)
  // localStorage = instant local backup; Supabase = cross-device sync
  useEffect(() => {
    if (!user || !dbLoaded) return;

    const nextSnapshot = serializePlannerState(state);

    // Immediate localStorage save — never lose data locally
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }

    if (lastSavedSnapshotRef.current === nextSnapshot) return;

    // Debounced Supabase save (300ms) — cross-device sync
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        const { error } = await (supabase as any).from("user_money_planner").upsert({
          user_id: user.id,
          goal: state.goal,
          spends: state.spends,
          tasks: state.tasks,
          debts: state.debts,
          benefits: state.benefits,
          on_benefits: state.onBenefits,
          next_benefit_pay_date: state.nextBenefitPayDate || null,
          employment_type: state.employmentType,
          job_income: state.jobIncome,
          advice_markdown: state.adviceMarkdown,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

        if (error) {
          toast.error("Could not save your Money Planner changes.");
          return;
        }

        lastSavedSnapshotRef.current = nextSnapshot;
        lastSavedStateRef.current = state;
      })();
    }, 300);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, user, dbLoaded, storageKey]);

  const goalActive = state.goal.active && state.goal.targetAmount > 0;

  const totalSpent = useMemo(
    () => state.spends.reduce((sum, item) => sum + item.amount, 0),
    [state.spends],
  );

  const currentLiveBalance = useMemo(
    () => Math.max(0, state.goal.currentBalance - totalSpent),
    [state.goal.currentBalance, totalSpent],
  );

  // Has a pay date passed? Returns true if date is today or in the past.
  const isDateDue = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d <= today;
  };

  const jobIncomeDue = useMemo(() => {
    if (!state.jobIncome.nextPayDate || !state.jobIncome.amount) return null;
    if (!isDateDue(state.jobIncome.nextPayDate)) return null;
    return state.jobIncome.amount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.jobIncome.nextPayDate, state.jobIncome.amount]);

  const benefitIncomeDue = useMemo(() => {
    if (!state.nextBenefitPayDate || !state.onBenefits || state.benefits.length === 0) return null;
    if (!isDateDue(state.nextBenefitPayDate)) return null;
    return state.benefits.reduce((sum, b) => sum + b.amountMonthly * frequencyToMonthlyMultiplier(b.paymentFrequency), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nextBenefitPayDate, state.onBenefits, state.benefits]);

  const totalIncomeDue = (jobIncomeDue ?? 0) + (benefitIncomeDue ?? 0);

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
      debts: [...prev.debts, {
        id: crypto.randomUUID(),
        name,
        category: debtCategory,
        balance,
        apr,
        minPayment,
        nextPaymentDate: debtNextPaymentDate,
        lastPaymentDate: "",
        paymentStatus: "active",
        paymentBarrier: "",
      }],
      adviceMarkdown: "",
    }));

    setDebtName("");
    setDebtCategory("credit-card");
    setDebtBalance("");
    setDebtApr("");
    setDebtMinPayment("");
    setDebtNextPaymentDate("");
    setDebtSupportMarkdown("");
    setDebtChangesPending(true);
  };

  const removeDebt = (id: string) => {
    setState((prev) => ({
      ...prev,
      debts: prev.debts.filter((debt) => debt.id !== id),
    }));
    setDebtChangesPending(true);
  };

  const saveDebtUpdates = async () => {
    if (!user) return;
    if (!debtChangesPending) {
      toast.info("No new debt updates to save.");
      return;
    }

    setDebtSaveBusy(true);
    const previousState = lastSavedStateRef.current;
    const nextSnapshot = serializePlannerState(state);

    const { error } = await (supabase as any).from("user_money_planner").upsert({
      user_id: user.id,
      goal: state.goal,
      spends: state.spends,
      tasks: state.tasks,
      debts: state.debts,
      benefits: state.benefits,
      on_benefits: state.onBenefits,
      next_benefit_pay_date: state.nextBenefitPayDate || null,
      employment_type: state.employmentType,
      job_income: state.jobIncome,
      advice_markdown: state.adviceMarkdown,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (error) {
      setDebtSaveBusy(false);
      toast.error("Could not save debt updates.");
      return;
    }

    lastSavedSnapshotRef.current = nextSnapshot;
    lastSavedStateRef.current = state;
    setDebtChangesPending(false);

    if (plannerEmailNotificationsEnabled && user.email) {
      setEmailBusy(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) {
          toast.error("Debt updates saved, but we could not send the email.");
        } else {
          const emailResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
            },
            body: JSON.stringify({
              to: user.email,
              subject: "RealTalk debt updates saved",
              body: buildDebtSecurityEmailBody(previousState, state),
              skipQuota: true,
            }),
          });

          if (!emailResp.ok) {
            const errJson = await emailResp.json().catch(() => ({}));
            console.warn("[money-planner] Debt security email failed:", errJson?.error ?? emailResp.status);
            toast.error("Debt updates saved, but the email failed.");
          }
        }
      } catch (emailErr) {
        console.warn("[money-planner] Debt security email error:", emailErr);
        toast.error("Debt updates saved, but the email failed.");
      } finally {
        setEmailBusy(false);
      }
    }

    setDebtSaveBusy(false);
    toast.success("Debt updates saved.");
  };

  const frequencyToMonthlyMultiplier = (freq: BenefitEntry["paymentFrequency"]): number => {
    if (freq === "weekly") return 52 / 12;
    if (freq === "fortnightly") return 26 / 12;
    if (freq === "four-weekly") return 13 / 12;
    return 1; // monthly
  };

  const totalMonthlyBenefits = useMemo(
    () => state.benefits.reduce((sum, b) => sum + b.amountMonthly * frequencyToMonthlyMultiplier(b.paymentFrequency), 0),
    [state.benefits],
  );

  const openDebts = useMemo(
    () => state.debts.filter((debt) => debt.balance > 0 && debt.paymentStatus !== "paid-off"),
    [state.debts],
  );

  const debtCheckinPrompt = useMemo(() => {
    if (openDebts.length === 0) return "";
    return openDebts
      .map((debt) => [
        `- ${debt.name}`,
        `  category: ${debt.category}`,
        `  balance: ${formatMoney(debt.balance)}`,
        `  apr: ${debt.apr}%`,
        `  minimum payment: ${formatMoney(debt.minPayment)}`,
        `  next payment date: ${debt.nextPaymentDate || "not set"}`,
        `  last payment date: ${debt.lastPaymentDate || "not recorded"}`,
        `  status: ${debt.paymentStatus}`,
        `  blocker: ${debt.paymentBarrier || "not provided"}`,
      ].join("\n"))
      .join("\n");
  }, [openDebts]);

  const savePlannerNotificationSettings = async (patch: {
    money_planner_email_notifications_enabled?: boolean;
    debt_weekly_checkin_enabled?: boolean;
    debt_weekly_checkin_email_enabled?: boolean;
  }) => {
    if (!user) return { error: new Error("No user") };
    return (supabase as any).from("user_insight_settings").upsert({
      user_id: user.id,
      ...patch,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  };

  const togglePlannerEmailNotifications = async (enabled: boolean) => {
    if (!user) return;
    const previous = plannerEmailNotificationsEnabled;
    setPlannerEmailNotificationsEnabled(enabled);
    setPlannerNotificationSettingBusy(true);

    const { error } = await savePlannerNotificationSettings({
      money_planner_email_notifications_enabled: enabled,
    });

    setPlannerNotificationSettingBusy(false);

    if (error) {
      setPlannerEmailNotificationsEnabled(previous);
      toast.error("Failed to update Money Planner email notifications.");
      return;
    }

    toast.success(enabled ? "Money Planner security emails enabled" : "Money Planner security emails disabled");
  };

  const toggleDebtWeeklyCheckin = async (enabled: boolean) => {
    const previous = debtWeeklyCheckinEnabled;
    setDebtWeeklyCheckinEnabled(enabled);
    setPlannerNotificationSettingBusy(true);
    const { error } = await savePlannerNotificationSettings({ debt_weekly_checkin_enabled: enabled });
    setPlannerNotificationSettingBusy(false);
    if (error) {
      setDebtWeeklyCheckinEnabled(previous);
      toast.error("Failed to update weekly debt check-ins.");
      return;
    }
    toast.success(enabled ? "Weekly debt check-ins enabled" : "Weekly debt check-ins disabled");
  };

  const toggleDebtWeeklyCheckinEmail = async (enabled: boolean) => {
    const previous = debtWeeklyCheckinEmailEnabled;
    setDebtWeeklyCheckinEmailEnabled(enabled);
    setPlannerNotificationSettingBusy(true);
    const { error } = await savePlannerNotificationSettings({ debt_weekly_checkin_email_enabled: enabled });
    setPlannerNotificationSettingBusy(false);
    if (error) {
      setDebtWeeklyCheckinEmailEnabled(previous);
      toast.error("Failed to update debt email delivery.");
      return;
    }
    toast.success(enabled ? "Debt check-in emails enabled" : "Debt check-in emails disabled");
  };

  const updateDebt = (id: string, patch: Partial<DebtItem>) => {
    setState((prev) => ({
      ...prev,
      debts: prev.debts.map((debt) => (debt.id === id ? { ...debt, ...patch } : debt)),
      adviceMarkdown: "",
    }));
    setDebtSupportMarkdown("");
    setDebtChangesPending(true);
  };

  const generateDebtSupport = async () => {
    if (!user) return;
    if (openDebts.length === 0) {
      toast.error("Add an active debt first.");
      return;
    }

    const snapshot = await loadSubscriptionSnapshot(user.id);
    if (!canUseMeteredFeature("money_coach_plan", snapshot)) {
      const usage = snapshot.usage["money_coach_plan"];
      toast.error(
        `Money Planner AI limit reached (${usage.used}/${usage.limit} this month). Upgrade to get more plan generations.`,
      );
      return;
    }

    setDebtSupportBusy(true);
    setDebtSupportMarkdown("");

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: [
              "You are a debt support coach.",
              "Help the user keep up with debt payments without shame.",
              "If they look behind, identify the likely blocker and ask 2-3 direct follow-up questions they should answer in the app.",
              "Give concise markdown with these sections:",
              "1) Current risk",
              "2) What may be blocking payment",
              "3) Questions to answer this week",
              "4) Best next step",
              "5) A supportive note",
              "This is educational guidance, not regulated financial advice.",
              "",
              `Goal: ${state.goal.title || "Not set"}`,
              `Live balance: ${formatMoney(currentLiveBalance)}`,
              `Employment: ${state.employmentType ?? "not set"}`,
              `Job income: ${formatMoney(state.jobIncome.amount)} ${state.jobIncome.frequency}`,
              `Benefits: ${formatMoney(totalMonthlyBenefits)}/month`,
              "",
              "Open debts:",
              debtCheckinPrompt,
            ].join("\n"),
          }],
          beReal: false,
          emotionalMode: false,
          logicalMode: true,
          thinkDeeply: false,
          forcePlan: true,
          forceVent: false,
          ventAdviceMode: "none",
          userId: user.id,
        }),
      });

      if (!resp.ok || !resp.body) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(String(errJson?.error || "Could not generate debt support"));
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
            const json = JSON.parse(payload);
            const delta = String(json?.choices?.[0]?.delta?.content ?? "");
            if (delta) {
              output += delta;
              setDebtSupportMarkdown(output);
            }
          } catch {
            // ignore malformed stream chunks
          }
        }
      }

      if (!output.trim()) throw new Error("Could not generate debt support");

      await consumeMeteredFeature(user.id, "money_coach_plan").catch(() => {});
    } catch (error: any) {
      toast.error(error?.message || "Failed to generate debt support");
    } finally {
      setDebtSupportBusy(false);
    }
  };

  const confirmBalanceUpdate = async () => {
    const newBalance = parseFloat(balanceEditInput);
    if (isNaN(newBalance) || newBalance < 0) {
      toast.error("Please enter a valid balance amount.");
      return;
    }
    setState((s) => ({ ...s, goal: { ...s.goal, currentBalance: newBalance } }));
    setGoalDraft((d) => ({ ...d, currentBalance: newBalance }));
    setBalanceEditOpen(false);
    setBalanceEditInput("");
    toast.success(`Balance updated to £${newBalance.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  };

  const addBenefit = () => {
    const amount = parseAmount(benefitAmount);
    if (!benefitName.trim() || amount <= 0) {
      toast.error("Choose a benefit and enter a valid amount.");
      return;
    }
    setState((prev) => ({
      ...prev,
      benefits: [
        ...prev.benefits,
        { id: crypto.randomUUID(), name: benefitName, amountMonthly: amount, paymentFrequency: benefitFrequency },
      ],
    }));
    setBenefitAmount("");
  };

  const removeBenefit = (id: string) => {
    setState((prev) => ({ ...prev, benefits: prev.benefits.filter((b) => b.id !== id) }));
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
      .map((debt) => `- ${debt.name}: balance ${formatMoney(debt.balance)}, APR ${debt.apr}%, min ${formatMoney(debt.minPayment)}, next payment ${debt.nextPaymentDate || "not set"}, status ${debt.paymentStatus}, blocker ${debt.paymentBarrier || "not provided"}`)
      .join("\n");

    const benefitRows = state.benefits
      .map((b) => `- ${b.name}: ${formatMoney(b.amountMonthly)} ${b.paymentFrequency} (~${formatMoney(b.amountMonthly * frequencyToMonthlyMultiplier(b.paymentFrequency))}/month)`)
      .join("\n");
    const onBenefitsContext = state.benefits.length > 0
      ? `Yes — total ~${formatMoney(totalMonthlyBenefits)}/month across ${state.benefits.length} benefit(s)`
      : "No benefits recorded";

    const jobIncomeMonthly = state.jobIncome.amount > 0
      ? state.jobIncome.amount * frequencyToMonthlyMultiplier(state.jobIncome.frequency)
      : 0;
    const nextPayLabel = state.jobIncome.nextPayDate
      ? ` — next pay date: ${state.jobIncome.nextPayDate}${isDateDue(state.jobIncome.nextPayDate) ? " (due/received)" : ""}`
      : "";
    const employmentContext = state.employmentType === "employed"
      ? `Employed${state.jobIncome.employer ? ` at ${state.jobIncome.employer}` : ""} — take-home pay ${formatMoney(state.jobIncome.amount)} ${state.jobIncome.frequency} (~${formatMoney(jobIncomeMonthly)}/month)${nextPayLabel}`
      : state.employmentType === "self-employed"
      ? `Self-employed — take-home income ${formatMoney(state.jobIncome.amount)} ${state.jobIncome.frequency} (~${formatMoney(jobIncomeMonthly)}/month)${nextPayLabel}`
      : state.employmentType === "unemployed"
      ? "Unemployed"
      : "Employment status not provided";

    return [
      "You are a practical money accountability coach.",
      "The user is trying to save for a goal and may overthink spending decisions.",
      "Factor in their employment status and income when giving advice.",
      "If self-employed, factor in income variability and tax obligations.",
      "If on benefits, factor their benefit income into advice — acknowledge any benefit caps, conditionality rules, or saving restrictions that may apply (e.g. Universal Credit savings limit of £6,000 before it affects payments).",
      "Give concise and direct guidance.",
      "Output sections in this order:",
      "1) Money Advice (3 short bullets)",
      "2) This Week Plan (5 bullets max)",
      "3) To-Do Checklist (5-8 markdown checkboxes)",
      "4) Debt Move (if debt exists)",
      "5) Benefits note (if on benefits — flag any saving limits or rules the user should know)",
      "6) One anti-impulse spending rule",
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
      "Employment & income:",
      `- Status: ${employmentContext}`,
      "",
      "Benefits income:",
      `- On benefits: ${onBenefitsContext}`,
      benefitRows || "",
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
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">Money Planner security emails</CardTitle>
                  <CardDescription className="mt-1">
                    Email me when I manually save debt updates so I can confirm it was me.
                  </CardDescription>
                </div>
                <Switch
                  checked={plannerEmailNotificationsEnabled}
                  onCheckedChange={(checked) => void togglePlannerEmailNotifications(checked)}
                  disabled={plannerNotificationSettingBusy}
                  aria-label="Toggle Money Planner security emails"
                />
              </div>
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-border/50">
                <div>
                  <CardTitle className="text-base">Weekly debt check-ins</CardTitle>
                  <CardDescription className="mt-1">
                    Keep sending debt follow-up prompts until each debt is marked paid off. The AI asks what blocked the payment and adjusts support from your latest debt status.
                  </CardDescription>
                </div>
                <Switch
                  checked={debtWeeklyCheckinEnabled}
                  onCheckedChange={(checked) => void toggleDebtWeeklyCheckin(checked)}
                  disabled={plannerNotificationSettingBusy}
                  aria-label="Toggle weekly debt check-ins"
                />
              </div>
              <div className="flex items-start justify-between gap-4 pt-3 border-t border-border/50">
                <div>
                  <CardTitle className="text-base">Email debt check-ins</CardTitle>
                  <CardDescription className="mt-1">
                    Send the weekly debt follow-up by email. Turn this off if you want to keep debt check-ins on without email delivery.
                  </CardDescription>
                </div>
                <Switch
                  checked={debtWeeklyCheckinEmailEnabled}
                  onCheckedChange={(checked) => void toggleDebtWeeklyCheckinEmail(checked)}
                  disabled={plannerNotificationSettingBusy || !debtWeeklyCheckinEnabled}
                  aria-label="Toggle debt check-in emails"
                />
              </div>
            </CardHeader>
            {emailBusy && (
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">Sending your latest security email…</p>
              </CardContent>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center justify-between">
                  <span>Current live balance</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => { setBalanceEditOpen((v) => !v); setBalanceEditInput(String(state.goal.currentBalance || "")); }}
                    aria-label="Update balance"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </CardDescription>
                <CardTitle>{formatMoney(currentLiveBalance)}</CardTitle>
              </CardHeader>
              {balanceEditOpen && (
                <CardContent className="pt-0 space-y-2">
                  <Label className="text-xs">New balance (£)</Label>
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      value={balanceEditInput}
                      onChange={(e) => setBalanceEditInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void confirmBalanceUpdate(); if (e.key === "Escape") setBalanceEditOpen(false); }}
                      placeholder="e.g. 1240.00"
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button type="button" size="sm" onClick={() => void confirmBalanceUpdate()} disabled={emailBusy}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setBalanceEditOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              )}
              {(jobIncomeDue !== null || benefitIncomeDue !== null) && (
                <CardContent className="pt-0 space-y-1">
                  {jobIncomeDue !== null && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      + {formatMoney(jobIncomeDue)} pay received (
                      {state.jobIncome.employer ? state.jobIncome.employer : state.employmentType === "self-employed" ? "Self-employed" : "Employment"}
                      )
                    </p>
                  )}
                  {benefitIncomeDue !== null && (
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                      + {formatMoney(benefitIncomeDue)} benefits received
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Tap the ✏️ pencil icon to update your balance, then set your next pay date.
                  </p>
                </CardContent>
              )}
              {(state.jobIncome.nextPayDate && !isDateDue(state.jobIncome.nextPayDate)) && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">
                    Next pay: {new Date(state.jobIncome.nextPayDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {state.jobIncome.amount > 0 && ` · ${formatMoney(state.jobIncome.amount)}`}
                  </p>
                </CardContent>
              )}
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
                Create a goal first. Spend tracking and RealTalk money management only run when you are saving for something.
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
                <CardDescription>Track debt pressure, missed payments, and blockers so RealTalk can keep supporting you until each debt is cleared.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Input value={debtName} onChange={(event) => setDebtName(event.target.value)} placeholder="Debt name" />
                  <select
                    value={debtCategory}
                    onChange={(event) => setDebtCategory(event.target.value as DebtCategory)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {DEBT_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                  <Input inputMode="decimal" value={debtBalance} onChange={(event) => setDebtBalance(event.target.value)} placeholder="Balance" />
                  <Input inputMode="decimal" value={debtApr} onChange={(event) => setDebtApr(event.target.value)} placeholder="APR %" />
                  <Input inputMode="decimal" value={debtMinPayment} onChange={(event) => setDebtMinPayment(event.target.value)} placeholder="Min payment" />
                  <Input type="date" value={debtNextPaymentDate} onChange={(event) => setDebtNextPaymentDate(event.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={addDebt}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add debt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveDebtUpdates()}
                    disabled={debtSaveBusy || !debtChangesPending}
                  >
                    <Save className="mr-1.5 h-4 w-4" />
                    {debtSaveBusy ? "Saving debt…" : "Save debt updates"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => void generateDebtSupport()} disabled={debtSupportBusy || openDebts.length === 0}>
                    {debtSupportBusy ? "Thinking…" : "Get RealTalk debt support"}
                  </Button>
                </div>
                {debtChangesPending && (
                  <p className="text-xs text-muted-foreground">
                    Debt edits pending. Click Save debt updates to lock changes and send your security email.
                  </p>
                )}

                <div className="rounded-md border border-border/70 p-2.5 text-sm space-y-1">
                  <p>Total debt: <strong>{formatMoney(totalDebt)}</strong></p>
                  <p>Monthly minimums: <strong>{formatMoney(totalMinDebtPayment)}</strong></p>
                  <p>Open debts: <strong>{openDebts.length}</strong></p>
                  <p>
                    Rough payoff estimate: <strong>{debtMonthsEstimate ? `${debtMonthsEstimate} months` : "Not enough data"}</strong>
                  </p>
                </div>

                {debtSupportMarkdown && (
                  <div className="rounded-md border border-border/70 p-3 prose-realtalk max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{debtSupportMarkdown}</ReactMarkdown>
                  </div>
                )}

                <div className="space-y-2">
                  {state.debts.map((debt) => (
                    <div key={debt.id} className="rounded-md border border-border/70 p-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{debt.name}</p>
                            <Badge variant="secondary" className="text-[10px] font-medium">
                              {DEBT_CATEGORIES.find((category) => category.value === debt.category)?.label ?? "Other"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatMoney(debt.balance)} · APR {debt.apr}% · min {formatMoney(debt.minPayment)}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDebt(debt.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <select
                          value={debt.category}
                          onChange={(event) => updateDebt(debt.id, { category: event.target.value as DebtCategory })}
                          className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                        >
                          {DEBT_CATEGORIES.map((category) => (
                            <option key={category.value} value={category.value}>{category.label}</option>
                          ))}
                        </select>
                        <select
                          value={debt.paymentStatus}
                          onChange={(event) => updateDebt(debt.id, { paymentStatus: event.target.value as DebtStatus })}
                          className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                        >
                          <option value="active">Active</option>
                          <option value="missed">Missed payment</option>
                          <option value="paid-off">Paid off</option>
                        </select>
                        <Input
                          type="date"
                          value={debt.nextPaymentDate}
                          onChange={(event) => updateDebt(debt.id, { nextPaymentDate: event.target.value })}
                        />
                        <Input
                          type="date"
                          value={debt.lastPaymentDate}
                          onChange={(event) => updateDebt(debt.id, { lastPaymentDate: event.target.value })}
                          placeholder="Last payment date"
                        />
                        <Input
                          value={debt.paymentBarrier}
                          onChange={(event) => updateDebt(debt.id, { paymentBarrier: event.target.value })}
                          placeholder="If payment is blocked, why?"
                        />
                      </div>
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
              <CardTitle>Income & Employment</CardTitle>
              <CardDescription>
                Tell us about your work situation so RealTalk can tailor your money plan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Employment status selector */}
              <div className="space-y-2">
                <Label>What is your employment status?</Label>
                <div className="flex flex-wrap gap-2">
                  {(["employed", "self-employed", "unemployed"] as const).map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      variant={state.employmentType === opt ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEmploymentType(opt)}
                      className="capitalize"
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Employed / Self-employed job fields */}
              {(state.employmentType === "employed" || state.employmentType === "self-employed") && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-border/60 pt-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>
                      {state.employmentType === "self-employed" ? "Your business / trade name (optional)" : "Employer name (optional)"}
                    </Label>
                    <Input
                      value={state.jobIncome.employer}
                      onChange={(e) => setJobIncome({ employer: e.target.value })}
                      placeholder={state.employmentType === "self-employed" ? "e.g. Freelance design" : "e.g. NHS, Tesco"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Take-home pay (after tax)</Label>
                    <Input
                      inputMode="decimal"
                      value={jobAmountInput}
                      onChange={(e) => {
                        setJobAmountInput(e.target.value);
                        const n = parseFloat(e.target.value);
                        if (!isNaN(n)) setJobIncome({ amount: n });
                      }}
                      placeholder="e.g. 1800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pay frequency</Label>
                    <select
                      value={state.jobIncome.frequency}
                      onChange={(e) => setJobIncome({ frequency: e.target.value as JobIncome["frequency"] })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="fortnightly">Fortnightly</option>
                      <option value="four-weekly">Every 4 weeks</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  {state.jobIncome.amount > 0 && (
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      ~{formatMoney(state.jobIncome.amount * frequencyToMonthlyMultiplier(state.jobIncome.frequency))}/month
                      {state.employmentType === "self-employed" && " — remember to set aside money for tax and National Insurance."}
                    </p>
                  )}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>When are you next paid?</Label>
                    <Input
                      type="date"
                      value={state.jobIncome.nextPayDate}
                      onChange={(e) => setJobIncome({ nextPayDate: e.target.value })}
                    />
                    {state.jobIncome.nextPayDate && isDateDue(state.jobIncome.nextPayDate) && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Pay date reached — update your balance to reflect receipt, then set your next pay date.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Benefits section — only for unemployed */}
              {state.employmentType === "unemployed" && (
                <div className="border-t border-border/60 pt-3 space-y-4">
                  <p className="text-sm font-medium">Benefits income</p>
                  <CardDescription>
                    Are you receiving any benefits? Adding them helps RealTalk plan around your actual income and flag any saving limits that apply.
                  </CardDescription>

                  {onBenefits === null && (
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setOnBenefits(true)}>
                        Yes, I'm on benefits
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setOnBenefits(false)}>
                        No, skip this
                      </Button>
                    </div>
                  )}

                  {onBenefits === false && (
                    <p className="text-sm text-muted-foreground">
                      No benefits recorded.{" "}
                      <button type="button" className="underline text-primary" onClick={() => setOnBenefits(null)}>
                        Change
                      </button>
                    </p>
                  )}

                  {onBenefits === true && (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                          <Label>Benefit type</Label>
                          <select
                            value={benefitName}
                            onChange={(e) => setBenefitName(e.target.value)}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {UK_BENEFITS_LIST.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Amount you receive</Label>
                          <Input
                            inputMode="decimal"
                            value={benefitAmount}
                            onChange={(e) => setBenefitAmount(e.target.value)}
                            placeholder="e.g. 650"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Payment frequency</Label>
                          <select
                            value={benefitFrequency}
                            onChange={(e) => setBenefitFrequency(e.target.value as BenefitEntry["paymentFrequency"])}
                            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="weekly">Weekly</option>
                            <option value="fortnightly">Fortnightly</option>
                            <option value="four-weekly">Every 4 weeks</option>
                            <option value="monthly">Monthly</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button type="button" onClick={addBenefit}>Add benefit</Button>
                        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setOnBenefits(null)}>
                          I'm not on benefits
                        </button>
                      </div>

                      {state.benefits.length > 0 && (
                        <div className="space-y-2">
                          <div className="rounded-md border border-border/70 p-2.5 text-sm font-medium">
                            Total benefit income: ~{formatMoney(totalMonthlyBenefits)}/month
                          </div>
                          {state.benefits.map((b) => (
                            <div key={b.id} className="rounded-md border border-border/70 p-2.5 flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{b.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatMoney(b.amountMonthly)} {b.paymentFrequency} · ~{formatMoney(b.amountMonthly * frequencyToMonthlyMultiplier(b.paymentFrequency))}/month
                                </p>
                              </div>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeBenefit(b.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Note: if you are on Universal Credit, savings over £6,000 may reduce your payments. The AI will factor this into your plan.
                      </p>

                      <div className="space-y-1.5">
                        <Label>When are you next paid benefits?</Label>
                        <Input
                          type="date"
                          value={state.nextBenefitPayDate}
                          onChange={(e) => setState((prev) => ({ ...prev, nextBenefitPayDate: e.target.value }))}
                        />
                        {state.nextBenefitPayDate && isDateDue(state.nextBenefitPayDate) && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Benefit pay date reached — update your balance to reflect receipt, then set your next payment date.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {state.employmentType === null && (
                <p className="text-xs text-muted-foreground">Select your employment status above to continue.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Money Advice</CardTitle>
              <CardDescription>
                RealTalk uses your current goal, spending logs, debt, and checklist to build your money plan.
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
                  value="No RealTalk advice generated yet. Click Generate money plan after setting your goal and logging spending."
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
