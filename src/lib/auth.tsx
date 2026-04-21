import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const KEEP_KEY = "realtalk_keep_logged_in";
const SESSION_KEY = "realtalk_session_active";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mapAuthError(error?: { message?: string; code?: string; status?: number }) {
  if (!error) return undefined;

  const message = (error.message || "").toLowerCase();

  if (
    error.status === 429 ||
    error.code === "over_request_rate_limit" ||
    error.code === "over_email_send_rate_limit" ||
    message.includes("too many requests") ||
    message.includes("rate limit")
  ) {
    return "Too many reset requests right now. Please wait a few minutes and try again.";
  }

  if (error.code === "invalid_credentials") {
    return "Invalid email/password for this project. If your old account was on a different project, create a new account here.";
  }

  if (error.code === "email_not_confirmed") {
    return "Check your inbox and confirm your email before signing in.";
  }

  return error.message || "Authentication failed";
}

function extractRetryAfterSeconds(message?: string) {
  if (!message) return undefined;
  const lower = message.toLowerCase();

  const secondsMatch = lower.match(/(\d+)\s*(seconds|second|secs|sec|s)\b/);
  if (secondsMatch) return Number(secondsMatch[1]);

  const minutesMatch = lower.match(/(\d+)\s*(minutes|minute|mins|min|m)\b/);
  if (minutesMatch) return Number(minutesMatch[1]) * 60;

  return undefined;
}

function getGoogleAuthOptions() {
  return {
    redirectTo: window.location.href,
    queryParams: {
      access_type: "offline",
      prompt: "consent",
      scope: "openid email profile https://www.googleapis.com/auth/gmail.send",
    },
  };
}

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string, keep?: boolean) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, keep?: boolean) => Promise<{ error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ error?: string; retryAfterSeconds?: number; status?: number }>;
  signInWithGoogle: (keep?: boolean) => Promise<{ error?: string }>;
  connectGoogleForGmail: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // "Keep me logged in" enforcement: if user opted out, clear session on new browser start
  useEffect(() => {
    const keep = localStorage.getItem(KEEP_KEY);
    const sessionAlive = sessionStorage.getItem(SESSION_KEY);
    if (keep === "false" && !sessionAlive) {
      // New browser session and user didn't want persistence — sign out silently
      void supabase.auth.signOut({ scope: "local" });
    }
    sessionStorage.setItem(SESSION_KEY, "1");
  }, []);

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
    signIn: async (email, password, keep = true) => {
      localStorage.setItem(KEEP_KEY, String(keep));
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizeEmail(email),
        password,
      });
      return { error: mapAuthError(error) };
    },
    signUp: async (email, password, keep = true) => {
      localStorage.setItem(KEEP_KEY, String(keep));
      const { error } = await supabase.auth.signUp({
        email: normalizeEmail(email),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      return { error: mapAuthError(error) };
    },
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
        redirectTo: `${window.location.origin}/recover`,
      });
      return {
        error: mapAuthError(error),
        retryAfterSeconds: extractRetryAfterSeconds(error?.message),
        status: error?.status,
      };
    },
    signInWithGoogle: async (keep = true) => {
      localStorage.setItem(KEEP_KEY, String(keep));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: getGoogleAuthOptions(),
      });
      return { error: error?.message };
    },
    connectGoogleForGmail: async () => {
      if (session?.user) {
        const { error } = await supabase.auth.linkIdentity({
          provider: "google",
          options: getGoogleAuthOptions(),
        });

        if (!error) return {};

        const message = (error.message || "").toLowerCase();
        const shouldFallbackToOauth =
          error.code === "identity_already_exists" ||
          message.includes("already linked") ||
          message.includes("identity already exists") ||
          message.includes("manual linking");

        if (!shouldFallbackToOauth) {
          return { error: mapAuthError(error) ?? error.message };
        }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: getGoogleAuthOptions(),
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
