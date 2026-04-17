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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      { rel: "stylesheet", href: appCss },
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
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
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
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
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
      You're offline — the app is running from cache. New messages require a connection.
    </div>
  );
}

function AppFrame() {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const showNav = user && path !== "/auth";

  return (
    <div className="min-h-screen flex flex-col">
      <OfflineBanner />
      {showNav && <TopNav />}
      <main className="flex-1 flex flex-col">
        {loading ? (
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
      const nextName =
        detail?.name ||
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        user?.email ||
        "Profile";
      const nextAvatar =
        detail?.avatarUrl ||
        (user?.user_metadata?.avatar_url as string | undefined) ||
        (user?.user_metadata?.avatar_data_url as string | undefined) ||
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

    return () => {
      window.removeEventListener("conversationCreated", refreshConversations);
      window.removeEventListener("conversationDeleted", refreshConversations);
      window.removeEventListener("conversationUpdated", refreshConversations);
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
              <div className="pt-0 pb-3 h-full flex flex-col">
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

                <Link
                  to="/profile"
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
