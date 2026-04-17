import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mic, ArrowUp, Bookmark, Trash2, ChevronDown, Plus, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useSearch, useNavigate } from "@tanstack/react-router";
import logo from "../../assets/logo.png";

type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  ventChoicePending?: boolean;
  features?: string[];
};
type VentAdviceMode = "none" | "advice";

export function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { c?: string };
  const [convId, setConvId] = useState<string | null>(search?.c ?? null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const isSendingRef = useRef(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [beReal, setBeReal] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [forceThinking, setForceThinking] = useState(false);
  const [forcePlan, setForcePlan] = useState(false);
  const [forceVent, setForceVent] = useState(false);
  const [ventAdviceMode, setVentAdviceMode] = useState<VentAdviceMode>("none");
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const [editingPlanIndex, setEditingPlanIndex] = useState<number | null>(null);
  const [editedPlanText, setEditedPlanText] = useState("");
  const [isRegeneratingPlan, setIsRegeneratingPlan] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync convId with search params
  useEffect(() => {
    setConvId(search?.c ?? null);
  }, [search?.c]);

   // load + live-sync current conversation messages
   useEffect(() => {
    if (!convId || !user) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,role,content")
        .eq("conversation_id", convId)
        .order("created_at");

      if (!cancelled && data && !isSendingRef.current) {
        setMessages(data as Msg[]);
      }
    };

    void loadMessages();

    const channel = supabase
      .channel(`messages-${convId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${convId}`,
        },
        () => void loadMessages(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [convId, user]);

  useLayoutEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    setIsAtBottom(true);
  }, [messages, busy]);

  // Handle scroll position detection
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    
    let timeoutId: NodeJS.Timeout;
    
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!scrollContainer) return;
        const distanceFromBottom = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight);
        const isBottom = distanceFromBottom < 150;
        setIsAtBottom(isBottom);
      }, 100);
    };
    
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      clearTimeout(timeoutId);
    };
  }, []);

  const scrollToBottom = () => {
    console.log("Scroll button clicked");
    
    // Scroll the window instead
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth"
    });
    
    // Mark as at bottom after scroll completes
    setTimeout(() => {
      setIsAtBottom(true);
    }, 600);
  };

  // auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const ensureConversation = async (firstUserMsg: string): Promise<string> => {
    if (convId) return convId;
    const title = firstUserMsg.slice(0, 60).trim() || "New conversation";
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user!.id, title })
      .select("id")
      .single();
    if (error) throw error;
    setConvId(data.id);
    navigate({ to: "/", search: { c: data.id } as never, replace: true });
    window.dispatchEvent(new Event("conversationCreated"));
    return data.id;
  };

  const isCodingRelated = (text: string): boolean => {
    const codingKeywords = [
      "code", "coding", "debug", "debugging", "function", "class", "variable",
      "syntax", "algorithm", "python", "javascript", "java", "c\\+\\+", "html",
      "css", "react", "node", "programming", "bug", "error", "fix code", "write code",
      "script", "loop", "if statement", "array", "object", "database", "sql",
      "api", "endpoint", "backend", "frontend", "library", "framework", "npm",
      "git", "github", "deploy", "server", "localhost", "terminal", "command",
    ];
    const lowerText = text.toLowerCase();
    return codingKeywords.some(keyword => lowerText.includes(keyword));
  };

  const userAskedForPlan = (text: string): boolean => {
    const lower = text.toLowerCase();
    const planIntentKeywords = [
      "plan",
      "roadmap",
      "steps",
      "strategy",
      "timeline",
      "budget",
      "how should i",
      "what should i do",
      "help me organize",
      "action plan",
      "next steps",
    ];
    return planIntentKeywords.some((keyword) => lower.includes(keyword));
  };

  const assistantMappedActualPlan = (text: string): boolean => {
    const lower = text.toLowerCase();

    // Plan indicators: structure, keywords, length
    const hasNumberedSteps = /^\s*\d+\.|^\s*\d+\)|^\s*\d+\./m.test(text);
    const hasBullets = /^\s*[-*•]\s+/m.test(text);
    const hasStructure = hasNumberedSteps || hasBullets;

    // Plan-related content signals
    const planKeywords = [
      "step",
      "timeline",
      "week",
      "month",
      "day",
      "do this",
      "next",
      "then",
      "start with",
      "focus on",
      "plan",
      "strategy",
      "action",
    ];
    const keywordCount = planKeywords.reduce(
      (count, keyword) => count + (lower.includes(keyword) ? 1 : 0),
      0,
    );

    // Good plan: structured + keywords, or good length with keywords
    const hasSufficientLength = text.trim().length >= 100;
    return (hasStructure && keywordCount >= 1) || (hasSufficientLength && keywordCount >= 2);
  };

  const shouldShowSavePlan = (allMessages: Msg[], index: number): boolean => {
    const current = allMessages[index];
    if (!current || current.role !== "assistant" || !current.content.trim()) return false;

    const previousUser = [...allMessages.slice(0, index)].reverse().find((m) => m.role === "user");
    if (!previousUser) return false;

    return userAskedForPlan(previousUser.content) && assistantMappedActualPlan(current.content);
  };

  const shouldUseThinkingMode = (text: string): boolean => {
    const lower = text.toLowerCase();

    const complexitySignals = [
      "compare",
      "tradeoff",
      "trade-off",
      "strategy",
      "analyze",
      "analysis",
      "evaluate",
      "decision",
      "decide",
      "step by step",
      "step-by-step",
      "pros and cons",
      "pros & cons",
      "plan",
      "roadmap",
      "break this down",
      "what should i do",
      "best approach",
      "long term",
      "short term",
      "complex",
      "deeply",
      "reason",
    ];

    const signalCount = complexitySignals.reduce(
      (count, signal) => count + (lower.includes(signal) ? 1 : 0),
      0,
    );

    const isLongPrompt = text.trim().length >= 180;
    const hasMultipleQuestions = (text.match(/\?/g) || []).length >= 2;

    return signalCount >= 2 || (signalCount >= 1 && (isLongPrompt || hasMultipleQuestions)) || (isLongPrompt && hasMultipleQuestions);
  };

  const shouldUseVentMode = (text: string): boolean => {
    const lower = text.toLowerCase();
    const ventSignals = [
      "i need to vent",
      "need to vent",
      "let me vent",
      "just listen",
      "no advice",
      "i want to rant",
      "rant",
      "get this off my chest",
      "off my chest",
      "i need to let this out",
      "let this out",
    ];
    return ventSignals.some((signal) => lower.includes(signal));
  };

  const isBusinessMarketingPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    const keys = [
      "start a business",
      "starting a business",
      "i want to start a business",
      "business idea",
      "what business",
      "which business",
      "market my business",
      "how can i market",
      "marketing strategy",
      "go to market",
      "go-to-market",
      "customer acquisition",
    ];
    return keys.some((k) => lower.includes(k));
  };

 const send = async (overrideText?: string, overrideVentAdviceMode?: VentAdviceMode) => {
  const text = (overrideText ?? input).trim();
  if (!text || busy || !user) return;

    const thinkingRequested = forceThinking || shouldUseThinkingMode(text);
    const planningRequested = forcePlan || userAskedForPlan(text);
    const ventRequested = forceVent || shouldUseVentMode(text) || !!overrideVentAdviceMode;
    const activeVentAdviceMode = overrideVentAdviceMode ?? ventAdviceMode;
    const activeVent = ventRequested;
    const shouldOfferVentChoice = activeVent && activeVentAdviceMode === "none";

    const activeFeatures: string[] = [
      thinkingRequested ? "Deep Thinking" : "",
      planningRequested ? "Plan Mode" : "",
      activeVent ? "Vent" : "",
    ].filter(Boolean);

  if (isCodingRelated(text)) {
    toast.error("RealTalk is designed to help you think clearly, plan, and gain clarity—not for coding. Try asking about your goals, decisions, or challenges instead.");
    setInput("");
    return;
  }

    isSendingRef.current = true;

  setInput("");
  setBusy(true);

  const userMsg: Msg = { role: "user", content: text, features: activeFeatures };

  // Add user message + a single assistant placeholder
  setMessages((prev) => [
    ...prev,
    userMsg,
    {
      role: "assistant",
      content: "",
      thinking: thinkingRequested && !shouldOfferVentChoice ? "🤔 Thinking..." : undefined,
      ventChoicePending: shouldOfferVentChoice,
    },
  ]);

  try {
    const cid = await ensureConversation(text);

    await supabase.from("messages").insert({
      conversation_id: cid,
      user_id: user.id,
      role: "user",
      content: text,
    });

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cid);

    window.dispatchEvent(new Event("conversationUpdated"));

    // Vent mode (no advice selected): store user message only and wait for explicit advice request
    if (shouldOfferVentChoice) {
      window.dispatchEvent(new Event("conversationCreated"));
      return;
    }

    // ✅ FIX 2: rebuild messages safely (NO newMsgs bug)
    const currentMessages = [...messages, userMsg];
    const planFirstInstruction =
      "Plan mode is active. Return a full first-version plan immediately (8-12 actionable steps with timeline, assumptions, trade-offs, and 2-4 options with pros/cons). Recommend one option and explain why. Do not lead with clarifying questions. Ask at most one follow-up question after presenting the plan. When research context is available, end with a short Sources section.";
    const businessFirstInstruction =
      "Business/Marketing mode is active. Do not start with clarifying questions. First provide at least 3 practical options with pros/cons, cost/effort, and who each option suits. Then recommend one option and provide a clear starter execution plan. Ask at most one optional follow-up question at the end. Include Sources when research context is available.";
    const outboundMessages = currentMessages.map((m, idx, arr) => {
      const isLatestUser = idx === arr.length - 1 && m.role === "user";
      if (!isLatestUser || (!planningRequested && !isBusinessMarketingPrompt(m.content))) {
        return { role: m.role, content: m.content };
      }

      const injectedInstruction = planningRequested ? planFirstInstruction : businessFirstInstruction;
      return {
        role: m.role,
        content: `${injectedInstruction}\n\nUser request: ${m.content}`,
      };
    });

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: outboundMessages,
        beReal,
        thinkDeeply: thinkingRequested && !shouldOfferVentChoice,
        forcePlan: planningRequested,
        forceVent: activeVent,
        ventAdviceMode: activeVentAdviceMode,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || "Failed to reach RealTalk");
    }

    let assistant = "";
    let isThinking = thinkingRequested;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;

    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;

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
          
          // Handle thinking events
          if (parsed.event === "thinking_start") {
            isThinking = true;
            const thinkingLabel = typeof parsed.label === "string" ? parsed.label : "🤔 Thinking...";
            setMessages((prev) => {
              const copy = [...prev];
              const idx = copy.length - 1;
              if (idx >= 0 && copy[idx].role === "assistant") {
                copy[idx] = { ...copy[idx], thinking: thinkingLabel };
              }
              return copy;
            });
            continue;
          }
          
          if (parsed.event === "thinking_end") {
            isThinking = false;
            setMessages((prev) => {
              const copy = [...prev];
              const idx = copy.length - 1;
              if (idx >= 0 && copy[idx].role === "assistant") {
                copy[idx] = { ...copy[idx], thinking: undefined };
              }
              return copy;
            });
            continue;
          }
          
          const delta = parsed.choices?.[0]?.delta?.content;

          if (delta) {
            if (isThinking) {
              isThinking = false;
            }

            assistant += delta;

            setMessages((prev) => {
              const copy = [...prev];

              let assistantIndex = -1;
              for (let idx = copy.length - 1; idx >= 0; idx--) {
                if (copy[idx].role === "assistant") {
                  assistantIndex = idx;
                  break;
                }
              }

              const nextAssistant: Msg = {
                ...copy[assistantIndex],
                role: "assistant",
                content: assistant,
                thinking: isThinking ? "🤔 Thinking..." : undefined,
              };

              if (assistantIndex === -1) {
                copy.push(nextAssistant);
              } else {
                copy[assistantIndex] = nextAssistant;
              }

              return copy;
            });
          }
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }

    if (assistant) {
      const { data: saved } = await supabase
        .from("messages")
        .insert({
          conversation_id: cid,
          user_id: user.id,
          role: "assistant",
          content: assistant,
        })
        .select("id")
        .single();

      if (saved) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            id: saved.id,
          };
          return copy;
        });
      }

    }

    window.dispatchEvent(new Event("conversationCreated"));

  } catch (e: any) {
    toast.error(e.message || "Something went wrong");

    // ✅ FIX 5: only remove empty assistant, not real messages
    setMessages((prev) =>
      prev.filter((m) => !(m.role === "assistant" && m.content === ""))
    );
  } finally {
    isSendingRef.current = false;
    setBusy(false);
  }
};

  const chooseVentResponse = async (mode: VentAdviceMode) => {
    if (busy || mode === "none") return;

    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant" && copy[i].ventChoicePending) {
          copy[i] = { ...copy[i], ventChoicePending: false };
          break;
        }
      }
      return copy;
    });

    const followUp = "I finished venting. Please give me practical advice now.";
    await send(followUp, mode);
  };

  const savePlan = async (m: Msg) => {
    if (!user) return;
    const firstLine = m.content.split("\n").find((l) => l.trim()) || "Untitled plan";
    const title = firstLine.replace(/^#+\s*/, "").replace(/[*_`]/g, "").slice(0, 80).trim();
    const { error } = await supabase.from("plans").insert({
      user_id: user.id,
      title,
      content: m.content,
      source_message_id: m.id ?? null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Saved to your plans");
      
      // Check if auto-PDF is enabled
      const autoPdfEnabled = localStorage.getItem("autoPdfSave") !== "false";
      if (autoPdfEnabled) {
        setTimeout(() => {
          downloadPlanAsPdf(title, m.content);
        }, 500);
      }
    }
  };

  const openPlanEditor = (index: number) => {
    const target = messages[index];
    if (!target || target.role !== "assistant") return;
    setEditingPlanIndex(index);
    setEditedPlanText(target.content);
  };

  const regenerateEditedPlan = async () => {
    if (editingPlanIndex === null || !user || isRegeneratingPlan) return;
    const edited = editedPlanText.trim();
    if (!edited) {
      toast.error("Please add your edits before regenerating");
      return;
    }

    setIsRegeneratingPlan(true);
    try {
      const cid = await ensureConversation("Regenerate edited plan");
      const targetMessage = messages[editingPlanIndex];
      const context = messages
        .slice(0, editingPlanIndex + 1)
        .map((m) => ({ role: m.role, content: m.content }));

      const planEditPrompt = [
        "Regenerate this plan using my edited version below.",
        "Keep it practical, clear, and improved.",
        "Return only the final plan.",
        "",
        "Edited plan:",
        edited,
      ].join("\n");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...context, { role: "user", content: planEditPrompt }],
          beReal,
          thinkDeeply: false,
          forcePlan: true,
          forceVent: false,
          ventAdviceMode: "none",
        }),
      });

      if (!resp.ok || !resp.body) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to regenerate plan");
      }

      let regenerated = "";
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;

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
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) regenerated += delta;
          } catch {
            // ignore malformed chunk
          }
        }
      }

      if (!regenerated.trim()) {
        throw new Error("No regenerated plan returned");
      }

      let sourceMessageId = targetMessage?.id ?? null;

      if (sourceMessageId) {
        await supabase
          .from("messages")
          .update({ content: regenerated })
          .eq("id", sourceMessageId)
          .eq("user_id", user.id);
      } else {
        const { data: saved } = await supabase
          .from("messages")
          .insert({
            conversation_id: cid,
            user_id: user.id,
            role: "assistant",
            content: regenerated,
          })
          .select("id")
          .single();
        sourceMessageId = saved?.id ?? null;
      }

      setMessages((prev) => {
        const copy = [...prev];
        if (copy[editingPlanIndex]) {
          copy[editingPlanIndex] = {
            ...copy[editingPlanIndex],
            id: sourceMessageId ?? copy[editingPlanIndex].id,
            content: regenerated,
          };
        }
        return copy;
      });

      const firstLine = regenerated.split("\n").find((l) => l.trim()) || "Untitled plan";
      const title = firstLine.replace(/^#+\s*/, "").replace(/[*_`]/g, "").slice(0, 80).trim();
      await supabase.from("plans").insert({
        user_id: user.id,
        title,
        content: regenerated,
        source_message_id: sourceMessageId,
      });

      window.dispatchEvent(new Event("conversationUpdated"));
      toast.success("Plan regenerated and saved");
      setEditingPlanIndex(null);
      setEditedPlanText("");
    } catch (e: any) {
      toast.error(e.message || "Failed to regenerate plan");
    } finally {
      setIsRegeneratingPlan(false);
    }
  };

  const downloadPlanAsPdf = (title: string, content: string) => {
    try {
      // Create a simple text-based PDF by creating a blob
      const pdfContent = `${title}\n\n${content}`;
      const element = document.createElement("a");
      element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(pdfContent));
      element.setAttribute("download", `${title}.txt`);
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Plan also downloaded as file");
    } catch (e) {
      // Silently fail - plan was still saved
    }
  };

  const suggestions = [
    "I want to plan budget spend",
    "I am having rent issues",
    "How can I market my business",
  ];

  const applySuggestion = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const deleteCurrentConversation = async () => {
    if (!convId || !user) return;
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", convId)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to delete conversation");
    } else {
      setConvId(null);
      setMessages([]);
      navigate({ to: "/", search: {} as never, replace: true });
      window.dispatchEvent(new Event("conversationDeleted"));
      toast.success("Conversation deleted");
    }
  };

  const isEmpty = messages.length === 0;
  const chatSceneKey = convId ?? "new-chat";
  const userName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (user?.email?.split("@")[0] ?? "there");

  return (
    <div className="flex-1 flex flex-col relative">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <motion.div
          key={chatSceneKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="max-w-2xl mx-auto px-5 py-5"
        >
          {isEmpty ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="min-h-[72vh] flex flex-col items-center justify-center text-center"
            >
              <div className="inline-flex items-center justify-center gap-4">
                <img src={logo} alt="RealTalk" className="h-[64px] w-auto opacity-95" />
                <p className="text-4xl font-semibold tracking-tight">Hello, {userName}</p>
              </div>
              <p className="mt-3 text-xl text-muted-foreground">What's on your mind?</p>

              <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-xl">
                {suggestions.map((suggestion) => (
                  <button
                    key={`hero-${suggestion}`}
                    type="button"
                    onClick={() => applySuggestion(suggestion)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4 pb-3">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div
                    key={m.id || i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {m.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%]">
                          {m.features && m.features.length > 0 && (
                            <div className="mb-1.5 flex flex-wrap gap-1.5 justify-end">
                              {m.features.map((feature) => (
                                <span
                                  key={feature}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary"
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="bg-surface-elevated rounded-2xl rounded-tr-sm px-4 py-2.5 text-[0.95rem] whitespace-pre-wrap">
                            {m.content}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {m.thinking && (
                          <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                            <p className="text-xs text-primary/80 font-semibold mb-1">💭 Thinking:</p>
                            <p className="text-xs text-muted-foreground">{m.thinking}</p>
                          </div>
                        )}
                        {(m.content || (busy && i === messages.length - 1 && !m.ventChoicePending)) && (
                          <div className="prose-realtalk">
                            <ReactMarkdown>{m.content || " "}</ReactMarkdown>
                            {busy && i === messages.length - 1 && !m.content && !m.ventChoicePending && (
                              <span className="caret text-muted-foreground" />
                            )}
                          </div>
                        )}
                        {m.content && !(busy && i === messages.length - 1) && shouldShowSavePlan(messages, i) && (
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => savePlan(m)}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5 gap-1.5"
                            >
                              <Bookmark className="h-3.5 w-3.5" />
                              Save as Plan
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openPlanEditor(i)}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5 gap-1.5"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit Plan
                            </Button>
                          </div>
                        )}
                        {m.ventChoicePending && (
                          <div className="mt-3">
                            {!m.content && (
                              <p className="text-xs text-muted-foreground mb-2">
                                You’re in Vent mode. I’ll only respond when you ask for advice.
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => chooseVentResponse("advice")}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
                            >
                              Give advice
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMessages((prev) => {
                                  const copy = [...prev];
                                  if (copy[i]) copy[i] = { ...copy[i], ventChoicePending: false };
                                  return copy;
                                });
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
                            >
                              Just listen
                            </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && (
        <button
          onClick={scrollToBottom}
          className="fixed right-8 bottom-40 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-3 shadow-lg z-50 transition-all"
          title="Scroll to bottom"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
      )}

      {/* Composer */}
      <div className="border-t border-border/60 bg-background/90 backdrop-blur">
        <div className="max-w-2xl mx-auto px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Switch id="real" checked={beReal} onCheckedChange={setBeReal} />
              <Label htmlFor="real" className="text-xs text-muted-foreground cursor-pointer">
                Be real with me
              </Label>
            </div>
            {convId && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setConvId(null); setMessages([]); navigate({ to: "/", search: {} as never, replace: true }); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  New chat
                </button>
                <button
                  onClick={deleteCurrentConversation}
                  className="text-xs text-muted-foreground hover:text-red-400 transition-colors flex items-center gap-1"
                  title="Delete this conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface focus-within:border-primary/60 transition-colors">
            {(forceThinking || forcePlan || forceVent) && (
              <div className="px-4 pt-2 flex flex-wrap gap-2">
                {forceThinking && (
                  <button
                    onClick={() => setForceThinking(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs rounded-full hover:bg-primary/30 transition-colors"
                  >
                    💭 Deep Thinking
                    <span className="text-lg leading-none">×</span>
                  </button>
                )}
                {forcePlan && (
                  <button
                    onClick={() => setForcePlan(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs rounded-full hover:bg-primary/30 transition-colors"
                  >
                    📋 Plan Mode
                    <span className="text-lg leading-none">×</span>
                  </button>
                )}
                {forceVent && (
                  <button
                    onClick={() => {
                      setForceVent(false);
                      setVentAdviceMode("none");
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs rounded-full hover:bg-primary/30 transition-colors"
                  >
                    🫶 Vent
                    <span className="text-lg leading-none">×</span>
                  </button>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Type what's on your mind…"
              className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[0.97rem] outline-none placeholder:text-muted-foreground/70 max-h-[180px]"
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground"
                  onClick={() => toast("Voice input coming soon")}
                  aria-label="Voice input"
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowFeatureMenu(!showFeatureMenu)}
                    aria-label="Add feature"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  {showFeatureMenu && (
                    <div className="absolute bottom-full left-0 mb-2 bg-surface border border-border rounded-lg shadow-lg z-50 w-56 p-2">
                      <button
                        onClick={() => {
                          setForceThinking(!forceThinking);
                          setShowFeatureMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          forceThinking
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        }`}
                      >
                        💭 Deep Thinking
                      </button>
                      <button
                        onClick={() => {
                          setForcePlan(!forcePlan);
                          setShowFeatureMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          forcePlan
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        }`}
                      >
                        📋 Plan Mode
                      </button>
                      <button
                        onClick={() => {
                          setForceVent(true);
                          setVentAdviceMode("none");
                          setShowFeatureMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          forceVent
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        }`}
                      >
                        🫶 Vent
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={() => void send()}
                disabled={!input.trim() || busy}
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {editingPlanIndex !== null && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold mb-2">Edit plan</h3>
            <textarea
              value={editedPlanText}
              onChange={(e) => setEditedPlanText(e.target.value)}
              className="w-full min-h-[260px] max-h-[60vh] resize-y rounded-lg border border-border bg-background/60 p-3 text-sm outline-none focus:border-primary/60"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingPlanIndex(null);
                  setEditedPlanText("");
                }}
                disabled={isRegeneratingPlan}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={() => void regenerateEditedPlan()} disabled={isRegeneratingPlan}>
                {isRegeneratingPlan ? "Regenerating..." : "Save & Regenerate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
