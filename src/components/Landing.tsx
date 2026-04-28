import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowUp, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PLAN_CATALOG, STRIPE_BILLING_ENABLED, type SubscriptionPlan } from "@/lib/subscriptions";
import { useAuth } from "@/lib/auth";
import logo from "../assets/logo.png";

type DemoMsg = { role: "user" | "assistant"; content: string };
type PreviewFeature = "none" | "thinking" | "plan" | "vent" | "benefits";

const MAX_GUEST_MESSAGES = 8;
const FEATURE_LIMITS = {
  thinking: 2,
  plan: 2,
  vent: 3,
  benefits: 2,
} as const;

const HELP_TOPICS = [
  "Dealing with Money Issues",
  "Dealing with Stress",
  "Difficult Landlords",
  "Mental Health Guidance",
  "A Place to Vent",
  "CV & Career Advice",
  "Student Life Support",
] as const;

const QUICK_STARTS: Array<{ label: string; text: string; feature: PreviewFeature }> = [
  { label: "Money stress", text: "I'm stressed about money and need one clear next step.", feature: "thinking" },
  { label: "Landlord issue", text: "My landlord is ignoring repairs. What should I do first?", feature: "plan" },
  { label: "Universal Credit help", text: "I need help preparing for a Universal Credit journal message.", feature: "benefits" },
  { label: "Anxiety spiral", text: "I'm overthinking and feel stuck in a loop.", feature: "vent" },
] as const;

const FEATURE_LABELS: Record<PreviewFeature, string> = {
  none: "RealTalk",
  thinking: "Deep Thinking",
  plan: "Plan Mode",
  vent: "Vent Mode",
  benefits: "Benefits Helper",
};

const createDemoReply = (text: string, feature: PreviewFeature) => {
  const lower = text.toLowerCase();

  if (feature === "vent") {
    return "I hear how much pressure is sitting on you. Stay with the one part that feels loudest right now, and I'll help you untangle it without rushing you.";
  }

  if (feature === "plan") {
    return "Here's a first move: define the exact outcome you need by the end of the week, then pick the smallest action that proves progress today. If this were saved in RealTalk, I'd turn it into a follow-through plan.";
  }

  if (feature === "benefits") {
    return "Benefits Helper preview: start by writing down the change, the date it happened, and any evidence you have. For Universal Credit, keep journal messages factual and ask for the exact action you need. This is guidance, not official DWP or legal advice.";
  }

  if (feature === "thinking") {
    return "Lite deep-thinking preview: the core issue seems to be pressure + uncertainty. What’s the one decision that would reduce the most stress today?";
  }

  if (lower.includes("overthink") || lower.includes("overthinking")) {
    return "That loop is exhausting. What’s one thought you keep replaying most?";
  }
  if (lower.includes("money") || lower.includes("budget")) {
    return "Money stress is heavy. Want to start by listing your top 3 monthly costs?";
  }
  if (lower.includes("anxious") || lower.includes("anxiety") || lower.includes("stress")) {
    return "I hear you. Right now, what feels most out of control?";
  }
  return "Thanks for sharing that. If we focus on one part first, which part matters most?";
};

export function Landing() {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [landingCycle, setLandingCycle] = useState<"monthly" | "annual">("monthly");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [feature, setFeature] = useState<PreviewFeature>("none");
  const [featureUses, setFeatureUses] = useState({ thinking: 0, plan: 0, vent: 0, benefits: 0 });
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const [helpIndex, setHelpIndex] = useState(0);
  const [messages, setMessages] = useState<DemoMsg[]>([
    {
      role: "assistant",
      content:
        "Welcome to RealTalk preview. Share what’s on your mind and I’ll help you think through it.",
    },
  ]);

  const guestMessageCount = messages.filter((m) => m.role === "user").length;
  const guestLimitReached = guestMessageCount >= MAX_GUEST_MESSAGES;
  const thinkingRemaining = FEATURE_LIMITS.thinking - featureUses.thinking;
  const planRemaining = FEATURE_LIMITS.plan - featureUses.plan;
  const ventRemaining = FEATURE_LIMITS.vent - featureUses.vent;
  const benefitsRemaining = FEATURE_LIMITS.benefits - featureUses.benefits;
  const featureRemaining: Record<PreviewFeature, number | null> = {
    none: null,
    thinking: thinkingRemaining,
    plan: planRemaining,
    vent: ventRemaining,
    benefits: benefitsRemaining,
  };
  const currentHelpTopic = HELP_TOPICS[helpIndex];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const trackEvent = (event: string, props?: Record<string, string | number | boolean>) => {
    const payload = { event, page: "landing", ...props };
    try {
      const w = globalThis as unknown as {
        gtag?: (action: string, eventName: string, params?: Record<string, unknown>) => void;
        plausible?: (eventName: string, options?: { props?: Record<string, unknown> }) => void;
      };
      w.gtag?.("event", event, payload);
      w.plausible?.(event, { props: payload });
      globalThis.dispatchEvent(new CustomEvent("realtalk:tracking", { detail: payload }));
    } catch {
      // no-op in environments without analytics hooks
    }
  };

  const landingCheckout = async (plan: SubscriptionPlan, cycle: "monthly" | "annual") => {
    if (checkoutBusy) return;
    if (!user || !session) {
      localStorage.setItem("realtalk_pending_checkout", JSON.stringify({ plan, cycle }));
      void navigate({ to: "/auth" });
      return;
    }
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
      console.error(e);
      setCheckoutBusy(false);
    }
  };

  const sendPreview = async () => {
    const text = input.trim();
    if (!text || busy || guestLimitReached) return;

    if (feature === "thinking" && thinkingRemaining <= 0) return;
    if (feature === "plan" && planRemaining <= 0) return;
    if (feature === "vent" && ventRemaining <= 0) return;
    if (feature === "benefits" && benefitsRemaining <= 0) return;

    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    if (feature !== "none") {
      setFeatureUses((prev) => ({ ...prev, [feature]: prev[feature] + 1 }));
    }

    try {
      const currentMessages = [...messages, { role: "user" as const, content: text }];
      const outboundMessages = currentMessages
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: outboundMessages,
          beReal: false,
          emotionalMode: feature === "vent",
          logicalMode: feature !== "vent",
          thinkDeeply: feature === "thinking",
          forcePlan: feature === "plan",
          forceBenefits: feature === "benefits",
          forceVent: feature === "vent",
          ventAdviceMode: "advice",
          userPlan: "free",
          totalMessageCount: guestMessageCount,
          memoryLimit: MAX_GUEST_MESSAGES,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Preview backend unavailable");

      let assistant = "";
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;

      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buf += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(json);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              assistant += delta;
            }
          } catch {
            // Ignore partial frames and continue reading.
          }
        }
      }

      const finalReply = assistant.trim() || createDemoReply(text, feature);
      setMessages((prev) => [...prev, { role: "assistant", content: finalReply }]);
    } catch {
      const fallbackReply = createDemoReply(text, feature);
      setMessages((prev) => [...prev, { role: "assistant", content: fallbackReply }]);
    } finally {
      setBusy(false);
      trackEvent("preview_message_sent", { feature: feature !== "none" ? feature : "default" });
    }
  };

  const quickStart = (item: (typeof QUICK_STARTS)[number]) => {
    setFeature(item.feature);
    setInput(item.text);
    trackEvent("quick_start_selected", { text: item.label, feature: item.feature });
    globalThis.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => inputRef.current?.focus(), 250);
  };

  return (
    <div className="flex-1 realtalk-ambient">
      <div className="fixed top-0 inset-x-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-2xl px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3">
          <img src={logo} alt="RealTalk" className="h-10 w-auto" />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <a href="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">
              Privacy Policy
            </a>
            <Link to="/auth">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full px-3 sm:px-4"
                onClick={() => trackEvent("cta_clicked", { cta: "header_log_in" })}
              >
                Log in
              </Button>
            </Link>
            <Link to="/auth">
              <Button
                size="sm"
                className="rounded-full px-3 sm:px-4"
                onClick={() => trackEvent("signup_started", { source: "header_sign_up" })}
              >
                Sign Up
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <section className="px-4 pt-16 pb-4 flex items-start justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-3xl w-full text-center"
        >
        <div className="rounded-2xl border border-border bg-surface/70 backdrop-blur text-left overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 text-xs text-muted-foreground flex items-center justify-between gap-3">
            <span>Guest preview chat</span>
            <span>{MAX_GUEST_MESSAGES - guestMessageCount} guest messages left</span>
          </div>

          <div className="px-4 py-4 space-y-3 min-h-72 max-h-[28rem] overflow-y-auto">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "bg-surface-elevated rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] text-sm"
                      : "text-sm text-foreground/95 max-w-[90%]"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
          </div>

          <div ref={messagesEndRef} />

          {feature !== "none" && (
            <div className="px-4 pt-2">
              <button
                type="button"
                onClick={() => setFeature("none")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs rounded-full hover:bg-primary/30 transition-colors"
              >
                {feature === "benefits" && "Benefits Helper"}
                {feature === "thinking" && "💭 Deep Thinking (lite)"}
                {feature === "plan" && "📋 Plan"}
                {feature === "vent" && "🫶 Vent"}
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
          )}

          <div className="px-3 py-3 border-t border-border/60 flex items-center gap-2">
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setShowFeatureMenu((v) => !v)}
                aria-label="Open preview feature menu"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>

              {showFeatureMenu && (
                <div className="absolute bottom-full left-0 mb-2 bg-surface border border-border rounded-lg shadow-lg z-50 w-56 p-2">
                  <button
                    type="button"
                    disabled={thinkingRemaining <= 0}
                    onClick={() => {
                      setFeature("thinking");
                      setShowFeatureMenu(false);
                      trackEvent("feature_selected", { feature: "thinking" });
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                      feature === "thinking"
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                    } ${thinkingRemaining <= 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    💭 Deep Thinking (lite) · {Math.max(0, thinkingRemaining)} left
                  </button>

                  <button
                    type="button"
                    disabled={planRemaining <= 0}
                    onClick={() => {
                      setFeature("plan");
                      setShowFeatureMenu(false);
                      trackEvent("feature_selected", { feature: "plan" });
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                      feature === "plan"
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                    } ${planRemaining <= 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    📋 Plan · {Math.max(0, planRemaining)} left
                  </button>

                  <button
                    type="button"
                    disabled={ventRemaining <= 0}
                    onClick={() => {
                      setFeature("vent");
                      setShowFeatureMenu(false);
                      trackEvent("feature_selected", { feature: "vent" });
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                      feature === "vent"
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                    } ${ventRemaining <= 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    🫶 Vent · {Math.max(0, ventRemaining)} left
                  </button>

                  <button
                    type="button"
                    disabled={benefitsRemaining <= 0}
                    onClick={() => {
                      setFeature("benefits");
                      setShowFeatureMenu(false);
                      trackEvent("feature_selected", { feature: "benefits" });
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                      feature === "benefits"
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                    } ${benefitsRemaining <= 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    Benefits Helper - {Math.max(0, benefitsRemaining)} left
                  </button>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void sendPreview();
                }
              }}
              disabled={busy || guestLimitReached}
              placeholder={guestLimitReached ? "Preview limit reached — create account to continue" : "Try RealTalk…"}
              className="flex-1 bg-transparent text-sm outline-none px-2 py-1.5 placeholder:text-muted-foreground/70 disabled:opacity-60"
            />
            <Button
              type="button"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => void sendPreview()}
              disabled={!input.trim() || busy || guestLimitReached}
              aria-label="Send preview message"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
          </div>

          {guestLimitReached && (
            <div className="px-4 pb-4">
              <Link to="/auth">
                <Button
                  className="w-full"
                  size="sm"
                  onClick={() => trackEvent("signup_started", { source: "preview_limit_cta" })}
                >
                  Create free account to continue
                </Button>
              </Link>
            </div>
          )}
        </div>

      </motion.div>
      </section>

      <section className="px-4 pt-3 pb-7 flex items-start justify-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-2xl w-full text-center"
        >
        <div className="font-serif text-5xl md:text-6xl tracking-tight leading-[1.05]">
          Think clearly.
          <br />
          <span className="italic text-primary">Decide better.</span>
        </div>
        <p className="mt-4 text-muted-foreground text-base md:text-lg leading-relaxed">
          RealTalk is a calm AI companion that helps you cut through overthinking, find clarity, and
          turn what's on your mind into clear plans.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to="/auth">
            <Button
              size="lg"
              className="rounded-full px-7"
              onClick={() => trackEvent("signup_started", { source: "hero_start_thinking" })}
            >
              Start thinking
            </Button>
          </Link>
        </div>

        <p className="mt-7 text-xs text-muted-foreground/70">
          One quiet space. No noise. No notifications.
        </p>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <h2 className="text-base md:text-lg font-semibold tracking-tight">About RealTalk</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            RealTalk is a calm AI companion for people who feel stuck, overwhelmed, or caught in overthinking.
            It provides guidance and advice through reflection, planning, and supportive conversations—but it can't replace
            professional mental health treatment for complex issues.
          </p>

          <div className="mt-3 grid gap-2 text-sm text-foreground/90">
            <p>• Think more clearly when your mind feels noisy.</p>
            <p>• Build simple action plans you can actually follow.</p>
            <p>• Use vent mode to release emotions in a safe, judgment-free space.</p>
            <p>• Track patterns over time with optional weekly insights.</p>
          </div>

          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            The goal is simple: less mental clutter, better decisions, and steady progress in your day-to-day life.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <h3 className="text-sm md:text-base font-semibold tracking-tight">Built for students &amp; professionals</h3>
          <p className="mt-1 text-xs text-muted-foreground">RealTalk isn't just for personal clarity — it's a full toolkit for career growth and academic life.</p>
          <div className="mt-3 grid gap-3">
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <p className="text-sm font-semibold">🎓 Student Plan</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Designed for university students. Get CV reviews, cover letters, job matching, transferable skills analysis, and personal statements — all with deep thinking and unlimited planning. Requires an academic email (e.g. .ac.uk, .edu).</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <p className="text-sm font-semibold">💼 Professional Plan</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">For working professionals who need more. Higher CV toolkit usage, more voice input, Gmail send, and unlimited planning — everything you need to stay sharp and move forward.</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <p className="text-sm font-semibold">📄 CV Toolkit</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">Upload your CV and get an AI score, section-by-section feedback, job match analysis, a tailored cover letter, section rewrites, transferable skills breakdown, and a personal statement — all in one place.</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <h3 className="text-sm md:text-base font-semibold tracking-tight">What RealTalk can help with</h3>
          <div className="mt-3 flex items-center justify-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border border-border"
              onClick={() =>
                setHelpIndex((prev) => (prev - 1 + HELP_TOPICS.length) % HELP_TOPICS.length)
              }
              aria-label="Previous help topic"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <motion.div
              key={currentHelpTopic}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="h-40 w-40 sm:h-44 sm:w-44 md:h-56 md:w-56 rounded-full border border-primary/40 bg-gradient-to-br from-primary/25 to-primary/10 shadow-[0_0_45px_-20px_rgba(147,51,234,0.8)] flex items-center justify-center text-center p-4 sm:p-6"
            >
              <p className="text-base md:text-xl font-black tracking-tight leading-tight text-foreground">
                {currentHelpTopic}
              </p>
            </motion.div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border border-border"
              onClick={() => setHelpIndex((prev) => (prev + 1) % HELP_TOPICS.length)}
              aria-label="Next help topic"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 flex items-center justify-center gap-1.5">
            {HELP_TOPICS.map((topic, i) => (
              <span
                key={topic}
                className={`h-1.5 rounded-full transition-all ${
                  i === helpIndex ? "w-6 bg-primary" : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <h3 className="text-sm md:text-base font-semibold tracking-tight">How it works</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <p><span className="font-semibold">1) Share what’s heavy:</span> say what’s on your mind in plain words.</p>
            <p><span className="font-semibold">2) Get clarity:</span> RealTalk helps break down noise and identify what matters most.</p>
            <p><span className="font-semibold">3) Move forward:</span> turn insight into small practical actions you can follow today.</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm md:text-base font-semibold tracking-tight">Subscription plans</h3>
            {!STRIPE_BILLING_ENABLED && (
              <span className="text-[11px] rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
                Stripe not live yet
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a plan and subscribe directly. Start free, upgrade anytime.
          </p>

          <div className="mt-3 -mx-1 px-1 overflow-x-auto">
            {/* Billing cycle toggle */}
            <div className="flex gap-1 mb-3 p-0.5 w-fit rounded-lg bg-muted/50 border border-border/50">
              {(["monthly", "annual"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setLandingCycle(c)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    landingCycle === c
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c === "monthly" ? "Monthly" : "Annual (save ~25%)"}
                </button>
              ))}
            </div>
            <div className="flex gap-3 min-w-max pb-1">
              {PLAN_CATALOG.map((item) => (
                <div
                  key={item.plan}
                  className="w-[250px] shrink-0 rounded-xl border border-border/70 bg-background/50 p-3 flex flex-col"
                >
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="mt-1 text-sm font-bold text-foreground">
                    {item.plan === "free" ? "£0.00/mo" : landingCycle === "monthly"
                      ? `£${item.pricing.monthlyGbp.toFixed(2)}/mo`
                      : `£${item.pricing.annualGbp.toFixed(2)}/yr`}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">{item.blurb}</div>
                  <div className="mt-2 space-y-1 flex-1">
                    {item.features.map((f) => (
                      <p key={f} className="text-[11px] text-muted-foreground">• {f}</p>
                    ))}
                  </div>
                  <div className="mt-3">
                    {item.plan === "free" ? (
                      <Link to="/auth">
                        <button
                          type="button"
                          className="w-full rounded-lg border border-border text-xs font-medium h-8 hover:bg-muted/50 transition-colors"
                        >
                          Get started free
                        </button>
                      </Link>
                    ) : STRIPE_BILLING_ENABLED ? (
                      <button
                        type="button"
                        disabled={checkoutBusy}
                        onClick={() => void landingCheckout(item.plan as SubscriptionPlan, landingCycle)}
                        className="w-full rounded-lg bg-primary text-primary-foreground text-xs font-medium h-8 hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {checkoutBusy ? "…" : `Subscribe ${landingCycle === "annual" ? "(Annual)" : "(Monthly)"}`}
                      </button>
                    ) : (
                      <Link to="/auth">
                        <button
                          type="button"
                          className="w-full rounded-lg bg-primary text-primary-foreground text-xs font-medium h-8 hover:bg-primary/90 transition-colors"
                        >
                          Sign up to subscribe
                        </button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <h3 className="text-sm md:text-base font-semibold tracking-tight">Quick starts</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_STARTS.map((topic) => (
              <button
                key={topic.label}
                type="button"
                onClick={() => quickStart(topic)}
                className="px-3 py-1.5 rounded-full text-xs sm:text-sm border border-border bg-background/70 hover:bg-primary/10 hover:border-primary/40 transition-colors"
              >
                {topic.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <h3 className="text-sm md:text-base font-semibold tracking-tight">Safety & trust</h3>
          <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
            <p>• You control what you share and can choose whether monitoring/insights are enabled.</p>
            <p>• Gmail send access is optional and only used when you choose to send email from RealTalk.</p>
            <p>• RealTalk is designed for clarity and support, not judgment.</p>
            <p>• In emergencies or crisis situations, contact local emergency or crisis services immediately.</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-5 text-center">
          <p className="text-base md:text-lg font-semibold">Ready to turn overthinking into action?</p>
          <p className="mt-1 text-sm text-muted-foreground">Start with one conversation and walk away with a clearer next step.</p>
          <div className="mt-3 flex items-center justify-center">
            <Link to="/auth">
              <Button onClick={() => trackEvent("signup_started", { source: "mid_page_cta" })}>Create your free account</Button>
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-surface/60 backdrop-blur px-4 py-4 text-left">
          <h3 className="text-sm md:text-base font-semibold tracking-tight">Frequently asked questions</h3>
          <Accordion type="single" collapsible className="mt-2">
            <AccordionItem value="q1">
              <AccordionTrigger>Is RealTalk free?</AccordionTrigger>
              <AccordionContent>
                Yes, you can start with a free account and use core conversation features.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2">
              <AccordionTrigger>Is my data private?</AccordionTrigger>
              <AccordionContent>
                Your conversations are tied to your account, and insight monitoring is optional and user-controlled.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3">
              <AccordionTrigger>Can it replace therapy or emergency support?</AccordionTrigger>
              <AccordionContent>
                No. RealTalk is a support tool, not a replacement for licensed care or crisis response.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4">
              <AccordionTrigger>Can I save chats and plans?</AccordionTrigger>
              <AccordionContent>
                Yes. Signed-in users can keep conversations and save plans for follow-through.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q5">
              <AccordionTrigger>What are weekly insights?</AccordionTrigger>
              <AccordionContent>
                Optional summaries that highlight emotional and overthinking patterns across your recent chats.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q6">
              <AccordionTrigger>What is the CV Toolkit?</AccordionTrigger>
              <AccordionContent>
                The CV Toolkit lets you upload your CV and get an AI-powered score, strengths, improvements, job match analysis, a tailored cover letter, section rewrites, transferable skills breakdown, and a personal statement. Available on all plans, with higher daily usage on Student and Professional.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q7">
              <AccordionTrigger>How do I get the Student plan?</AccordionTrigger>
              <AccordionContent>
                Sign up using your university email address (e.g. ending in .ac.uk or .edu). The Student plan is automatically available when your account email is recognised as academic.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="mt-4 pb-3 text-center">
          <p className="text-sm text-muted-foreground">Less mental clutter. Better decisions. Consistent progress.</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <Link to="/auth">
              <Button onClick={() => trackEvent("signup_started", { source: "final_cta_sign_up" })}>Sign up free</Button>
            </Link>
            <Link to="/auth">
              <Button variant="ghost" onClick={() => trackEvent("cta_clicked", { cta: "final_cta_log_in" })}>
                Log in
              </Button>
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/refund-policy" className="hover:text-foreground transition-colors">Refund &amp; Cancellation</Link>
            <Link to="/account-data" className="hover:text-foreground transition-colors">Account & data export</Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground/80">
            © ™ 2026 RealTalk LTD. All Rights Reserved. &nbsp;·&nbsp; v1.0
          </p>
        </div>
      </motion.div>
      </section>
    </div>
  );
}
