import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { motion } from "framer-motion";
import { toast } from "sonner";

import logo from "../assets/logo.png";

const SIGNUP_COOLDOWN_MS = 60_000;
const SIGNUP_LAST_ATTEMPT_KEY = "realtalk_signup_last_attempt";
const KEEP_KEY = "realtalk_keep_logged_in";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({ meta: [{ title: "Sign in — RealTalk" }] }),
});

function AuthPage() {
  const { signIn, signUp, requestPasswordReset, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(() => localStorage.getItem(KEEP_KEY) !== "false");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) {
      navigate({ to: "/" });
    }
  }, [user, navigate]);

  if (user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "signup") {
      const lastAttempt = Number(localStorage.getItem(SIGNUP_LAST_ATTEMPT_KEY) || "0");
      const waitMs = SIGNUP_COOLDOWN_MS - (Date.now() - lastAttempt);
      if (waitMs > 0) {
        toast.error(`Please wait ${Math.ceil(waitMs / 1000)}s before trying again.`);
        return;
      }
      localStorage.setItem(SIGNUP_LAST_ATTEMPT_KEY, String(Date.now()));
    }

    setBusy(true);
    const { error } =
      mode === "signin"
        ? await signIn(email, password, keep)
        : await signUp(email, password, keep);
    setBusy(false);
    if (error) {
      toast.error(error);
    } else {
      if (mode === "signup") {
        toast.success("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
        return;
      }
      const pending = localStorage.getItem("realtalk_pending_checkout");
      navigate({ to: pending ? "/settings" : "/" });
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    const { error } = await signInWithGoogle(keep);
    if (error) {
      toast.error(error);
      setBusy(false);
    }
    // On success, Supabase redirects automatically.
  };

  const handlePasswordReset = async () => {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      toast.error("Enter your email first, then request a password reset.");
      return;
    }

    setBusy(true);
    const { error, status } = await requestPasswordReset(normalized);
    setBusy(false);

    if (error) {
      if (status === 429) {
        toast.error("Reset email is being rate-limited by Supabase right now. Wait and retry, or increase Auth email rate limits in Supabase dashboard.");
        return;
      }
      toast.error(error);
      return;
    }

    toast.success("We sent your RealTalk password reset link. Check your inbox to keep going.");
  };

  return (
    <div className="flex-1 realtalk-ambient flex items-center justify-center px-5 py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <Link to="/" className="block text-center mb-10">
          <img src={logo} alt="RealTalk" className="h-40 w-auto mx-auto" />
        </Link>

        <div className="rounded-2xl border border-border bg-surface/60 backdrop-blur p-6">
          <h1 className="font-serif text-2xl mb-1">
            {mode === "signin" ? "Welcome back." : "Create your space."}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin"
              ? "A quiet place to think out loud."
              : "Start thinking clearly in seconds."}
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="show-password"
                checked={showPassword}
                onCheckedChange={(checked) => setShowPassword(checked === true)}
              />
              <Label htmlFor="show-password" className="text-sm text-muted-foreground cursor-pointer select-none">
                Show password
              </Label>
            </div>

            {mode === "signin" ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={busy}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            ) : null}

            {/* Keep me logged in */}
            <div className="flex items-center justify-between py-1">
              <Label htmlFor="keep" className="text-sm text-muted-foreground cursor-pointer select-none">
                Keep me logged in
              </Label>
              <Switch
                id="keep"
                checked={keep}
                onCheckedChange={setKeep}
              />
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground">
              <span className="bg-surface/60 px-2">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={handleGoogle}
            className="w-full"
          >
            Continue with Google
          </Button>

          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-center"
          >
            {mode === "signin" ? "No account yet? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
