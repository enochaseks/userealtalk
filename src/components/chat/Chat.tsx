import { useCallback, useEffect, useRef, useState, useLayoutEffect, type ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mic, ArrowUp, Bookmark, ChevronDown, Plus, Pencil, Mail, RotateCcw, CalendarDays, Trash2, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useVoiceInput } from "../../hooks/use-voice-input";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  consumeMeteredFeature,
  getUsageWindowLabel,
  hasFeatureAccess,
  loadSubscriptionSnapshot,
  getConversationMemoryLimit,
  getConversationMemoryWarningThreshold,
  PLAN_CATALOG,
  type MeteredFeature,
  type SubscriptionSnapshot,
} from "@/lib/subscriptions";
import logo from "../../assets/logo.png";

type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  thinking?: string;
  ventChoicePending?: boolean;
  features?: string[];
  retryable?: boolean;
  retryText?: string;
  scheduleCandidate?: {
    title: string;
    starts_at: string;
    notes: string;
  };
  scheduleSaved?: boolean;
};
type VentAdviceMode = "none" | "advice";
type EmailTone = "professional" | "formal" | "casual" | "fun";
type ScheduleItem = {
  id: string;
  title: string;
  notes: string;
  starts_at: string;
  ends_at: string | null;
  is_completed: boolean;
};

type ChatMode = "logical" | "emotional" | "beReal";

type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  kind: "image" | "pdf" | "text" | "other";
};

const MAX_CHAT_ATTACHMENTS = 3;
const MAX_CHAT_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const CHAT_DRAFT_DB_NAME = "realtalk-chat-drafts";
const CHAT_DRAFT_STORE = "kv";
const USER_LOCATION_STORAGE_KEY = "realtalk_user_location";

type UserLocationContext = {
  countryCode: string;
  label: string;
  source?: "gps" | "locale" | "manual";
  updatedAt?: string;
};

const readStoredUserLocation = (): UserLocationContext | null => {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_LOCATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<UserLocationContext>;
    const countryCode = String(parsed.countryCode ?? "").trim().toUpperCase();
    const label = String(parsed.label ?? "").trim();
    if (!countryCode || !label) return null;
    return {
      countryCode,
      label,
      source: parsed.source === "gps" || parsed.source === "manual" ? parsed.source : "locale",
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
};

type ComposerDraft = {
  input: string;
  pendingAttachments: ChatAttachment[];
  beReal: boolean;
  emotionalMode: boolean;
  logicalMode: boolean;
  forceThinking: boolean;
  forcePlan: boolean;
  forceBenefits: boolean;
  forceVent: boolean;
  ventAdviceMode: VentAdviceMode;
};

const openChatDraftDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(CHAT_DRAFT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHAT_DRAFT_STORE)) {
        db.createObjectStore(CHAT_DRAFT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open draft DB"));
  });

const chatDraftGet = async (key: string): Promise<ComposerDraft | null> => {
  const db = await openChatDraftDb();
  try {
    return await new Promise<ComposerDraft | null>((resolve, reject) => {
      const tx = db.transaction(CHAT_DRAFT_STORE, "readonly");
      const store = tx.objectStore(CHAT_DRAFT_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const value = req.result;
        if (!value || typeof value !== "object") {
          resolve(null);
          return;
        }
        const input = typeof value.input === "string" ? value.input : "";
        const pendingAttachments = Array.isArray(value.pendingAttachments)
          ? (value.pendingAttachments as ChatAttachment[])
          : [];
        const beReal = Boolean((value as any).beReal);
        const emotionalMode = Boolean((value as any).emotionalMode);
        const logicalMode = (value as any).logicalMode === false ? false : true;
        const forceThinking = Boolean((value as any).forceThinking);
        const forcePlan = Boolean((value as any).forcePlan);
        const forceBenefits = Boolean((value as any).forceBenefits);
        const forceVent = Boolean((value as any).forceVent);
        const ventAdviceMode = (value as any).ventAdviceMode === "advice" ? "advice" : "none";
        resolve({
          input,
          pendingAttachments,
          beReal,
          emotionalMode,
          logicalMode,
          forceThinking,
          forcePlan,
          forceBenefits,
          forceVent,
          ventAdviceMode,
        });
      };
      req.onerror = () => reject(req.error ?? new Error("Failed to read draft"));
    });
  } finally {
    db.close();
  }
};

const chatDraftSet = async (key: string, value: ComposerDraft): Promise<void> => {
  const db = await openChatDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHAT_DRAFT_STORE, "readwrite");
      const store = tx.objectStore(CHAT_DRAFT_STORE);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save draft"));
    });
  } finally {
    db.close();
  }
};

const chatDraftDelete = async (key: string): Promise<void> => {
  const db = await openChatDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHAT_DRAFT_STORE, "readwrite");
      const store = tx.objectStore(CHAT_DRAFT_STORE);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to delete draft"));
    });
  } finally {
    db.close();
  }
};

const inferAttachmentKind = (file: File): ChatAttachment["kind"] => {
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json")
  ) {
    return "text";
  }
  return "other";
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

const attachmentToDataUrl = (attachment: Pick<ChatAttachment, "mimeType" | "base64">): string =>
  `data:${attachment.mimeType};base64,${attachment.base64}`;

const messageAttachmentCacheKey = (messageId: string) => `message-attachments:${messageId}`;

const chatMessageAttachmentSet = async (messageId: string, attachments: ChatAttachment[]): Promise<void> => {
  const db = await openChatDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CHAT_DRAFT_STORE, "readwrite");
      tx.objectStore(CHAT_DRAFT_STORE).put(attachments, messageAttachmentCacheKey(messageId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save message attachments"));
    });
  } finally {
    db.close();
  }
};

const chatMessageAttachmentGet = async (messageId: string): Promise<ChatAttachment[] | null> => {
  const db = await openChatDraftDb();
  try {
    return await new Promise<ChatAttachment[] | null>((resolve, reject) => {
      const tx = db.transaction(CHAT_DRAFT_STORE, "readonly");
      const req = tx.objectStore(CHAT_DRAFT_STORE).get(messageAttachmentCacheKey(messageId));
      req.onsuccess = () => {
        const value = req.result;
        if (!Array.isArray(value)) {
          resolve(null);
          return;
        }
        resolve(value as ChatAttachment[]);
      };
      req.onerror = () => reject(req.error ?? new Error("Failed to read message attachments"));
    });
  } finally {
    db.close();
  }
};

const ATTACHMENT_META_MARKER = "[ATTACHMENTS_META:";

const appendAttachmentMetaMarker = (content: string, attachments: ChatAttachment[]): string => {
  if (!attachments.length) return content;
  const meta = attachments.map((item) => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    kind: item.kind,
  }));
  return `${content}\n${ATTACHMENT_META_MARKER}${JSON.stringify(meta)}]`;
};

const parseAttachmentMetaFromText = (text: string): {
  cleanContent: string;
  attachmentsMeta: Array<Omit<ChatAttachment, "base64">>;
} => {
  const markerRegex = /\[ATTACHMENTS_META:(\[[\s\S]+?\])\]/;
  const match = text.match(markerRegex);
  const cleanContent = text.replace(/\[ATTACHMENTS_META:\[[\s\S]+?\]\]/g, "").trimEnd();
  if (!match) {
    return { cleanContent, attachmentsMeta: [] };
  }

  try {
    const parsed = JSON.parse(match[1]) as Array<{
      id?: string;
      name?: string;
      mimeType?: string;
      sizeBytes?: number;
      kind?: ChatAttachment["kind"];
    }>;

    const attachmentsMeta = (Array.isArray(parsed) ? parsed : [])
      .map((item, index) => {
        const kind: ChatAttachment["kind"] =
          item.kind === "image" || item.kind === "pdf" || item.kind === "text" || item.kind === "other"
            ? item.kind
            : "other";
        return {
          id: String(item.id ?? `meta-${index}`),
          name: String(item.name ?? "attachment"),
          mimeType: String(item.mimeType ?? "application/octet-stream"),
          sizeBytes: Number(item.sizeBytes ?? 0),
          kind,
        } as Omit<ChatAttachment, "base64">;
      })
      .filter((item) => Boolean(item.name));

    return { cleanContent, attachmentsMeta };
  } catch {
    return { cleanContent, attachmentsMeta: [] };
  }
};

const parseScheduleCandidateFromText = (text: string): {
  cleanContent: string;
  candidate?: NonNullable<Msg["scheduleCandidate"]>;
} => {
  const match = text.match(/\[SCHEDULE_SAVE:(\{[\s\S]+?\})\]/);
  const cleanContent = text.replace(/\[SCHEDULE_SAVE:\{[\s\S]+?\}\]/g, "").trimEnd();

  if (!match) {
    return { cleanContent };
  }

  try {
    const parsed = JSON.parse(match[1]) as {
      title?: string;
      starts_at?: string;
      notes?: string;
    };

    if (parsed.title && parsed.starts_at) {
      return {
        cleanContent,
        candidate: {
          title: parsed.title.trim(),
          starts_at: new Date(parsed.starts_at).toISOString(),
          notes: (parsed.notes ?? "").trim(),
        },
      };
    }
  } catch {
    // Ignore malformed schedule marker
  }

  return { cleanContent };
};

const EMAIL_TONE_LABELS: Record<EmailTone, string> = {
  professional: "Professional",
  formal: "Formal",
  casual: "Casual",
  fun: "Fun",
};

const EMAIL_TONE_INSTRUCTIONS: Record<EmailTone, string> = {
  professional: "Use a polished, professional tone that is clear, balanced, and confident.",
  formal: "Use a formal tone that is respectful, structured, and more traditional.",
  casual: "Use a casual tone that feels natural, friendly, and relaxed.",
  fun: "Use a fun tone that is warm, lively, and light without sounding unprofessional.",
};

const MAX_CODING_MESSAGES_PER_CONVERSATION = 3;

const FEATURE_LABELS: Record<MeteredFeature, string> = {
  deep_thinking: "Deep Thinking",
  plan: "Plan Mode",
  gmail_send: "Gmail send",
  voice_input: "Voice input",
  journal_save: "Journal saves",
  cv_toolkit: "CV Toolkit",
};

const getJournalSaveKey = (messageId: string | null | undefined, content: string) => {
  if (messageId) return `id:${messageId}`;
  return `content:${content.trim()}`;
};

export function Chat() {
  const { user, session, connectGoogleForGmail } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const search = useSearch({ strict: false }) as { c?: string };
  const [convId, setConvId] = useState<string | null>(search?.c ?? null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const isSendingRef = useRef(false);
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [beReal, setBeReal] = useState(false);
  const [emotionalMode, setEmotionalMode] = useState(false);
  const [logicalMode, setLogicalMode] = useState(true);
  const modeRef = useRef<{ beReal: boolean; emotionalMode: boolean; logicalMode: boolean }>({
    beReal: false,
    emotionalMode: false,
    logicalMode: true,
  });
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [forceThinking, setForceThinking] = useState(false);
  const [forcePlan, setForcePlan] = useState(false);
  const [forceBenefits, setForceBenefits] = useState(false);
  const [forceVent, setForceVent] = useState(false);
  const [ventAdviceMode, setVentAdviceMode] = useState<VentAdviceMode>("none");
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleStartsAt, setScheduleStartsAt] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMessageBusyId, setScheduleMessageBusyId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailPrompt, setEmailPrompt] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailTone, setEmailTone] = useState<EmailTone>("professional");
  const [emailReview, setEmailReview] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [gmailConnectBusy, setGmailConnectBusy] = useState(false);
  const emailUseGmail = true;
  const [subscriptionSnapshot, setSubscriptionSnapshot] = useState<SubscriptionSnapshot | null>(null);
  const [shareVentingWithDatabase, setShareVentingWithDatabase] = useState(false);
  const [editingPlanIndex, setEditingPlanIndex] = useState<number | null>(null);
  const [editedPlanText, setEditedPlanText] = useState("");
  const [isRegeneratingPlan, setIsRegeneratingPlan] = useState(false);
  const [savedJournalIds, setSavedJournalIds] = useState<Set<string>>(new Set());
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocationContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const lastVoiceErrorToastRef = useRef<{ message: string; at: number } | null>(null);
  const voiceDraftBaseRef = useRef("");
  const previousVoiceListeningRef = useRef(false);
  const voicePressActiveRef = useRef(false);
  const [isVoicePressing, setIsVoicePressing] = useState(false);
  const voiceSessionStartedAtRef = useRef<number | null>(null);
  const {
    error: voiceInputError,
    isListening: isVoiceListening,
    isSupported: isVoiceSupported,
    resetTranscript: resetVoiceTranscript,
    startListening,
    stopListening,
    transcript: voiceTranscript,
  } = useVoiceInput();

  // Sync convId with search params
  useEffect(() => {
    setConvId(search?.c ?? null);
  }, [search?.c]);

  const composerDraftKey = user?.id ? `composer:${user.id}:${convId ?? "new"}` : null;
  const latestComposerDraftKey = user?.id ? `composer:${user.id}:latest` : null;

  const applyComposerDraft = useCallback((draft: ComposerDraft) => {
    setInput(draft.input || "");
    setPendingAttachments(Array.isArray(draft.pendingAttachments) ? draft.pendingAttachments : []);
    setBeReal(Boolean(draft.beReal));
    setEmotionalMode(Boolean(draft.emotionalMode));
    setLogicalMode(Boolean(draft.logicalMode));
    modeRef.current = {
      beReal: Boolean(draft.beReal),
      emotionalMode: Boolean(draft.emotionalMode),
      logicalMode: Boolean(draft.logicalMode),
    };
    setForceThinking(Boolean(draft.forceThinking));
    setForcePlan(Boolean(draft.forcePlan));
    setForceBenefits(Boolean(draft.forceBenefits));
    setForceVent(Boolean(draft.forceVent));
    setVentAdviceMode(draft.ventAdviceMode === "advice" ? "advice" : "none");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!composerDraftKey || !latestComposerDraftKey) {
      setDraftHydrated(true);
      return;
    }

    setDraftHydrated(false);
    void (async () => {
      try {
        const specificDraft = await chatDraftGet(composerDraftKey);
        const latestDraft = specificDraft ? null : await chatDraftGet(latestComposerDraftKey);
        const draft = specificDraft ?? latestDraft;
        if (cancelled || !draft) return;
        applyComposerDraft(draft);
      } catch {
        // Draft restore failures should never block chat usage.
      } finally {
        if (!cancelled) setDraftHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyComposerDraft, composerDraftKey, latestComposerDraftKey]);

  useEffect(() => {
    if (!composerDraftKey || !latestComposerDraftKey || !draftHydrated) return;

    const timeout = window.setTimeout(() => {
      const payload: ComposerDraft = {
        input,
        pendingAttachments,
        beReal,
        emotionalMode,
        logicalMode,
        forceThinking,
        forcePlan,
        forceBenefits,
        forceVent,
        ventAdviceMode,
      };

      if (!payload.input.trim() && payload.pendingAttachments.length === 0) {
        // Never clear drafts while a send is in flight. A refresh during this window
        // should restore the just-sent text/files instead of losing them.
        if (busy) {
          return;
        }
        void chatDraftDelete(composerDraftKey).catch(() => {
          // Ignore storage cleanup failures.
        });
        void chatDraftDelete(latestComposerDraftKey).catch(() => {
          // Ignore storage cleanup failures.
        });
        return;
      }

      void chatDraftSet(composerDraftKey, payload).catch(() => {
        // Ignore storage failures (quota/private mode/etc).
      });
      void chatDraftSet(latestComposerDraftKey, payload).catch(() => {
        // Ignore storage failures (quota/private mode/etc).
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [
    beReal,
    composerDraftKey,
    draftHydrated,
    emotionalMode,
    forceBenefits,
    forcePlan,
    forceThinking,
    forceVent,
    input,
    latestComposerDraftKey,
    logicalMode,
    pendingAttachments,
    ventAdviceMode,
    busy,
  ]);

  const refreshSubscription = async () => {
    if (!user) {
      setSubscriptionSnapshot(null);
      return null;
    }

    const snapshot = await loadSubscriptionSnapshot(user.id);
    setSubscriptionSnapshot(snapshot);
    return snapshot;
  };

  const showFeatureLimitToast = (feature: MeteredFeature, snapshot: SubscriptionSnapshot) => {
    const usage = snapshot.usage[feature];
    if (usage.limit === null) return;
    toast.error(`${FEATURE_LABELS[feature]} limit reached for ${getUsageWindowLabel(feature)} on ${snapshot.plan}.`);
    if (snapshot.plan !== "platinum") {
      setShowUpgradeModal(true);
    }
  };

  const canUseMeteredFeature = (feature: MeteredFeature, snapshot: SubscriptionSnapshot) => {
    const usage = snapshot.usage[feature];
    return usage.limit === null || usage.used < usage.limit;
  };

  const planLimitReached =
    subscriptionSnapshot !== null && !canUseMeteredFeature("plan", subscriptionSnapshot);

  const setChatMode = (mode: ChatMode) => {
    const next = {
      beReal: mode === "beReal",
      emotionalMode: mode === "emotional",
      logicalMode: mode === "logical",
    };

    // Keep a synchronous copy for request payloads to avoid stale state races.
    modeRef.current = next;
    setBeReal(next.beReal);
    setEmotionalMode(next.emotionalMode);
    setLogicalMode(next.logicalMode);
  };

  const requireScheduleAccess = async () => {
    const snapshot = await refreshSubscription();
    if (!snapshot) return false;
    if (!hasFeatureAccess(snapshot.plan, "schedule")) {
      toast.error("Schedule is available on Pro, Platinum, Student, and Professional.");
      return false;
    }
    return true;
  };

  const recordFeatureUsage = async (feature: MeteredFeature) => {
    if (!user) return true;
    try {
      const result = await consumeMeteredFeature(user.id, feature);
      setSubscriptionSnapshot(result.snapshot);
      return result.allowed;
    } catch {
      toast.error("Could not verify your usage limits. Please try again.");
      return false;
    }
  };

  const canEnableFeatureFromUi = async (feature: MeteredFeature) => {
    const snapshot = await refreshSubscription();
    if (!snapshot) return false;
    if (!canUseMeteredFeature(feature, snapshot)) {
      showFeatureLimitToast(feature, snapshot);
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!user) {
      setSubscriptionSnapshot(null);
      setShareVentingWithDatabase(false);
      return;
    }

    void (async () => {
      await refreshSubscription();
      const { data } = await supabase
        .from("user_insight_settings")
        .select("share_venting_with_database")
        .eq("user_id", user.id)
        .maybeSingle();
      setShareVentingWithDatabase(Boolean(data?.share_venting_with_database));
    })();
  }, [user]);

  useEffect(() => {
    const syncLocation = () => {
      setUserLocation(readStoredUserLocation());
    };

    syncLocation();
    window.addEventListener("storage", syncLocation);
    window.addEventListener("userLocationUpdated", syncLocation as EventListener);
    return () => {
      window.removeEventListener("storage", syncLocation);
      window.removeEventListener("userLocationUpdated", syncLocation as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setSavedJournalIds(new Set());
      return;
    }

    let cancelled = false;

    const loadSavedJournalEntries = async () => {
      const { data } = await (supabase as any)
        .from("journal_entries")
        .select("source_message_id, content")
        .eq("user_id", user.id)
        .limit(2000);

      if (cancelled || !data) return;

      const next = new Set<string>();
      (data as Array<{ source_message_id: string | null; content: string }>).forEach((entry) => {
        next.add(getJournalSaveKey(entry.source_message_id, entry.content));
      });
      setSavedJournalIds(next);
    };

    void loadSavedJournalEntries();

    const channel = supabase
      .channel(`journal-entries-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "journal_entries",
          filter: `user_id=eq.${user.id}`,
        },
        () => void loadSavedJournalEntries(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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
        const incomingRows = data as Msg[];
        const hydratedRows = await Promise.all(
          incomingRows.map(async (incoming) => {
            const parsedSchedule = parseScheduleCandidateFromText(incoming.content);
            const parsedAttachment = parseAttachmentMetaFromText(parsedSchedule.cleanContent);

            let restoredAttachments: ChatAttachment[] | undefined;
            if (incoming.role === "user" && parsedAttachment.attachmentsMeta.length > 0) {
              const cached = incoming.id ? await chatMessageAttachmentGet(incoming.id) : null;
              if (Array.isArray(cached) && cached.length > 0) {
                restoredAttachments = cached;
              } else {
                restoredAttachments = parsedAttachment.attachmentsMeta.map((item) => ({
                  ...item,
                  base64: "",
                }));
              }
            }

            return {
              ...incoming,
              content: parsedAttachment.cleanContent,
              scheduleCandidate: parsedSchedule.candidate,
              attachments: restoredAttachments,
            };
          }),
        );

        setMessages((prev) =>
          hydratedRows.map((incoming) => {
            const previousMatch = prev.find(
              (item) => item.id === incoming.id || (item.role === incoming.role && item.content === incoming.content),
            );

            return {
              ...incoming,
              scheduleCandidate: previousMatch?.scheduleCandidate ?? incoming.scheduleCandidate,
              scheduleSaved: previousMatch?.scheduleSaved ?? false,
              attachments: incoming.attachments ?? previousMatch?.attachments,
            };
          }),
        );
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
  }, [convId, user?.id]);

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

  useEffect(() => {
    if (!voiceInputError) return;

    const now = Date.now();
    const previous = lastVoiceErrorToastRef.current;
    const isDuplicate = previous?.message === voiceInputError && now - previous.at < 4000;
    if (isDuplicate) {
      return;
    }

    lastVoiceErrorToastRef.current = { message: voiceInputError, at: now };
    toast.error(voiceInputError);
  }, [voiceInputError]);

  useEffect(() => {
    if (busy && isVoiceListening) {
      voicePressActiveRef.current = false;
      setIsVoicePressing(false);
      stopListening();
    }
  }, [busy, isVoiceListening, stopListening]);

  useEffect(() => {
    if (!isVoicePressing) {
      return;
    }

    const releaseVoice = () => {
      voicePressActiveRef.current = false;
      setIsVoicePressing(false);
      stopListening();
    };

    window.addEventListener("pointerup", releaseVoice);
    window.addEventListener("pointercancel", releaseVoice);
    window.addEventListener("mouseup", releaseVoice);
    window.addEventListener("touchend", releaseVoice);
    window.addEventListener("blur", releaseVoice);

    return () => {
      window.removeEventListener("pointerup", releaseVoice);
      window.removeEventListener("pointercancel", releaseVoice);
      window.removeEventListener("mouseup", releaseVoice);
      window.removeEventListener("touchend", releaseVoice);
      window.removeEventListener("blur", releaseVoice);
    };
  }, [isVoicePressing, stopListening]);

  useEffect(() => {
    if (!previousVoiceListeningRef.current && isVoiceListening) {
      voiceDraftBaseRef.current = input;
      voiceSessionStartedAtRef.current = Date.now();
    }

    if (previousVoiceListeningRef.current && !isVoiceListening) {
      textareaRef.current?.focus();

      const startedAt = voiceSessionStartedAtRef.current;
      voiceSessionStartedAtRef.current = null;

      if (startedAt && user) {
        const elapsedSeconds = Math.max(1, Math.ceil((Date.now() - startedAt) / 1000));

        void (async () => {
          try {
            const result = await consumeMeteredFeature(user.id, "voice_input", elapsedSeconds);
            setSubscriptionSnapshot(result.snapshot);
            if (!result.allowed) {
              showFeatureLimitToast("voice_input", result.snapshot);
            }
          } catch {
            toast.error("Could not record your voice usage right now. Please try again.");
          }
        })();
      }
    }

    previousVoiceListeningRef.current = isVoiceListening;
  }, [input, isVoiceListening, user]);

  useEffect(() => {
    if (!isVoiceListening && !voiceTranscript) {
      return;
    }

    const nextInput = [voiceDraftBaseRef.current.trimEnd(), voiceTranscript]
      .filter(Boolean)
      .join(voiceDraftBaseRef.current.trimEnd() ? " " : "")
      .trim();

    setInput(nextInput);
  }, [isVoiceListening, voiceTranscript]);

  const handleVoicePressStart = async (trackPress = true) => {
    if (!isVoiceSupported) {
      toast.error("Voice input is only available in supported browsers.");
      return;
    }

    if (busy) {
      return;
    }

    voicePressActiveRef.current = true;
    setIsVoicePressing(trackPress);

    if (isVoiceListening) {
      return;
    }

    if (user) {
      const snapshot = await refreshSubscription();
      if (snapshot && !canUseMeteredFeature("voice_input", snapshot)) {
        voicePressActiveRef.current = false;
        setIsVoicePressing(false);
        showFeatureLimitToast("voice_input", snapshot);
        return;
      }
    }

    if (!voicePressActiveRef.current) {
      return;
    }

    resetVoiceTranscript();
    startListening();
  };

  const handleVoicePressEnd = () => {
    voicePressActiveRef.current = false;
    setIsVoicePressing(false);
    stopListening();
  };

  const handleVoiceDesktopToggle = async () => {
    if (isVoiceListening || voicePressActiveRef.current) {
      handleVoicePressEnd();
      return;
    }

    await handleVoicePressStart(false);
  };

  const toLocalInputDateTime = (iso?: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const isScheduleIntent = (text: string): boolean => {
    const lower = text.toLowerCase();
    const keys = [
      "schedule",
      "calendar",
      "today",
      "tomorrow",
      "this week",
      "my week",
      "time block",
      "appointment",
      "meeting",
      "reminder",
      "plan my day",
    ];
    return keys.some((k) => lower.includes(k));
  };

  useEffect(() => {
    if (!user) {
      setScheduleItems([]);
      return;
    }

    const loadSchedules = async () => {
      const { data } = await supabase
        .from("user_schedules")
        .select("id,title,notes,starts_at,ends_at,is_completed")
        .eq("user_id", user.id)
        .order("starts_at", { ascending: true })
        .limit(12);
      setScheduleItems((data as ScheduleItem[] | null) ?? []);
    };

    void loadSchedules();

    const channel = supabase
      .channel(`chat-schedules-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_schedules", filter: `user_id=eq.${user.id}` },
        () => void loadSchedules(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addScheduleFromChat = async () => {
    if (!user) return;
    if (!(await requireScheduleAccess())) return;
    const title = scheduleTitle.trim();
    if (!title) {
      toast.error("Please add a schedule title");
      return;
    }
    if (!scheduleStartsAt) {
      toast.error("Please choose a date and time");
      return;
    }

    const startsAtIso = new Date(scheduleStartsAt).toISOString();

    setScheduleBusy(true);
    const { error } = await supabase.from("user_schedules").insert({
      user_id: user.id,
      title,
      notes: scheduleNotes.trim(),
      starts_at: startsAtIso,
      ends_at: null,
      is_completed: false,
      updated_at: new Date().toISOString(),
    });
    setScheduleBusy(false);

    if (error) {
      toast.error(error.message || "Failed to save schedule");
      return;
    }

    setScheduleTitle("");
    setScheduleStartsAt("");
    setScheduleNotes("");
    toast.success("Scheduled and saved to your profile");
  };

  const addScheduleCandidateToProfile = async (messageIndex: number) => {
    if (!user) return;
    if (!(await requireScheduleAccess())) return;
    const message = messages[messageIndex];
    const candidate = message?.scheduleCandidate ?? parseScheduleCandidateFromText(message?.content ?? "").candidate;
    if (!candidate || message.scheduleSaved) return;

    setScheduleMessageBusyId(message.id ?? `msg-${messageIndex}`);
    const { error } = await supabase.from("user_schedules").insert({
      user_id: user.id,
      title: candidate.title.trim(),
      notes: candidate.notes.trim(),
      starts_at: new Date(candidate.starts_at).toISOString(),
      ends_at: null,
      is_completed: false,
      updated_at: new Date().toISOString(),
    });
    setScheduleMessageBusyId(null);

    if (error) {
      toast.error(error.message || "Failed to save schedule");
      return;
    }

    setMessages((prev) => {
      const copy = [...prev];
      if (copy[messageIndex]) {
        copy[messageIndex] = { ...copy[messageIndex], scheduleSaved: true };
      }
      return copy;
    });
    toast.success("Added to your schedule");
  };

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

  const deleteCurrentConversation = async () => {
    if (!user || !convId || isDeletingConversation) return;

    setIsDeletingConversation(true);
    try {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", convId)
        .eq("user_id", user.id);

      if (error) {
        throw error;
      }

      setConvId(null);
      setMessages([]);
      navigate({ to: "/", search: {} as never, replace: true });
      window.dispatchEvent(new Event("conversationDeleted"));
      toast.success("Conversation deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete conversation");
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const isCodingRelated = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    const codingPhrases = [
      "fix code",
      "write code",
      "if statement",
      "debug this",
      "compile error",
      "runtime error",
      "stack trace",
      "pull request",
    ];

    if (codingPhrases.some((phrase) => lowerText.includes(phrase))) {
      return true;
    }

    const codingWordRegexes = [
      /\bcode\b/,
      /\bcoding\b/,
      /\bdebug\b/,
      /\bdebugging\b/,
      /\bfunction\b/,
      /\bclass\b/,
      /\bvariable\b/,
      /\bsyntax\b/,
      /\balgorithm\b/,
      /\bpython\b/,
      /\bjavascript\b/,
      /\bjava\b/,
      /\bc\+\+\b/,
      /\bhtml\b/,
      /\bcss\b/,
      /\breact\b/,
      /\bnode\b/,
      /\bprogramming\b/,
      /\bbug\b/,
      /\berror\b/,
      /\bscript\b/,
      /\bloop\b/,
      /\barray\b/,
      /\bobject\b/,
      /\bdatabase\b/,
      /\bsql\b/,
      /\bapi\b/,
      /\bendpoint\b/,
      /\bbackend\b/,
      /\bfrontend\b/,
      /\blibrary\b/,
      /\bframework\b/,
      /\bnpm\b/,
      /\bgit\b/,
      /\bgithub\b/,
      /\bdeploy\b/,
      /\bserver\b/,
      /\blocalhost\b/,
      /\bterminal\b/,
      /\bcommand\b/,
    ];

    return codingWordRegexes.some((regex) => regex.test(lowerText));
  };

  const isExplicitPlanRequest = (text: string): boolean => {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!normalized) return false;

    const explicitPlanPatterns = [
      /\b(make|build|create|write|draft|outline|map(?:\s+out)?|lay\s+out|put\s+together)\s+(?:me\s+)?(?:a\s+)?(plan|roadmap|strategy|timeline|budget|action plan|launch plan|marketing plan)\b/i,
      /\b(give|show|send)\s+(?:me\s+)?(?:a\s+)?(plan|roadmap|strategy|timeline|budget|action plan|launch plan|marketing plan)\b/i,
      /\b(help me|can you|could you|would you|i need|i want)\s+(?:make|build|create|write|draft|outline|map(?:\s+out)?|plan)\b/i,
      /\b(plan\s+(?:my|out)|map\s+out|lay\s+out)\b/i,
      /\b(step[ -]?by[ -]?step|30[ -]?day|60[ -]?day|90[ -]?day)\s+plan\b/i,
      /\b(i need|i want|help me with|give me|show me)\s+(?:a\s+)?(marketing plan|launch plan|action plan)\b/i,
    ];

    return explicitPlanPatterns.some((pattern) => pattern.test(normalized));
  };

  const userAskedForPlan = (text: string): boolean => isExplicitPlanRequest(text);

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
    const explicitVentSignals = [
      "i need to vent",
      "need to vent",
      "i want to vent",
      "want to vent",
      "let me vent",
      "just listen",
      "just hear me out",
      "no advice",
      "don't give advice",
      "dont give advice",
      "not looking for advice",
      "i want to rant",
      "rant",
      "get this off my chest",
      "off my chest",
      "i need to let this out",
      "let this out",
    ];

    if (explicitVentSignals.some((signal) => lower.includes(signal))) return true;

    const ventIntentSignals = [
      "i just need to talk",
      "i just need someone to listen",
      "can i talk",
      "can i vent",
      "i need to get this out",
      "i need to say this",
      "i need to talk about this",
      "i'm spiraling",
      "im spiraling",
      "i'm losing it",
      "im losing it",
      "i can't do this anymore",
      "i cant do this anymore",
      "i'm done",
      "im done",
      "this is too much",
      "i feel like i'm breaking",
      "i feel like im breaking",
    ];

    const distressSignals = [
      "overwhelmed",
      "drained",
      "exhausted",
      "burnt out",
      "burned out",
      "stressed",
      "hurt",
      "angry",
      "frustrated",
      "upset",
      "heartbroken",
      "betrayed",
      "anxious",
      "panicking",
      "can't cope",
      "cant cope",
    ];

    const noSolutionSignals = [
      "i don't know what to do",
      "i dont know what to do",
      "i can't even think",
      "i cant even think",
      "i don't need solutions",
      "i dont need solutions",
      "not asking for solutions",
      "don't fix it",
      "dont fix it",
    ];

    const intentHit = ventIntentSignals.some((s) => lower.includes(s));
    const distressCount = distressSignals.reduce((acc, s) => acc + (lower.includes(s) ? 1 : 0), 0);
    const noSolutionHit = noSolutionSignals.some((s) => lower.includes(s));

    return intentHit || noSolutionHit || distressCount >= 2;
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

  const isEmailIntent = (text: string): boolean => {
    const lower = text.toLowerCase();
    const patterns = [
      "send an email",
      "send email",
      "write an email",
      "write email",
      "draft an email",
      "draft email",
      "compose an email",
      "compose email",
      "email someone",
      "email my",
      "i want to email",
      "i need to email",
      "i need to send",
      "can you help me email",
      "help me write an email",
      "help me draft",
      "open gmail",
      "send via gmail",
      "gmail",
    ];
    return patterns.some((p) => lower.includes(p));
  };

  const isCvHelpIntent = (text: string): boolean => {
    const lower = text.toLowerCase();
    const keys = [
      "cv",
      "resume",
      "curriculum vitae",
      "cover letter",
      "job match",
      "personal statement",
      "review my cv",
      "improve my cv",
      "improve my resume",
      "rewrite my cv",
    ];
    return keys.some((k) => lower.includes(k));
  };

  const isLogicalExecutionPrompt = (text: string): boolean => {
    const lower = text.toLowerCase();
    
    // Action verbs that signal execution intent
    const executionVerbs = [
      "start ",
      "starting ",
      "launch ",
      "launching ",
      "begin ",
      "beginning ",
      "open ",
      "opening ",
      "create ",
      "creating ",
      "build ",
      "building ",
      "make ",
      "making ",
      "switch ",
      "switching ",
      "transition ",
      "transitioning ",
      "move ",
      "moving ",
      "relocate ",
      "change ",
      "changing ",
    ];
    
    // Domains that typically need structured logic
    const executionDomains = [
      "business",
      "daycare",
      "nonprofit",
      "store",
      "shop",
      "company",
      "freelance",
      "side hustle",
      "podcast",
      "blog",
      "service",
      "venture",
      "project",
      "career",
      "job",
      "field",
      "industry",
      "country",
      "city",
      "school",
      "course",
      "program",
      "consulting",
      "agency",
      "startup",
      "brand",
      "product",
      "community",
    ];
    
    // Check if any execution verb is present
    const hasExecutionVerb = executionVerbs.some(verb => lower.includes(verb));
    
    // If execution verb found, check for any domain OR "i want to", "how do i"
    if (hasExecutionVerb) {
      const hasDomain = executionDomains.some(domain => lower.includes(domain));
      const hasIntent = lower.includes("i want to") || lower.includes("how do i") || lower.includes("how can i") || lower.includes("should i");
      return hasDomain || hasIntent;
    }
    
    // Direct patterns
    const directPatterns = [
      "i want to start",
      "i want to launch",
      "i want to open",
      "i want to build",
      "i want to create",
      "how do i start",
      "how do i launch",
      "how do i open",
      "how do i build",
      "should i start",
      "should i switch",
      "should i move",
      "should i change",
    ];
    
    return directPatterns.some(pattern => lower.includes(pattern));
  };

  const buildQuickBypassResponse = (
    rawText: string,
    opts: {
      thinkingRequested: boolean;
      planningRequested: boolean;
      activeVent: boolean;
      activeVentAdviceMode: VentAdviceMode;
    },
  ): string => {
    if (opts.activeVent && opts.activeVentAdviceMode === "none") {
      return "I am here with you. Keep venting and I will listen. When you are ready, tap Give advice and I will switch to practical help.";
    }

    if (opts.activeVent && opts.activeVentAdviceMode === "advice") {
      return [
        "Quick practical reset:",
        "1. Name the main issue in one sentence.",
        "2. Write the one outcome you want in the next 24 hours.",
        "3. Take one small action now that moves you toward that outcome.",
        "4. If you want, send me that one-sentence issue and I will break it into a simple action plan.",
      ].join("\n");
    }

    if (opts.planningRequested) {
      return [
        "Quick starter plan:",
        "1. Define the exact goal and deadline.",
        "2. List 3 options and pick one based on effort vs impact.",
        "3. Break the chosen option into the first 5 concrete steps.",
        "4. Set one success metric for this week.",
        "5. Block time for step 1 today and start immediately.",
      ].join("\n");
    }

    if (opts.thinkingRequested) {
      return [
        "Quick structured thinking:",
        "- Best case",
        "- Most likely case",
        "- Worst case",
        "- Biggest risk and how to reduce it",
        "- Best next step right now",
      ].join("\n");
    }

    const trimmed = rawText.length > 200 ? `${rawText.slice(0, 200)}...` : rawText;
    return `The AI response was delayed. I can still help quickly: summarize your main goal in one line and your biggest blocker in one line, and I will give you a focused next step.\n\nCurrent topic: ${trimmed}`;
  };

 const send = async (overrideText?: string, overrideVentAdviceMode?: VentAdviceMode) => {
  const text = (overrideText ?? input).trim();
  const attachmentsForRequest = [...pendingAttachments];
  if ((!text && attachmentsForRequest.length === 0) || busy || !user) return;
  const activeMode = modeRef.current;

  // If the user expresses email intent, open the Gmail panel instead of chatting
  if (!overrideText && isEmailIntent(text)) {
    const emailSnapshot = await refreshSubscription();
    if (emailSnapshot && !canUseMeteredFeature("gmail_send", emailSnapshot)) {
      showFeatureLimitToast("gmail_send", emailSnapshot);
      return;
    }
    setInput("");
    setShowEmailPanel(true);
    return;
  }

    const scheduleRequested = false;
    let thinkingRequested = forceThinking || shouldUseThinkingMode(text);
    const planIntentFromText = isExplicitPlanRequest(text);
    const planIntentRequested = forcePlan || planIntentFromText;
    let planningRequested = planIntentRequested;
    const ventDetectedFromText = shouldUseVentMode(text);
    const ventRequested = forceVent || ventDetectedFromText || !!overrideVentAdviceMode;
    const activeVentAdviceMode = overrideVentAdviceMode ?? ventAdviceMode;
    const activeVent = ventRequested;
    const isPrivateVenting = activeVent && !shareVentingWithDatabase;
    // Offer the vent choice whenever vent is active and no explicit advice mode was picked.
    // This covers both manual Vent toggle and auto-detected vent language.
    const shouldOfferVentChoice = activeVent && !overrideVentAdviceMode && activeVentAdviceMode === "none";

    const featureSnapshot = await refreshSubscription();
    const activePlan = featureSnapshot?.plan ?? subscriptionSnapshot?.plan ?? "free";
    if (thinkingRequested && featureSnapshot && !canUseMeteredFeature("deep_thinking", featureSnapshot)) {
      showFeatureLimitToast("deep_thinking", featureSnapshot);
      thinkingRequested = false;
      if (forceThinking) setForceThinking(false);
    }
    if (planningRequested && featureSnapshot && !canUseMeteredFeature("plan", featureSnapshot)) {
      showFeatureLimitToast("plan", featureSnapshot);
      planningRequested = false;
      if (forcePlan) setForcePlan(false);
      if (planIntentRequested) {
        toast.error("Plan Mode is unavailable until your monthly limit resets or you upgrade.");
        return;
      }
    }

    // Usage recording for deep_thinking and plan is handled server-side in the
    // chat edge function — this prevents double-counting and ensures limits hold
    // even if the client is bypassed.

    // Keep manual toggles sticky, but do not auto-lock modes from text detection.
    // Auto-locking can unintentionally keep heavy modes active and slow future replies.

    const activeFeatures: string[] = [
      thinkingRequested ? "Deep Thinking" : "",
      planningRequested ? "Plan Mode" : "",
      forceBenefits ? "Benefits Helper" : "",
      activeVent ? "Vent" : "",
    ].filter(Boolean);

    const isCodingPrompt = isCodingRelated(text);
    if (isCodingPrompt) {
      const codingPromptCount = messages.filter((m) => m.role === "user" && isCodingRelated(m.content)).length;
      if (codingPromptCount >= MAX_CODING_MESSAGES_PER_CONVERSATION) {
        toast.error(`Coding chats are limited to ${MAX_CODING_MESSAGES_PER_CONVERSATION} messages per conversation. Start a new chat for more coding questions.`);
        return;
      }

      toast("Coding mode is limited here. For full coding support, use a dedicated coding tool.");
    }

    isSendingRef.current = true;

  const userVisibleText = text || `Please review my attached file${attachmentsForRequest.length > 1 ? "s" : ""}.`;
    const cvHelpRequested =
      isCvHelpIntent(userVisibleText) ||
      attachmentsForRequest.some((a) => /\b(cv|resume)\b/i.test(a.name));
  const persistedUserContent = userVisibleText.trim();

  if (composerDraftKey && latestComposerDraftKey) {
    const outgoingDraft: ComposerDraft = {
      input: text,
      pendingAttachments: attachmentsForRequest,
      beReal,
      emotionalMode,
      logicalMode,
      forceThinking,
      forcePlan,
      forceBenefits,
      forceVent,
      ventAdviceMode,
    };

    // Save immediately so a fast refresh/reload cannot drop the outgoing payload.
    void chatDraftSet(composerDraftKey, outgoingDraft).catch(() => {
      // Ignore storage failures (quota/private mode/etc).
    });
    void chatDraftSet(latestComposerDraftKey, outgoingDraft).catch(() => {
      // Ignore storage failures (quota/private mode/etc).
    });
  }

  setInput("");
  setBusy(true);

  const userMsg: Msg = {
    role: "user",
    content: persistedUserContent,
    features: activeFeatures,
    attachments: attachmentsForRequest,
  };

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

  let conversationId = "";

  try {
    if (!isPrivateVenting) {
      const cid = await ensureConversation(userVisibleText);
      conversationId = cid;

      const persistedUserContentWithAttachmentMeta = appendAttachmentMetaMarker(
        persistedUserContent,
        attachmentsForRequest,
      );

      const { data: savedUserMessage } = await supabase
        .from("messages")
        .insert({
          conversation_id: cid,
          user_id: user.id,
          role: "user",
          content: persistedUserContentWithAttachmentMeta,
        })
        .select("id")
        .single();

      if (savedUserMessage?.id && attachmentsForRequest.length > 0) {
        void chatMessageAttachmentSet(savedUserMessage.id, attachmentsForRequest).catch(() => {
          // Ignore local cache failures.
        });

        setMessages((prev) => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "user" && !copy[i].id && copy[i].content === persistedUserContent) {
              copy[i] = { ...copy[i], id: savedUserMessage.id };
              break;
            }
          }
          return copy;
        });
      }

      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", cid);

      window.dispatchEvent(new Event("conversationUpdated"));
    }

    // Vent mode (no advice selected): store user message only and wait for explicit advice request
    if (shouldOfferVentChoice) {
      window.dispatchEvent(new Event("conversationCreated"));
      return;
    }

    // Fetch all messages from database for this conversation, apply memory limit based on plan.
    // Vent mode is private and does not read/write persisted conversation messages.
    const memoryLimit = getConversationMemoryLimit(activePlan);
    const warningThreshold = getConversationMemoryWarningThreshold(activePlan);
    let totalMessageCount = 0;
    let currentMessages: Msg[] = [];

    if (isPrivateVenting) {
      currentMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");
      totalMessageCount = currentMessages.length;
    } else {
      const { data: allDbMessages } = await supabase
        .from("messages")
        .select("id,role,content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      currentMessages = (allDbMessages as Msg[] | null) ?? [];
      totalMessageCount = currentMessages.length;

      if (memoryLimit !== null && currentMessages.length > memoryLimit) {
        currentMessages = currentMessages.slice(-memoryLimit);

        if (warningThreshold !== null && totalMessageCount >= warningThreshold) {
          toast.warning(`You're approaching your conversation memory limit (${totalMessageCount}/${memoryLimit} messages). Upgrade to Student or Professional for higher memory.`, {
            duration: 5000,
          });
        }
      }
    }

    // Add the new user message to the context
    currentMessages = [...currentMessages, userMsg];

    const thinkingFirstInstruction =
      "Deep thinking mode is active. Give a thoughtful, structured answer with multiple angles, trade-offs, assumptions, and a clear recommendation. If sources are available, end with 'Key References:' and list them.";
    const planFirstInstruction =
      "Plan mode is active. Provide a complete first-pass plan now: 10-16 actionable steps, timeline, risks/mitigations, effort or cost ranges, and KPIs. Include 2-4 options with pros/cons, recommend one, and ask at most one follow-up question at the end.";
    const businessFirstInstruction =
      "Business/Marketing mode is active. Do not begin with clarifying questions. Start with at least 3 practical options, include pros/cons and effort or cost, recommend one option, then provide a starter execution plan. Ask at most one optional follow-up question at the end.";
    const logicalExecutionInstruction =
      "Execution/startup mode is active. Options first, no upfront clarifying questions. Provide 2-4 practical options with pros/cons and effort/cost, recommend one, then provide a concrete starter plan. Ask at most one optional follow-up.";
    const outboundMessages = currentMessages.map((m, idx, arr) => {
      const isLatestUser = idx === arr.length - 1 && m.role === "user";
      const isBusinessPrompt = !scheduleRequested && isBusinessMarketingPrompt(m.content);
      const isLogicalExecution = !scheduleRequested && isLogicalExecutionPrompt(m.content);
      if (!isLatestUser || (!thinkingRequested && !planningRequested && !isBusinessPrompt && !isLogicalExecution)) {
        return { role: m.role, content: m.content };
      }

      let injectedInstruction = "";
      if (thinkingRequested) {
        injectedInstruction = thinkingFirstInstruction;
      } else if (planningRequested) {
        injectedInstruction = planFirstInstruction;
      } else if (isBusinessPrompt) {
        injectedInstruction = businessFirstInstruction;
      } else if (isLogicalExecution) {
        injectedInstruction = logicalExecutionInstruction;
      }

      return {
        role: m.role,
        content: injectedInstruction ? `${injectedInstruction}\n\nUser request: ${m.content}` : m.content,
      };
    });

    const upcomingSchedule = scheduleItems
      .filter((item) => !item.is_completed)
      .slice(0, 6)
      .map((item) => {
        const when = new Date(item.starts_at).toLocaleString();
        return `- ${item.title} @ ${when}${item.notes ? ` (${item.notes})` : ""}`;
      })
      .join("\n");

    const scheduleSystemMsg = scheduleRequested
      ? {
          role: "system" as const,
          content:
            `You are helping the user manage their personal schedule inside RealTalk. Today's date and time is: ${new Date().toLocaleString()}.\n\n` +
            `IF the user wants to ADD or SCHEDULE something new:\n` +
            `- If you don't yet have all three pieces of information (what to schedule, what date, what time), ask for the missing ones naturally in one short conversational message. Do NOT ask for them all at once — gather them one at a time if needed.\n` +
            `- Once you have the title/activity, date, AND time, do TWO things in your reply:\n` +
            `  1. Confirm it warmly in one sentence (e.g. "Got it, I've added that to your schedule!").\n` +
            `  2. Append EXACTLY this on its own line at the very end of your response, replacing the placeholders:\n` +
            `     [SCHEDULE_SAVE:{"title":"<activity>","starts_at":"<ISO 8601 datetime>","notes":"<extra context or empty string>"}]\n` +
            `- IMPORTANT: Only output [SCHEDULE_SAVE:...] when you have a confirmed title, date, AND time. Never output it without all three.\n` +
            `- Never tell the user to open a tab, click a button, or do anything manually — you handle scheduling entirely.\n\n` +
            `IF the user is asking about their existing schedule:\n` +
            (upcomingSchedule
              ? `Here are their upcoming items:\n${upcomingSchedule}`
              : `They have no upcoming schedule items saved yet.`) +
            `\n- Reference these naturally in conversation.`,
        }
      : null;

    const requestMessages = scheduleSystemMsg
      ? [scheduleSystemMsg, ...outboundMessages]
      : outboundMessages;

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const chatAbort = new AbortController();
    const requestTimeoutMs = thinkingRequested || planningRequested || scheduleRequested || activeVent ? 45000 : 30000;
    const chatTimeout = setTimeout(() => chatAbort.abort(), requestTimeoutMs);
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: requestMessages,
          attachments: attachmentsForRequest.map((item) => ({
            name: item.name,
            mimeType: item.mimeType,
            base64: item.base64,
            sizeBytes: item.sizeBytes,
            kind: item.kind,
          })),
          beReal: activeMode.beReal,
          emotionalMode: activeMode.emotionalMode,
          logicalMode: activeMode.logicalMode,
          thinkDeeply: thinkingRequested && !shouldOfferVentChoice,
          forcePlan: planningRequested,
          forceBenefits,
          forceVent: activeVent,
          ventAdviceMode: activeVentAdviceMode,
          userId: user.id,
          userPlan: activePlan,
          totalMessageCount,
          memoryLimit,
          userLocation,
        }),
        signal: chatAbort.signal,
      });
    } catch (e: any) {
      clearTimeout(chatTimeout);
      if (e?.name === "AbortError") throw new Error("RealTalk took too long to respond. Try again.");
      throw e;
    }
    clearTimeout(chatTimeout);

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

    const STREAM_IDLE_TIMEOUT_MS = 15000;
    const STREAM_HARD_TIMEOUT_MS = 60000;
    const streamStartedAt = Date.now();

    while (!done) {
      if (Date.now() - streamStartedAt > STREAM_HARD_TIMEOUT_MS) {
        chatAbort.abort();
        throw new Error("RealTalk took too long to complete the response.");
      }

      let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
      const readPromise = reader.read();
      const timeoutPromise = new Promise<never>((_, reject) => {
        idleTimeoutId = setTimeout(() => {
          chatAbort.abort();
          reject(new Error("RealTalk stream stalled."));
        }, STREAM_IDLE_TIMEOUT_MS);
      });

      const { done: d, value } = await Promise.race([readPromise, timeoutPromise]);
      if (idleTimeoutId) clearTimeout(idleTimeoutId);

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

    // Parse any [SCHEDULE_SAVE:{...}] marker the AI outputs and attach a schedule candidate to the message
    const parsedAssistant = parseScheduleCandidateFromText(assistant);
    const cleanAssistant = parsedAssistant.cleanContent;
    const scheduleCandidate = parsedAssistant.candidate;
    const assistantWithCvLink = cvHelpRequested && !cleanAssistant.includes("/cv-review")
      ? `${cleanAssistant}\n\nNeed deeper CV help? [Open CV Toolkit](/cv-review)`
      : cleanAssistant;

    // Strip the hidden marker from what gets displayed and stored
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = {
            ...copy[i],
            content: assistantWithCvLink,
            scheduleCandidate,
            scheduleSaved: false,
          };
          break;
        }
      }
      return copy;
    });

    if (assistantWithCvLink) {
      if (!isPrivateVenting && conversationId) {
        const { data: saved } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            user_id: user.id,
            role: "assistant",
            content: assistantWithCvLink,
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

        // Fire-and-forget: learn user preferences from conversation (does not block UI)
        void (async () => {
          try {
            const recentMessages = [...messages, userMsg, { role: "assistant", content: assistantWithCvLink }]
              .slice(-8)
              .map((m) => ({ role: m.role, content: m.content }));
            const learnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/profile-learn`;
            const payload = JSON.stringify({ userId: user.id, recentMessages });
            const headers = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token ?? ""}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
            };

            let learnResp = await fetch(learnUrl, {
              method: "POST",
              headers,
              body: payload,
            });

            // Retry once for transient edge/network failures.
            if (!learnResp.ok && learnResp.status >= 500) {
              learnResp = await fetch(learnUrl, {
                method: "POST",
                headers,
                body: payload,
              });
            }

            if (!learnResp.ok) {
              console.warn("profile-learn skipped", learnResp.status);
            }
          } catch {
            // Silent — never block the chat experience
          }
        })();
      }

      // Usage for thinking/plan is consumed before the request for strict enforcement.
    }

    if (attachmentsForRequest.length > 0) {
      setPendingAttachments((prev) => prev.filter((item) => !attachmentsForRequest.some((sent) => sent.id === item.id)));
    }

    window.dispatchEvent(new Event("conversationCreated"));

  } catch (e: any) {
    const errorMessage = String(e?.message || "");
    const shouldUseQuickBypass = /too long|stream stalled|abort|timeout/i.test(errorMessage);

    if (shouldUseQuickBypass) {
      const quickBypass = buildQuickBypassResponse(text, {
        thinkingRequested,
        planningRequested,
        activeVent,
        activeVentAdviceMode,
      });

      setMessages((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "assistant") {
            copy[i] = {
              ...copy[i],
              content: quickBypass,
              thinking: undefined,
              ventChoicePending: false,
              retryable: true,
              retryText: text,
            };
            return copy;
          }
        }
        return [
          ...copy,
          {
            role: "assistant",
            content: quickBypass,
            retryable: true,
            retryText: text,
          },
        ];
      });

      if (conversationId && !isPrivateVenting) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: quickBypass,
        });
      }

      toast.error("AI took too long. Switched to quick response mode.");
      window.dispatchEvent(new Event("conversationCreated"));
      return;
    }

    toast.error(e.message || "Something went wrong");

    // Keep the assistant bubble and offer an inline retry action
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = {
            ...copy[i],
            content: "I couldn't respond just now.",
            thinking: undefined,
            ventChoicePending: false,
            retryable: true,
            retryText: text,
          };
          return copy;
        }
      }
      return [
        ...copy,
        {
          role: "assistant",
          content: "I couldn't respond just now.",
          retryable: true,
          retryText: text,
        },
      ];
    });
  } finally {
    isSendingRef.current = false;
    setBusy(false);
    // Eagerly clear drafts so navigating away immediately after a send does not
    // restore the just-sent text in a new or different conversation.
    if (composerDraftKey) {
      void chatDraftDelete(composerDraftKey).catch(() => {});
    }
    if (latestComposerDraftKey) {
      void chatDraftDelete(latestComposerDraftKey).catch(() => {});
    }
  }
};

  const chooseVentResponse = async (mode: VentAdviceMode) => {
    if (busy || mode === "none") return;

    // Keep Vent mode active after the user chooses how they want support.
    setForceVent(true);
    setVentAdviceMode(mode);

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

    const planSnapshot = await refreshSubscription();
    if (planSnapshot && !canUseMeteredFeature("plan", planSnapshot)) {
      showFeatureLimitToast("plan", planSnapshot);
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
          emotionalMode,
          logicalMode,
          thinkDeeply: false,
          forcePlan: true,
          forceVent: false,
          ventAdviceMode: "none",
          userId: user.id,
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

      // plan usage recorded server-side in the chat edge function

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

  const toSafeFilename = (value: string) =>
    value
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "plan";

  const downloadPlanAsPdf = (title: string, content: string) => {
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 48;
      const maxTextWidth = pageWidth - margin * 2;
      let cursorY = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      const titleLines = doc.splitTextToSize(title || "Plan", maxTextWidth);
      doc.text(titleLines, margin, cursorY);
      cursorY += titleLines.length * 20;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      const bodyLines = doc.splitTextToSize(content || "", maxTextWidth);

      for (const line of bodyLines) {
        if (cursorY > pageHeight - margin) {
          doc.addPage();
          cursorY = margin;
        }
        doc.text(line, margin, cursorY);
        cursorY += 16;
      }

      doc.save(`${toSafeFilename(title)}.pdf`);
      toast.success("Plan downloaded as PDF");
    } catch {
      toast.error("Could not generate PDF");
    }
  };

  const downloadPlanAsWord = async (title: string, content: string) => {
    try {
      const paragraphs: Paragraph[] = [
        new Paragraph({
          children: [new TextRun({ text: title || "Plan", bold: true, size: 32 })],
          spacing: { after: 240 },
        }),
      ];

      const lines = (content || "").split(/\r?\n/);
      for (const line of lines) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: line || " " })],
            spacing: { after: 120 },
          }),
        );
      }

      const doc = new Document({
        sections: [{ children: paragraphs }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const element = document.createElement("a");
      element.setAttribute("href", url);
      element.setAttribute("download", `${toSafeFilename(title)}.docx`);
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

  const suggestions = [
    "I want to plan budget spend",
    "I am having rent issues",
    "How can I market my business",
  ];

  const applySuggestion = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  const handleUpgradeCheckout = async (plan: "pro" | "platinum", cycle: "monthly" | "annual") => {
    if (!session || upgradeBusy) return;
    setUpgradeBusy(true);
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
      setUpgradeBusy(false);
    }
  };

  const saveToJournal = async (msg: Msg) => {
    if (!user) return;
    const key = getJournalSaveKey(msg.id, msg.content);
    if (savedJournalIds.has(key)) return;

    try {
      const usageResult = await consumeMeteredFeature(user.id, "journal_save");
      setSubscriptionSnapshot(usageResult.snapshot);
      if (!usageResult.allowed) {
        showFeatureLimitToast("journal_save", usageResult.snapshot);
        return;
      }

      const { error } = await (supabase as any).from("journal_entries").insert({
        user_id: user.id,
        source_message_id: msg.id ?? null,
        content: msg.content,
      });
      if (error) throw error;
      setSavedJournalIds((prev) => new Set([...prev, key]));
      toast.success("Saved to journal");
    } catch (e: any) {
      if (e?.code === "23505") {
        setSavedJournalIds((prev) => new Set([...prev, key]));
        toast.success("Already saved to journal");
        return;
      }
      toast.error("Could not save to journal");
    }
  };

  const runEmailAiPrompt = async (instruction: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: instruction }],
        beReal,
        emotionalMode,
        logicalMode,
        thinkDeeply: false,
        forcePlan: false,
        forceVent: false,
        ventAdviceMode: "none",
        userId: user?.id,
      }),
    });

    if (!resp.ok || !resp.body) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson.error || "AI request failed");
    }

    let generated = "";
    let streamedError: string | null = null;
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
          if (parsed?.error) {
            streamedError = String(parsed.error);
            done = true;
            break;
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) generated += delta;
        } catch {
          // ignore malformed chunks
        }
      }
    }

    if (streamedError) throw new Error(streamedError);
    if (!generated.trim()) throw new Error("No response was generated");
    return generated.trim();
  };

  const generateEmailDraft = async () => {
    if (!user) return;
    const to = emailTo.trim();
    const subject = emailSubject.trim();
    const prompt = emailPrompt.trim();
    if (!to || !subject || !prompt) {
      const missing: string[] = [];
      if (!to) missing.push("recipient");
      if (!subject) missing.push("subject");
      if (!prompt) missing.push("what you want to say");
      toast.error(`Please add ${missing.join(", ")}`);
      return;
    }

    setEmailBusy(true);
    try {
      setEmailReview("");
      const context = messages
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

      const draftInstruction = [
        "Draft an email body only.",
        "Do not include a subject line.",
        "Do not include markdown or bullet points unless necessary.",
        "Use plain text and keep tone natural.",
        EMAIL_TONE_INSTRUCTIONS[emailTone],
        "",
        `Recipient: ${to}`,
        `Subject: ${subject}`,
        `Tone: ${EMAIL_TONE_LABELS[emailTone]}`,
        `Intent: ${prompt}`,
        "",
        context ? `Recent conversation context:\n${context}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const generated = await runEmailAiPrompt(draftInstruction);
      setEmailBody(generated);
      toast.success("Email draft ready");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate email draft");
    } finally {
      setEmailBusy(false);
    }
  };

  const reviewEmailDraft = async () => {
    if (!user) return;
    const to = emailTo.trim();
    const subject = emailSubject.trim();
    const body = emailBody.trim() || emailPrompt.trim();

    if (!subject || !body) {
      const missing: string[] = [];
      if (!subject) missing.push("subject");
      if (!body) missing.push("email body");
      toast.error(`Please add ${missing.join(", ")}`);
      return;
    }

    setEmailBusy(true);
    try {
      const reviewInstruction = [
        "Review this email draft.",
        "Tell me if it is good, what works, what could be better, and then give an improved version.",
        "Keep the review concise and practical.",
        "Use short sections: Verdict, Improvements, Better Version.",
        to ? `Recipient: ${to}` : "",
        `Subject: ${subject}`,
        `Target tone: ${EMAIL_TONE_LABELS[emailTone]}`,
        "",
        "Email draft:",
        body,
      ]
        .filter(Boolean)
        .join("\n");

      const review = await runEmailAiPrompt(reviewInstruction);
      setEmailReview(review);
      toast.success("Email review ready");
    } catch (e: any) {
      toast.error(e.message || "Failed to review email draft");
    } finally {
      setEmailBusy(false);
    }
  };

  const connectGmail = async () => {
    setGmailConnectBusy(true);
    try {
      const { error } = await connectGoogleForGmail();
      if (error) {
        toast.error(error);
        setGmailConnectBusy(false);
        return;
      }

      toast.success("Redirecting to Google to connect Gmail");
    } catch (e: any) {
      toast.error(e?.message || "Failed to connect Gmail");
    } finally {
      setGmailConnectBusy(false);
    }
  };

  const sendEmailMessage = async () => {
    if (!user) return;
    const emailSnapshot = await refreshSubscription();
    if (emailSnapshot && !canUseMeteredFeature("gmail_send", emailSnapshot)) {
      showFeatureLimitToast("gmail_send", emailSnapshot);
      return;
    }
    const to = emailTo.trim();
    const subject = emailSubject.trim();
    const body = emailBody.trim() || emailPrompt.trim();

    if (!to || !subject || !body) {
      const missing: string[] = [];
      if (!to) missing.push("recipient");
      if (!subject) missing.push("subject");
      if (!body) missing.push("email body");
      toast.error(`Please add ${missing.join(", ")}`);
      return;
    }

    setEmailBusy(true);
    try {
      const callEmailFunction = async (accessToken: string, googleToken: string | null) => {
        const { data, error } = await supabase.functions.invoke("gmail-send", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          },
          body: {
            to,
            subject,
            body,
            googleAccessToken: emailUseGmail ? googleToken : null,
            replyTo: user?.email ?? null,
          },
        });

        return { data, error };
      };

      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData.session;

      if (!session?.access_token) {
        throw new Error("You need to be signed in to send email");
      }

      let googleAccessToken = session.provider_token;
      if (emailUseGmail && !googleAccessToken) {
        setEmailBusy(false);
        await connectGmail();
        return;
      }

      let { data: invokeData, error: invokeError } = await callEmailFunction(
        session.access_token,
        googleAccessToken ?? null,
      );

      if (invokeError?.context?.status === 401) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        session = refreshed.session;
        googleAccessToken = session?.provider_token;

        if (refreshError || !session?.access_token) {
          throw new Error("Session expired. Please sign in again.");
        }

        if (emailUseGmail && !googleAccessToken) {
          setEmailBusy(false);
          await connectGmail();
          return;
        }

        const retried = await callEmailFunction(session.access_token, googleAccessToken ?? null);
        invokeData = retried.data;
        invokeError = retried.error;
      }

      if (invokeError) {
        const statusCode = invokeError.context?.status;
        const functionResponse = await invokeError.context?.json?.().catch(() => ({}));
        const message =
          functionResponse?.error ||
          functionResponse?.message ||
          (statusCode === 401 ? "Email function authorization failed. Please reload and try again." : undefined) ||
          (invokeError.name === "FunctionsFetchError" ? "Network/CORS error while calling email function." : undefined) ||
          invokeError.message ||
          "Failed to send email";

        // If Google says the token is invalid, prompt reconnect
        if (emailUseGmail && (String(message).toLowerCase().includes("invalid") || String(message).toLowerCase().includes("expired") || String(message).toLowerCase().includes("auth"))) {
          toast.error("Gmail access expired. Please reconnect Google.");
          await connectGmail();
          return;
        }
        throw new Error(message);
      }

      // Success — reset panel and inject confirmation into chat
      const sentTo = to;
      const sentSubject = subject;
      const provider = String((invokeData as any)?.provider || (emailUseGmail ? "gmail" : "resend"));
      setShowEmailPanel(false);
      setEmailTo("");
      setEmailSubject("");
      setEmailPrompt("");
      setEmailBody("");
      setEmailReview("");

      // Add a confirmation note into the conversation
      const confirmationMsg: Msg = {
        role: "assistant",
        content: `✅ **Email sent successfully**\n\n**To:** ${sentTo}\n**Subject:** ${sentSubject}\n\nDelivery channel: ${provider}.`,
      };
      setMessages((prev) => [...prev, confirmationMsg]);
      // gmail_send usage is now recorded server-side in the gmail-send edge function
      toast.success(`Email sent to ${sentTo}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to send email");
    } finally {
      setEmailBusy(false);
    }
  };

  const isEmpty = messages.length === 0;
  const chatSceneKey = convId ?? "new-chat";
  const hasGoogleIdentity = Boolean(
    user?.identities?.some((identity) => identity.provider?.toLowerCase() === "google"),
  );
  const hasGmailAccess = Boolean(session?.provider_token);
  const pickAttachments = () => attachmentInputRef.current?.click();

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAttachmentPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const availableSlots = Math.max(0, MAX_CHAT_ATTACHMENTS - pendingAttachments.length);
    if (availableSlots <= 0) {
      toast.error(`You can attach up to ${MAX_CHAT_ATTACHMENTS} files per message.`);
      return;
    }

    const toProcess = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      toast.error(`Only ${availableSlots} more file${availableSlots === 1 ? "" : "s"} can be attached.`);
    }

    const nextItems: ChatAttachment[] = [];
    for (const file of toProcess) {
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is too large. Max size is 4MB.`);
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        nextItems.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
          sizeBytes: file.size,
          kind: inferAttachmentKind(file),
        });
      } catch {
        toast.error(`Couldn't read ${file.name}.`);
      }
    }

    if (nextItems.length > 0) {
      setPendingAttachments((prev) => [...prev, ...nextItems].slice(0, MAX_CHAT_ATTACHMENTS));
    }
  };
  const userFullName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    (user?.email?.split("@")[0] ?? "there");
  const userName = userFullName.split(/\s+/)[0] || "there";

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
                <p className="text-4xl font-semibold tracking-tight">Hello, {userName}</p>
              </div>
              <p className="mt-3 text-xl text-muted-foreground">How are you feeling right now?</p>

              <div className="mt-6 inline-flex rounded-full border border-border bg-surface/60 p-1 gap-1">
                <button
                  type="button"
                  onClick={() => { setChatMode("logical"); }}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    !emotionalMode && !beReal
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🧠 Logical
                </button>
                <button
                  type="button"
                  onClick={() => { setChatMode("emotional"); }}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    emotionalMode
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🫶 Emotional Support
                </button>
                <button
                  type="button"
                  onClick={() => { setChatMode("beReal"); }}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    beReal
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  🔥 Be Real
                </button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground max-w-xs">
                {emotionalMode
                  ? "I'll meet you where you are — no pressure, just support."
                  : beReal
                  ? "No filter, no softening — just the honest truth."
                  : "I'll help you think clearly and work through it step by step."}
              </p>

              {forceBenefits && (
                <div className="mt-6 flex flex-col items-center gap-2 w-full max-w-sm">
                  <p className="text-xs text-muted-foreground mb-1">🏛️ Benefits Helper is on — try a quick start:</p>
                  {[
                    "Help me prepare for my Universal Credit claim this week.",
                    "What documents do I need for a Universal Credit claim?",
                    "I'm worried about a sanction — what should I do?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => send(prompt)}
                      className="w-full text-left px-4 py-2.5 rounded-xl border border-border bg-surface/60 hover:bg-surface-elevated text-sm text-foreground transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}
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
                    {(() => {
                      const parsedMessage = parseScheduleCandidateFromText(m.content || "");
                      const visibleContent = parsedMessage.cleanContent;
                      const scheduleCandidate = m.scheduleCandidate ?? parsedMessage.candidate;
                      const journalKey = getJournalSaveKey(m.id, m.content);
                      const isJournalSaved = savedJournalIds.has(journalKey);

                      if (m.role === "user") {
                        return (
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
                              {m.attachments && m.attachments.length > 0 && (
                                <div className="mt-2 grid grid-cols-1 gap-2">
                                  {m.attachments.map((attachment) => {
                                    const isImage = attachment.kind === "image";
                                    const href = attachment.base64 ? attachmentToDataUrl(attachment) : "";
                                    const hasPayload = Boolean(href);
                                    const cardContent = (
                                      <>
                                        {isImage ? (
                                          <div className="flex items-center gap-3 p-2">
                                            {hasPayload ? (
                                              <img
                                                src={href}
                                                alt={attachment.name}
                                                className="h-16 w-16 rounded-md object-cover border border-border/50"
                                              />
                                            ) : (
                                              <div className="h-16 w-16 rounded-md border border-border/50 bg-surface-elevated flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">
                                                Image
                                              </div>
                                            )}
                                            <div className="min-w-0">
                                              <p className="text-xs text-muted-foreground">Photo</p>
                                              <p className="text-sm truncate" title={attachment.name}>{attachment.name}</p>
                                              {!hasPayload && (
                                                <p className="text-[10px] text-muted-foreground">Preview unavailable after reload</p>
                                              )}
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-2 p-2.5">
                                            <FileText className="h-4 w-4 text-primary shrink-0" />
                                            <div className="min-w-0">
                                              <p className="text-xs text-muted-foreground">File</p>
                                              <p className="text-sm truncate" title={attachment.name}>{attachment.name}</p>
                                              {!hasPayload && (
                                                <p className="text-[10px] text-muted-foreground">File content unavailable after reload</p>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    );

                                    if (hasPayload) {
                                      return (
                                        <a
                                          key={attachment.id}
                                          href={href}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          download={attachment.name}
                                          className="block rounded-xl border border-border/60 bg-surface/70 hover:bg-surface-elevated transition-colors overflow-hidden"
                                        >
                                          {cardContent}
                                        </a>
                                      );
                                    }

                                    return (
                                      <div
                                        key={attachment.id}
                                        className="block rounded-xl border border-border/60 bg-surface/70 overflow-hidden"
                                      >
                                        {cardContent}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div>
                        {m.thinking && (
                          <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                            <p className="text-xs text-primary/80 font-semibold mb-1">💭 Thinking:</p>
                            <p className="text-xs text-muted-foreground">{m.thinking}</p>
                          </div>
                        )}
                        {(visibleContent || (busy && i === messages.length - 1 && !m.ventChoicePending)) && (
                          <div className="prose-realtalk">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({ node, href, children, ...props }) => {
                                  const isInternalHref = typeof href === "string" && href.startsWith("/");
                                  // If the child text is the raw URL itself, shorten it to just the domain
                                  const childText = typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
                                  const isRawUrl = href && (childText === href || childText.startsWith("http"));
                                  let label = <>{children}</>;
                                  if (isRawUrl && href) {
                                    try {
                                      const u = new URL(href);
                                      const domain = u.hostname.replace(/^www\./, "");
                                      label = <>{domain}</>;
                                    } catch {
                                      // fallback to children
                                    }
                                  }

                                  if (isInternalHref && href) {
                                    return (
                                      <a
                                        {...props}
                                        href={href}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          navigate({ to: href as never });
                                        }}
                                      >
                                        {label}
                                      </a>
                                    );
                                  }

                                  return (
                                    <a {...props} href={href} target="_blank" rel="noopener noreferrer">
                                      {label}
                                    </a>
                                  );
                                },
                              }}
                            >
                              {visibleContent || " "}
                            </ReactMarkdown>
                            {busy && i === messages.length - 1 && !visibleContent && !m.ventChoicePending && (
                              <span className="caret text-muted-foreground" />
                            )}
                          </div>
                        )}
                        {visibleContent && !(busy && i === messages.length - 1) && !m.retryable && shouldShowSavePlan(messages, i) && !planLimitReached && (
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
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadPlanAsPdf("Plan", m.content)}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
                            >
                              Export PDF
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadPlanAsWord("Plan", m.content)}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5"
                            >
                              Export Word
                            </Button>
                          </div>
                        )}
                        {visibleContent && !(busy && i === messages.length - 1) && !m.retryable && !m.ventChoicePending && (
                          <div className="mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void saveToJournal(m)}
                              disabled={isJournalSaved}
                              className="text-xs text-muted-foreground hover:text-foreground h-7 px-2 gap-1.5"
                            >
                              <Bookmark className="h-3 w-3" />
                              {isJournalSaved ? "Saved" : "Save to Journal"}
                            </Button>
                          </div>
                        )}
                        {scheduleCandidate && (
                          <div className="mt-3 flex items-center gap-2">
                            <Button
                              variant={m.scheduleSaved ? "secondary" : "ghost"}
                              size="sm"
                              onClick={() => void addScheduleCandidateToProfile(i)}
                              disabled={m.scheduleSaved || scheduleMessageBusyId === (m.id ?? `msg-${i}`)}
                              className="text-xs h-8 px-2.5 gap-1.5"
                            >
                              <CalendarDays className="h-3.5 w-3.5" />
                              {m.scheduleSaved
                                ? "Added to schedule"
                                : scheduleMessageBusyId === (m.id ?? `msg-${i}`)
                                  ? "Adding..."
                                  : "Add to schedule"}
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              {new Date(scheduleCandidate.starts_at).toLocaleString()}
                            </span>
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
                                setForceVent(true);
                                setVentAdviceMode("none");
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
                        {m.retryable && m.retryText && (
                          <div className="mt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void send(m.retryText)}
                              disabled={busy}
                              className="text-xs text-muted-foreground hover:text-foreground h-8 px-2.5 gap-1.5"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Try again
                            </Button>
                          </div>
                        )}
                      </div>
                      );
                    })()}
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
        {planLimitReached && (
          <div className="max-w-2xl mx-auto px-5 pt-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary">
              <span>You've reached your plan limit for this period.</span>
              <button
                type="button"
                className="font-semibold underline underline-offset-2 shrink-0"
                onClick={() => setShowUpgradeModal(true)}
              >
                Upgrade
              </button>
            </div>
          </div>
        )}
        <div className="max-w-2xl mx-auto px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {/* Mode toggle — compact, always visible during active chat */}
              {!isEmpty && (
                <div className="inline-flex rounded-full border border-border bg-surface/60 p-0.5 gap-0.5">
                  <button
                    type="button"
                    onClick={() => { setChatMode("logical"); }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${!emotionalMode && !beReal ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    title="Logical mode"
                  >
                    🧠
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChatMode("emotional"); }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${emotionalMode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    title="Emotional support mode"
                  >
                    🫶
                  </button>
                  <button
                    type="button"
                    onClick={() => { setChatMode("beReal"); }}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${beReal ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    title="Be real — no filter"
                  >
                    🔥
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    if (showSchedulePanel) {
                      setShowSchedulePanel(false);
                      return;
                    }

                    if (await requireScheduleAccess()) {
                      setShowSchedulePanel(true);
                    }
                  })();
                }}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
                  showSchedulePanel
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                }`}
                title="Open schedule"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Schedule
              </button>
            </div>
            {convId && (
              <div className="flex items-center gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-60"
                      disabled={isDeletingConversation}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isDeletingConversation ? "Deleting..." : "Delete chat"}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently remove this chat from your recent conversations.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeletingConversation}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isDeletingConversation}
                        onClick={() => void deleteCurrentConversation()}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
                  onClick={() => { setConvId(null); setMessages([]); navigate({ to: "/", search: {} as never, replace: true }); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  New chat
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface focus-within:border-primary/60 transition-colors">
            {(forceThinking || forcePlan || forceBenefits || forceVent || showEmailPanel || showSchedulePanel) && (
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
                {forceBenefits && (
                  <button
                    onClick={() => setForceBenefits(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs rounded-full hover:bg-primary/30 transition-colors"
                  >
                    🧾 Benefits Helper
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
                {forceVent && (
                  <span className="inline-flex items-center px-2 py-1 text-[11px] text-muted-foreground">
                    {shareVentingWithDatabase
                      ? "Vent sharing is ON: vent chats can be saved."
                      : "Private venting is ON by default: vent chats are not saved."}
                  </span>
                )}
                {showSchedulePanel && (
                  <button
                    onClick={() => setShowSchedulePanel(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs rounded-full hover:bg-primary/30 transition-colors"
                  >
                    📅 Schedule
                    <span className="text-lg leading-none">×</span>
                  </button>
                )}
                {showEmailPanel && (
                  <button
                    onClick={() => setShowEmailPanel(false)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/20 text-primary text-xs rounded-full hover:bg-primary/30 transition-colors"
                  >
                    ✉️ Gmail Email
                    <span className="text-lg leading-none">×</span>
                  </button>
                )}
              </div>
            )}
            {showSchedulePanel && (
              <div className="px-4 pt-3 pb-2 border-b border-border/60 space-y-2">
                <div className="text-xs text-muted-foreground">
                  Add to your RealTalk schedule. Saved items appear in your Profile schedule tab.
                </div>
                {subscriptionSnapshot && (
                  <div className="text-[11px] text-muted-foreground">
                    Plan: {subscriptionSnapshot.plan}. Schedule is {hasFeatureAccess(subscriptionSnapshot.plan, "schedule") ? "included" : "available on Pro, Platinum, Student, and Professional"}.
                  </div>
                )}
                <input
                  value={scheduleTitle}
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder="What do you need to do?"
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
                />
                <input
                  type="datetime-local"
                  value={scheduleStartsAt}
                  onChange={(e) => setScheduleStartsAt(e.target.value)}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
                />
                <textarea
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="Optional notes"
                  rows={2}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60 resize-y"
                />
                <div className="flex items-center justify-between gap-3">
                  <Button type="button" size="sm" onClick={() => void addScheduleFromChat()} disabled={scheduleBusy}>
                    {scheduleBusy ? "Saving..." : "Save schedule"}
                  </Button>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {scheduleItems.length > 0
                      ? `Next: ${scheduleItems[0]?.title} • ${toLocalInputDateTime(scheduleItems[0]?.starts_at).replace("T", " ")}`
                      : "No upcoming schedules yet"}
                  </div>
                </div>
              </div>
            )}
            {showEmailPanel && (
              <div className="px-4 pt-3 pb-2 border-b border-border/60 space-y-2">
                <div className="text-xs text-muted-foreground">
                  AI-assisted email sender
                </div>
                <div className="text-xs text-muted-foreground">
                  Generate with AI and Review with AI are optional. Gmail connection is required so emails send from the user's Gmail address.
                </div>
                {subscriptionSnapshot && (
                  <div className="text-[11px] text-muted-foreground">
                    {subscriptionSnapshot.usage.gmail_send.limit === null
                      ? "Gmail send: unlimited this month"
                      : `Gmail send: ${subscriptionSnapshot.usage.gmail_send.remaining} left of ${subscriptionSnapshot.usage.gmail_send.limit} this month`}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {hasGmailAccess
                      ? "Gmail connected"
                      : hasGoogleIdentity
                        ? "Reconnect Google to refresh Gmail access"
                        : "Connect Google to send Gmail from here"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={emailBusy || gmailConnectBusy}
                    onClick={() => void connectGmail()}
                  >
                    {gmailConnectBusy ? "Connecting..." : hasGmailAccess ? "Reconnect Gmail" : "Connect Gmail"}
                  </Button>
                </div>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="Recipient email"
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
                />
                <input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60"
                />
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Tone</div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(EMAIL_TONE_LABELS) as EmailTone[]).map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setEmailTone(tone)}
                        className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                          emailTone === tone
                            ? "bg-primary text-primary-foreground"
                            : "bg-background/60 border border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {EMAIL_TONE_LABELS[tone]}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={emailPrompt}
                  onChange={(e) => setEmailPrompt(e.target.value)}
                  placeholder="Write your email here directly, or describe what you want AI to write"
                  rows={3}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60 resize-y"
                />
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Generated or final email body"
                  rows={5}
                  className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm outline-none focus:border-primary/60 resize-y"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={emailBusy}
                    onClick={() => void generateEmailDraft()}
                  >
                    {emailBusy ? "Working..." : "Generate with AI"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={emailBusy}
                    onClick={() => void reviewEmailDraft()}
                  >
                    {emailBusy ? "Working..." : "Review with AI"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={emailBusy}
                    onClick={() => void sendEmailMessage()}
                  >
                    {emailBusy ? "Sending..." : "Send via Gmail"}
                  </Button>
                </div>
                {emailReview && (
                  <div className="rounded-md border border-border bg-background/40 px-3 py-3 text-sm whitespace-pre-wrap">
                    {emailReview}
                  </div>
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
            {pendingAttachments.length > 0 && (
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                {pendingAttachments.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs text-primary"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="max-w-[180px] truncate" title={item.name}>{item.name}</span>
                    <button
                      type="button"
                      className="text-primary/80 hover:text-primary leading-none"
                      onClick={() => removePendingAttachment(item.id)}
                      aria-label={`Remove ${item.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {(isVoiceListening || !isVoiceSupported) && (
              <div className="px-4 pb-1 text-xs">
                {isVoiceListening ? (
                  <span className="text-primary">
                    {isMobile ? "Listening... hold to record and release to stop." : "Listening... click the mic again to stop."}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Voice input requires a supported browser with microphone access.</span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.md,.csv,.json"
                  multiple
                  className="hidden"
                  onChange={handleAttachmentPick}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-foreground"
                  onClick={pickAttachments}
                  aria-label="Add files or photos"
                  title="Add files or photos"
                  disabled={busy}
                >
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 ${isVoiceListening ? "text-primary" : "text-muted-foreground"}`}
                  onClick={() => {
                    if (!isMobile) {
                      void handleVoiceDesktopToggle();
                    }
                  }}
                  onPointerDown={(event) => {
                    if (!isMobile) return;
                    if (event.button !== 0) return;
                    void handleVoicePressStart();
                  }}
                  onPointerUp={() => {
                    if (!isMobile) return;
                    handleVoicePressEnd();
                  }}
                  onPointerLeave={() => {
                    if (!isMobile) return;
                    handleVoicePressEnd();
                  }}
                  onPointerCancel={() => {
                    if (!isMobile) return;
                    handleVoicePressEnd();
                  }}
                  onKeyDown={(event) => {
                    if (event.repeat) return;
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      if (isMobile) {
                        void handleVoicePressStart();
                      } else {
                        void handleVoiceDesktopToggle();
                      }
                    }
                  }}
                  onKeyUp={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      if (isMobile) {
                        handleVoicePressEnd();
                      }
                    }
                  }}
                  aria-label={isVoiceListening ? "Recording voice input" : isMobile ? "Hold for voice input" : "Click for voice input"}
                  aria-pressed={isVoiceListening}
                  disabled={busy}
                  title={
                    !isVoiceSupported
                      ? "Voice input is not supported in this browser"
                      : isVoiceListening
                        ? isMobile
                          ? "Release to stop voice input"
                          : "Click to stop voice input"
                        : isMobile
                          ? "Hold for voice input"
                          : "Click for voice input"
                  }
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
                          void (async () => {
                            if (forceThinking) {
                              setForceThinking(false);
                              setShowFeatureMenu(false);
                              return;
                            }
                            if (await canEnableFeatureFromUi("deep_thinking")) {
                              setForceThinking(true);
                              setShowFeatureMenu(false);
                            }
                          })();
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
                          void (async () => {
                            if (forcePlan) {
                              setForcePlan(false);
                              setShowFeatureMenu(false);
                              return;
                            }
                            if (await canEnableFeatureFromUi("plan")) {
                              setForcePlan(true);
                              setShowFeatureMenu(false);
                            }
                          })();
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          forcePlan
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        }`}
                      >
                        📋 Plan Mode
                      </button>
                      {hasFeatureAccess(subscriptionSnapshot?.plan ?? "free", "benefits_helper") && (
                      <button
                        onClick={() => {
                          setForceBenefits((prev) => !prev);
                          setShowFeatureMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          forceBenefits
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        }`}
                      >
                        🧾 Benefits Helper
                      </button>
                      )}
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
                      <button
                        onClick={() => {
                          void (async () => {
                            if (showEmailPanel) {
                              setShowEmailPanel(false);
                              setShowFeatureMenu(false);
                              return;
                            }
                            if (await canEnableFeatureFromUi("gmail_send")) {
                              setShowEmailPanel(true);
                              setShowFeatureMenu(false);
                            }
                          })();
                        }}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                          showEmailPanel
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                        }`}
                      >
                        ✉️ Gmail Email
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={() => void send()}
                disabled={(!input.trim() && pendingAttachments.length === 0) || busy}
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-label="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="px-4 py-2 text-center border-t border-border bg-surface/50">
          <p className="text-xs text-muted-foreground">
            RealTalk is not a therapist and can't solve mental health issues. In crisis? Call <strong>988</strong>
          </p>
        </div>
      </div>

      {editingPlanIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
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

      {/* Upgrade plan modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upgrade your plan</DialogTitle>
            <DialogDescription>
              You've reached your limit on the{" "}
              <span className="font-semibold capitalize">{subscriptionSnapshot?.plan ?? "free"}</span>{" "}
              plan. Upgrade to unlock higher limits.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PLAN_CATALOG.filter((p) => p.plan !== "free").map((plan) => (
              <div
                key={plan.plan}
                className="rounded-xl border border-border bg-surface/60 px-4 py-4 flex flex-col"
              >
                <p className="font-semibold text-sm mb-0.5">{plan.title}</p>
                <p className="text-xs text-muted-foreground mb-2">{plan.blurb}</p>
                <p className="text-sm font-bold mb-1">
                  £{plan.pricing.monthlyGbp}/mo
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    or £{plan.pricing.annualGbp}/yr
                  </span>
                </p>
                <ul className="space-y-1 mb-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-primary">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={upgradeBusy}
                    onClick={() => void handleUpgradeCheckout(plan.plan as "pro" | "platinum", "monthly")}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium h-8 hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {upgradeBusy ? "…" : "Monthly"}
                  </button>
                  <button
                    type="button"
                    disabled={upgradeBusy}
                    onClick={() => void handleUpgradeCheckout(plan.plan as "pro" | "platinum", "annual")}
                    className="flex-1 rounded-lg border border-primary text-primary text-xs font-medium h-8 hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    {upgradeBusy ? "…" : "Annual (save ~25%)"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
