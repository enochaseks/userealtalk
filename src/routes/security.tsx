import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
  head: () => ({ meta: [{ title: "Security — RealTalk" }] }),
});

function SecurityPage() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10">
      <button
        onClick={() => navigate({ to: "/settings" })}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>
      <h1 className="font-serif text-3xl tracking-tight">Security</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated: May 2026
      </p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">

        <section>
          <h2 className="font-semibold text-base">1. How We Protect Your Account</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk uses <strong>Supabase Auth</strong> to manage authentication. Your password is never stored in plain text — it is hashed using industry-standard bcrypt before being stored. We use HTTPS for all data in transit.
          </p>
          <p className="mt-2 text-muted-foreground">
            Sessions are short-lived and automatically refreshed. Signing out immediately revokes your active session token.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">2. Two-Factor Authentication (2FA)</h2>
          <p className="mt-2 text-muted-foreground">
            We strongly recommend enabling two-factor authentication on your account. With 2FA enabled, even if someone obtains your password they cannot access your account without your second factor.
          </p>
          <p className="mt-2 text-muted-foreground">RealTalk supports authenticator-app based 2FA (TOTP). Compatible apps include:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Google Authenticator</li>
            <li>Authy</li>
            <li>Microsoft Authenticator</li>
            <li>1Password (built-in TOTP)</li>
            <li>Any RFC 6238-compliant TOTP app</li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            To enable 2FA, go to{" "}
            <Link to="/settings" className="text-primary hover:underline">
              Settings → Two-factor authentication
            </Link>
            . You will be shown a QR code to scan with your authenticator app. After scanning, enter the 6-digit code to confirm setup. Keep your backup codes somewhere safe — if you lose access to your authenticator app and do not have your backup codes, you may be locked out.
          </p>
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-amber-800 dark:text-amber-300 text-xs font-medium">
              Once 2FA is enabled, you will be prompted for a code on every new sign-in. Do not share your codes with anyone — RealTalk support will never ask for them.
            </p>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-base">3. Password Security</h2>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Use a strong, unique password you do not reuse on other sites.</li>
            <li>Your password should be at least 12 characters and include a mix of letters, numbers, and symbols.</li>
            <li>Never share your password with anyone, including RealTalk support.</li>
            <li>If you suspect your password has been compromised, reset it immediately from the sign-in page.</li>
            <li>Consider using a password manager (e.g. 1Password, Bitwarden) to generate and store strong passwords.</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            You can reset your password at any time via the{" "}
            <a href="/recover" className="text-primary hover:underline">forgotten password</a> page.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">4. Security Email Notifications</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk can send you email alerts when significant changes are made to your account data, including:
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Money Planner updates (goal, spending, tasks, benefits)</li>
            <li>Debt details saved or changed</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            These emails help you spot unauthorised activity. You can toggle them on or off in{" "}
            <Link to="/settings" className="text-primary hover:underline">Settings → Money Planner security emails</Link>.
          </p>
          <p className="mt-2 text-muted-foreground">
            If you receive a security notification for a change you did not make, review your account immediately and reset your password.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">5. Session Management</h2>
          <p className="mt-2 text-muted-foreground">
            You are responsible for keeping your devices secure. Always sign out of RealTalk on shared or public devices. Signing out immediately invalidates your session token server-side.
          </p>
          <p className="mt-2 text-muted-foreground">
            RealTalk sessions automatically expire after a period of inactivity and are refreshed silently when you are active.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">6. Data Storage & Encryption</h2>
          <p className="mt-2 text-muted-foreground">
            Your data is stored on Supabase (PostgreSQL) with row-level security (RLS) enforced — no user can access another user's data. All connections use TLS/HTTPS. Sensitive financial files shared in chat are processed in-session and not persisted to the database.
          </p>
          <p className="mt-2 text-muted-foreground">
            Supabase infrastructure is hosted in the EU and is SOC 2 Type 2 certified. See{" "}
            <a href="https://supabase.com/security" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              supabase.com/security
            </a>{" "}
            for full details.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">7. Recognising Phishing</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk will never ask for your password or 2FA codes by email, chat, or any other channel. Legitimate emails from RealTalk will only ever come from our verified sending domain. If you receive a suspicious message claiming to be from RealTalk, do not click any links and report it.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">8. Reporting a Security Issue</h2>
          <p className="mt-2 text-muted-foreground">
            If you discover a security vulnerability in RealTalk, please report it responsibly. Do not publicly disclose the issue until it has been addressed.
          </p>
          <p className="mt-2 text-muted-foreground">
            Contact us at: <a href="mailto:realtalklimited@gmail.com" className="text-primary hover:underline">realtalklimited@gmail.com</a>
          </p>
          <p className="mt-2 text-muted-foreground">
            We aim to acknowledge all valid reports within 72 hours and resolve critical issues as a priority.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">9. Your Responsibilities</h2>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Keep your email address up to date so you can receive security alerts and password resets.</li>
            <li>Enable 2FA for the strongest account protection.</li>
            <li>Use a unique, strong password.</li>
            <li>Sign out on shared devices.</li>
            <li>Review your account activity if you receive an unexpected security email.</li>
          </ul>
        </section>

        <div className="pt-4 border-t border-border flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
          <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
          <Link to="/security" className="text-primary hover:underline">Security</Link>
          <Link to="/refund-policy" className="text-primary hover:underline">Refund &amp; Cancellation</Link>
          <Link to="/account-data" className="text-primary hover:underline">Your Data</Link>
          <Link to="/settings" className="text-primary hover:underline">Settings</Link>
        </div>
      </div>
    </div>
  );
}
