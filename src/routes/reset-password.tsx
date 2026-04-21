import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

import logo from "../assets/logo.png";

export const Route = createFileRoute("/reset-password")({
  component: PasswordRecoveryPage,
  head: () => ({ meta: [{ title: "Recover your password - RealTalk" }] }),
});

export function PasswordRecoveryPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    let active = true;

    const checkRecoverySession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setLinkValid(Boolean(data.session));
      } finally {
        if (active) setCheckingLink(false);
      }
    };

    void checkRecoverySession();

    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      toast.error(error.message || "Could not reset password.");
      return;
    }

    toast.success("Your RealTalk password is updated. Sign in when you're ready.");
    navigate({ to: "/auth" });
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

        <div className="rounded-2xl border border-border bg-surface/60 backdrop-blur p-6 space-y-5">
          <div>
            <h1 className="font-serif text-2xl mb-1">Get back to clarity.</h1>
            <p className="text-sm text-muted-foreground">
              Open the RealTalk recovery link from your email, then choose a fresh password for your account.
            </p>
          </div>

          {checkingLink ? (
            <p className="text-sm text-muted-foreground">Checking your recovery link...</p>
          ) : !linkValid ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This RealTalk recovery link is missing or has expired. Request a fresh email from the sign-in page.
              </p>
              <Button type="button" className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type={showPasswords ? "text" : "password"}
                  minLength={6}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type={showPasswords ? "text" : "password"}
                  minLength={6}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-reset-passwords"
                  checked={showPasswords}
                  onCheckedChange={(checked) => setShowPasswords(checked === true)}
                />
                <Label
                  htmlFor="show-reset-passwords"
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                >
                  Show passwords
                </Label>
              </div>

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}