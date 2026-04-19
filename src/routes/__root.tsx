import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  Link,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import logo from "../assets/logo.png";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, Plus, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const ASSET_VERSION = appCss;
const APP_CSS_HREF = appCss.includes("?")
  ? `${appCss}&v=${encodeURIComponent(ASSET_VERSION)}`
  : `${appCss}?v=${encodeURIComponent(ASSET_VERSION)}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { httpEquiv: "Cache-Control", content: "no-cache, no-store, must-revalidate" },
      { httpEquiv: "Pragma", content: "no-cache" },
      { httpEquiv: "Expires", content: "0" },
      {
        httpEquiv: "Content-Security-Policy",
        content:
          "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mistral.ai https://fonts.googleapis.com https://gmail.googleapis.com; img-src 'self' data: https: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; base-uri 'self'; form-action 'self'",
      },
      { name: "referrer", content: "strict-origin-when-cross-origin" },
      { title: "RealTalk — Think clearly. Decide better." },
      {
        name: "description",
        content:
          "RealTalk is a calm AI companion that helps you reduce overthinking, find clarity, and turn your thoughts into clear plans.",
      },
      { name: "author", content: "RealTalk" },
      { property: "og:title", content: "RealTalk — Think clearly. Decide better." },
      {
        property: "og:description",
        content: "A calm AI companion for clarity and better decisions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "RealTalk — Think clearly. Decide better." },
      { name: "description", content: "RealTalk is an AI-powered web app that guides users to reduce overthinking and make better decisions." },
      { property: "og:description", content: "RealTalk is an AI-powered web app that guides users to reduce overthinking and make better decisions." },
      { name: "twitter:description", content: "RealTalk is an AI-powered web app that guides users to reduce overthinking and make better decisions." },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: APP_CSS_HREF },
      { rel: "privacy-policy", href: "https://userealtalk.co.uk/privacy" },
      { rel: "terms-of-service", href: "https://userealtalk.co.uk/terms" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  errorComponent: RootError,
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const forceUpdateScript = `
    (() => {
      if (typeof window === "undefined") return;
      const version = ${JSON.stringify(ASSET_VERSION)};
      const versionKey = "realtalk_asset_version";
      const reloadKey = "realtalk_asset_reloaded_once";

      const previous = localStorage.getItem(versionKey);
      const changed = previous && previous !== version;

      localStorage.setItem(versionKey, version);

      if (!changed) {
        sessionStorage.removeItem(reloadKey);
        return;
      }

      if (sessionStorage.getItem(reloadKey)) return;
      sessionStorage.setItem(reloadKey, "1");

      try {
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((reg) => reg.unregister());
          });
        }
      } catch {}

      try {
        if ("caches" in window) {
          caches.keys().then((keys) => {
            keys.forEach((key) => caches.delete(key));
          });
        }
      } catch {}

      const next = new URL(window.location.href);
      next.searchParams.set("_v", Date.now().toString());
      window.location.replace(next.toString());
    })();
  `;

  const chunkRecoveryScript = `
    (() => {
      if (typeof window === "undefined") return;
      const key = "realtalk_chunk_reloaded_once";
      const reloadOnce = () => {
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
          const next = new URL(window.location.href);
          next.searchParams.set("_cb", Date.now().toString());
          window.location.replace(next.toString());
        } catch {
          window.location.reload();
        }
      };

      const shouldRecover = (value) => {
        const msg = String(value || "");
        return msg.includes("dynamically imported module") || msg.includes("Loading chunk") || msg.includes("Importing a module script failed");
      };

      window.addEventListener("error", (event) => {
        if (shouldRecover(event?.message)) reloadOnce();
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        if (shouldRecover(reason?.message || reason)) reloadOnce();
      });
    })();
  `;

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: forceUpdateScript }} />
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <AppFrame />
      <Toaster />
    </AuthProvider>
  );
}

function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Set initial state safely on client only
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="w-full bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-300 text-xs text-center py-1.5 px-4">
      You're offline. Some actions may not work until your connection is back.
    </div>
  );
}

function AppFrame() {
  const { user, session, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const showNav = user && path !== "/auth";
  const showLoadingState = loading;

  useEffect(() => {
    if (!user || !session?.access_token || !user.email) return;

    let disposed = false;
    let running = false;

    const runReminderCheck = async () => {
      if (disposed || running) return;

      running = true;
      try {
        const { data: settingRow } = await supabase
          .from("user_insight_settings")
          .select("schedule_email_reminders_enabled, schedule_email_reminder_minutes, schedule_email_use_gmail")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!settingRow?.schedule_email_reminders_enabled) return;

        const leadMinutes = Number(settingRow.schedule_email_reminder_minutes ?? 30);
        const useGmailChannel = Boolean(settingRow.schedule_email_use_gmail && session.provider_token);
        const now = new Date();
        const windowStart = now.toISOString();
        const windowEnd = new Date(now.getTime() + leadMinutes * 60_000).toISOString();

        const { data: upcoming } = await supabase
          .from("user_schedules")
          .select("id,title,notes,starts_at")
          .eq("user_id", user.id)
          .eq("is_completed", false)
          .gte("starts_at", windowStart)
          .lte("starts_at", windowEnd)
          .order("starts_at", { ascending: true })
          .limit(6);

        const scheduleItems = (upcoming ?? []) as Array<{
          id: string;
          title: string;
          notes: string;
          starts_at: string;
        }>;

        if (scheduleItems.length === 0) return;

        const scheduleIds = scheduleItems.map((item) => item.id);
        const { data: sentLogs } = await supabase
          .from("user_schedule_reminder_logs")
          .select("schedule_id")
          .eq("user_id", user.id)
          .in("schedule_id", scheduleIds);

        const sentSet = new Set((sentLogs ?? []).map((row: any) => String(row.schedule_id)));
        const pending = scheduleItems.filter((item) => !sentSet.has(item.id));
        if (pending.length === 0) return;

        for (const item of pending) {
          const startsAt = new Date(item.starts_at);
          const subject = `Reminder: ${item.title} at ${startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
          const body = [
            `Hi${user.email ? " " + user.email.split("@")[0] : ""},`,
            "",
            `This is your RealTalk schedule reminder for: ${item.title}`,
            `Date: ${startsAt.toLocaleDateString()}`,
            `Time: ${startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
            item.notes ? `Notes: ${item.notes}` : "",
            "",
            "You can manage your schedule from your RealTalk profile calendar.",
          ]
            .filter(Boolean)
            .join("\n");

          const emailResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-send`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
            },
            body: JSON.stringify({
              to: user.email,
              subject,
              body,
              googleAccessToken: useGmailChannel ? session.provider_token : null,
            }),
          });

          if (!emailResp.ok) continue;

          const emailJson = await emailResp.json().catch(() => ({}));
          const providerChannel = String(emailJson?.provider || (useGmailChannel ? "gmail" : "resend"));

          await supabase.from("user_schedule_reminder_logs").insert({
            user_id: user.id,
            schedule_id: item.id,
            channel: providerChannel,
          });
        }
      } catch {
        // Silent fail for reminder checks.
      } finally {
        running = false;
      }
    };

    void runReminderCheck();
    const timer = window.setInterval(() => {
      void runReminderCheck();
    }, 60_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [user?.id, user?.email, session?.access_token, session?.provider_token]);

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col">
      <OfflineBanner />
      {showNav && <TopNav />}
      <main className="flex-1 flex flex-col">
        {showLoadingState ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            …
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function TopNav() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Array<{ id: string; title: string }>>([]);
  const [open, setOpen] = useState(false);
  const [profileName, setProfileName] = useState("Profile");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    const syncProfile = (detail?: { name?: string; avatarUrl?: string }) => {
      const localAvatar =
        typeof window !== "undefined" && user?.id
          ? localStorage.getItem(`avatar_local_${user.id}`) || ""
          : "";
      const nextName =
        detail?.name ||
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        user?.email ||
        "Profile";
      const nextAvatar =
        detail?.avatarUrl ||
        (user?.user_metadata?.avatar_url as string | undefined) ||
        localAvatar ||
        "";
      setProfileName(nextName);
      setAvatarUrl(nextAvatar);
    };

    syncProfile();
    const onProfileUpdated = (event: Event) => {
      syncProfile((event as CustomEvent<{ name?: string; avatarUrl?: string }>).detail);
    };
    window.addEventListener("profileUpdated", onProfileUpdated);
    return () => window.removeEventListener("profileUpdated", onProfileUpdated);
  }, [user]);

  const initials = profileName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "U";

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("id, title")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(10);
    if (data) setConversations(data);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    loadConversations();

    const refreshConversations = () => {
      loadConversations();
    };

    window.addEventListener("conversationCreated", refreshConversations);
    window.addEventListener("conversationDeleted", refreshConversations);
    window.addEventListener("conversationUpdated", refreshConversations);

    const channel = supabase
      .channel(`topnav-conversations-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        refreshConversations,
      )
      .subscribe();

    return () => {
      window.removeEventListener("conversationCreated", refreshConversations);
      window.removeEventListener("conversationDeleted", refreshConversations);
      window.removeEventListener("conversationUpdated", refreshConversations);
      supabase.removeChannel(channel);
    };
  }, [user, loadConversations]);

  const deleteConversation = async (convId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", convId)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to delete conversation");
    } else {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      toast.success("Conversation deleted");
    }
  };

  const navigateToConversation = (convId: string) => {
    setOpen(false);
    navigate({ to: "/", search: { c: convId } as never });
  };

  const startNewChat = () => {
    setOpen(false);
    navigate({ to: "/", search: {} as never, replace: true });
  };

  return (
    <header className="border-b border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30">
      <div className="max-w-3xl mx-auto px-5 h-14 flex items-center relative">
        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 pt-2">
              <div className="pt-0 pb-3 h-full flex flex-col overflow-hidden">
                <div className="px-3 pb-2 mb-1 border-b border-border/60 flex items-center justify-center">
                  <Link
                    to="/"
                    search={{} as never}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center"
                  >
                    <img src={logo} alt="RealTalk" className="h-[99px] w-auto" />
                  </Link>
                </div>

                <button
                  onClick={startNewChat}
                  className="mx-2 mb-2 flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 hover:bg-surface-elevated transition-colors"
                >
                  <div className="min-w-0 text-left">
                    <p className="text-xs text-muted-foreground">Chat</p>
                    <p className="text-sm text-foreground">New chat</p>
                  </div>
                  <Plus className="h-4 w-4 text-primary" />
                </button>
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 desktop-nav-scroll">
                  <h2 className="px-4 text-sm font-semibold text-foreground mb-4">
                    Recent Chats
                  </h2>
                  {conversations.length === 0 ? (
                    <div className="px-4 text-sm text-muted-foreground">No conversations yet</div>
                  ) : (
                    <nav className="flex flex-col gap-1">
                      {conversations.map((conv) => (
                        <div
                          key={conv.id}
                          className="group flex items-center gap-2 px-2 py-1 hover:bg-surface rounded-md transition-colors"
                        >
                          <button
                            onClick={() => navigateToConversation(conv.id)}
                            className="flex-1 px-2 py-1 text-left text-sm text-muted-foreground hover:text-foreground truncate"
                          >
                            {conv.title}
                          </button>
                          <button
                            onClick={() => deleteConversation(conv.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-foreground transition-all"
                            title="Delete conversation"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </nav>
                  )}
                </div>

                <Link
                  to="/profile"
                  search={{ tab: undefined }}
                  onClick={() => setOpen(false)}
                  className="mx-2 mt-auto pt-3 border-t border-border/70 flex items-center justify-between rounded-md px-3 py-2 hover:bg-surface-elevated transition-colors"
                >
                  <div className="min-w-0 text-left">
                    <p className="text-xs text-muted-foreground">Profile</p>
                    <p className="text-sm text-foreground truncate">{profileName}</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center overflow-hidden">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="font-serif text-6xl">404</h1>
        <p className="mt-3 text-muted-foreground">This page drifted off.</p>
        <Link
          to="/"
          className="inline-block mt-6 text-primary hover:underline flex items-center gap-2"
        >
          <img src={logo} alt="RealTalk" className="h-5 w-auto" />
          Back home
        </Link>
      </div>
    </div>
  );
}

function RootError() {
  return (
    <div className="flex-1 min-h-screen flex items-center justify-center px-4">
      <div className="max-w-xl w-full text-center space-y-4">
        <h1 className="font-serif text-4xl">Something went wrong</h1>
        <p className="text-muted-foreground">An unexpected error occurred. Please try again.</p>
        <div className="flex items-center justify-center gap-3 text-sm">
          <a href="/" className="text-primary hover:underline">Go home</a>
          <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
          <a href="/terms" className="text-primary hover:underline">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
