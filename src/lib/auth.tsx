import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadingGuard = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setSession(s);
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
      })
      .catch(() => {
        // If Safari storage/network glitches, avoid freezing the UI in loading state.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      clearTimeout(loadingGuard);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    let disposed = false;

    const refreshUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (disposed || !data.user) return;
      setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshUser();
      }
    };

    const timer = window.setInterval(() => {
      void refreshUser();
    }, 30000);

    window.addEventListener("focus", refreshUser);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshUser);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.user) return;

    const avatarUrl = session.user.user_metadata?.avatar_url as string | undefined;
    const avatarDataUrl = session.user.user_metadata?.avatar_data_url as string | undefined;
    const hasOversizedAvatarPayload =
      Boolean(avatarDataUrl) || (typeof avatarUrl === "string" && avatarUrl.startsWith("data:"));

    if (!hasOversizedAvatarPayload) return;

    const run = async () => {
      try {
        await supabase.auth.updateUser({
          data: {
            ...session.user.user_metadata,
            avatar_url: null,
            avatar_data_url: null,
          },
        });
        await supabase.auth.refreshSession();
      } catch {
        // Best effort only.
      }
    };

    void run();
  }, [session]);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message };
    },
    signUp: async (email, password) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      return { error: error?.message };
    },
    signOut: async () => {
      try {
        await Promise.race([
          supabase.auth.signOut({ scope: "global" }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Global sign out timeout")), 6000),
          ),
        ]);
      } catch {
        // Safari/network-safe fallback: always clear local session state.
        await supabase.auth.signOut({ scope: "local" });
      }
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
