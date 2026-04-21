import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "Privacy Policy — RealTalk" }] }),
});

function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10">
      <button
        onClick={() => navigate({ to: "/profile", search: { tab: undefined } })}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Back
      </button>
      <h1 className="font-serif text-3xl tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated: April 2026
      </p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="font-semibold text-base">1. Overview</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk is an AI-powered platform designed to help users reflect, gain clarity, and make better decisions through conversation.
          </p>
          <p className="mt-2 text-muted-foreground">
            This policy explains what data we collect, how it is used, and the control you have over it.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">2. What We Collect</h2>
          <p className="mt-2 text-muted-foreground">We may collect and store the following:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Account information (e.g. email address)</li>
            <li>Chat conversations and generated responses</li>
            <li>Venting preference settings (private by default, optional share)</li>
            <li>Saved plans and profile preferences</li>
            <li>Comfort boundary settings</li>
            <li>Preference signals extracted from conversations (e.g. communication style, emotional patterns)</li>
            <li>Weekly insight data (if enabled)</li>
            <li>Optional profile details (e.g. display name, avatar)</li>
            <li>Reminder settings and delivery logs (if enabled)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">3. AI Processing &amp; Profile Learning</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk automatically processes conversations to identify patterns and improve responses.
          </p>
          <p className="mt-2 text-muted-foreground">This includes extracting signals such as:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>interests</li>
            <li>communication style</li>
            <li>life context</li>
            <li>emotional patterns</li>
            <li>positive response signals</li>
            <li>comfort boundaries</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            This processing occurs after conversations and is used solely to personalise your experience.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">4. RealTime Neurons (Brain Growth Feature)</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk includes a visual feature called <strong>RealTime Neurons</strong>, which reflects how the system has learned about you across multiple dimensions.
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Brain growth progress is stored locally in your browser (localStorage)</li>
            <li>This data is not synced to our servers</li>
            <li>Clearing your browser data will reset this visual progress</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            The underlying profile data used to generate this feature is stored securely in your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">5. Weekly Insights</h2>
          <p className="mt-2 text-muted-foreground">
            If enabled, RealTalk generates weekly summaries based on your conversations, including:
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>emotional trends</li>
            <li>thought patterns</li>
            <li>interaction quality</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            These insights are stored in your account and may be emailed to you if you opt in.
          </p>
          <p className="mt-2 text-muted-foreground">You can disable this feature at any time.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base">6. Third-Party AI Providers</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk uses third-party AI providers to generate responses and process data, including:
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Mistral AI</li>
            <li>Cloudflare</li>
            <li>Google (optional fallback)</li>
          </ul>
          <p className="mt-2 text-muted-foreground">Your messages may be processed by these providers to generate responses.</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Only the content necessary for each request is shared</li>
            <li>We do not share identifying account information</li>
            <li>Data is used strictly for request processing</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">7. Gmail Integration (Optional)</h2>
          <p className="mt-2 text-muted-foreground">If you connect your Google account:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>RealTalk requests permission only to send emails on your behalf</li>
            <li>This is used for features such as scheduled reminders or weekly insights (if enabled)</li>
            <li>RealTalk does not read, store, or analyse your Gmail messages</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            Gmail integration is optional and not required for core features.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">8. Vent Mode Privacy</h2>
          <p className="mt-2 text-muted-foreground">
            Vent mode is private by default. When private venting is active, vent-mode messages are not saved to your database chat history.
          </p>
          <p className="mt-2 text-muted-foreground">
            You may opt in to sharing vent chats from Settings. If you do, vent-mode messages can be stored like normal chats to support continuity and insights.
          </p>
          <p className="mt-2 text-muted-foreground">
            Fallback behavior: if your vent sharing preference cannot be read, RealTalk defaults to private venting.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">9. How We Use Your Data</h2>
          <p className="mt-2 text-muted-foreground">Your data is used to:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>generate AI responses</li>
            <li>personalise your experience</li>
            <li>improve conversation quality</li>
            <li>generate insights and plans</li>
            <li>display features such as RealTime Neurons</li>
            <li>send optional emails (if enabled)</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            We do not sell your data or use it for advertising.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">10. Data Retention</h2>
          <p className="mt-2 text-muted-foreground">
            Your data is retained for as long as your account exists.
          </p>
          <p className="mt-2 text-muted-foreground">You can:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>export your data</li>
            <li>delete your account at any time</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            On deletion, all server-side data (including conversations, insights, and preferences) is permanently removed.
          </p>
          <p className="mt-2 text-muted-foreground">Local browser data must be cleared manually.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base">11. Your Control</h2>
          <p className="mt-2 text-muted-foreground">You can:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>view your stored data</li>
            <li>export your data</li>
            <li>delete your account</li>
            <li>enable or disable insights and email features</li>
            <li>enable or disable vent chat sharing</li>
          </ul>
          <p className="mt-2 text-muted-foreground">All controls are available via the account data page.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base">12. Sensitive Information</h2>
          <p className="mt-2 text-muted-foreground">
            We recognise that conversations may include personal or sensitive thoughts.
          </p>
          <p className="mt-2 text-muted-foreground">
            RealTalk is designed to handle this responsibly, but users should avoid sharing highly sensitive personal, medical, or confidential information.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">13. Security</h2>
          <p className="mt-2 text-muted-foreground">
            We implement appropriate safeguards to protect your data from unauthorised access or misuse.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">14. Changes to This Policy</h2>
          <p className="mt-2 text-muted-foreground">
            We may update this policy as RealTalk evolves. Updates will be reflected by the "Last updated" date.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">15. Contact</h2>
          <p className="mt-2 text-muted-foreground">For privacy-related questions:</p>
          <p className="mt-2 text-muted-foreground">
            <strong>Email:</strong>{" "}
            <a
              href="mailto:support@userealtalk.co.uk"
              className="text-primary hover:underline"
            >
              support@userealtalk.co.uk
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
