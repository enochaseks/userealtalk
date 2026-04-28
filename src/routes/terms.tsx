import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({ meta: [{ title: "Terms of Service — RealTalk" }] }),
});

function TermsPage() {
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
      <h1 className="font-serif text-3xl tracking-tight">Terms of Service</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: April 2026 (updated to cover CV Toolkit, voice input, subscriptions, and location-based guidance)</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="font-semibold text-base">1. Service Overview</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk is an AI-powered platform designed to support thinking, planning, venting, and personal clarity.
          </p>
          <p className="mt-2 text-muted-foreground">It provides:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>AI-assisted chat</li>
            <li>plan generation</li>
            <li>weekly insight summaries</li>
            <li>personalised profile learning</li>
            <li>CV Toolkit (review, job matching, cover letter, rewrite, transferable skills, personal statement)</li>
            <li>voice input</li>
            <li>journal</li>
            <li>schedule reminders</li>
            <li>optional location-aware guidance</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            RealTalk is not a substitute for licensed medical, legal, financial, or psychological advice.
            In any emergency or crisis, contact your local emergency services immediately.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">2. Eligibility</h2>
          <p className="mt-2 text-muted-foreground">You must be at least 16 years old to use RealTalk.</p>
          <p className="mt-2 text-muted-foreground">By using the service, you confirm that you meet this requirement.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base">3. Profile Learning &amp; AI Personalisation</h2>
          <p className="mt-2 text-muted-foreground">
            By using RealTalk, you consent to the automated processing of your conversations to extract preference signals, including:
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>interests</li>
            <li>communication style</li>
            <li>life context</li>
            <li>emotional patterns</li>
            <li>positive response signals</li>
            <li>comfort boundaries</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            These signals are used solely to personalise your experience and improve response relevance.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">4. RealTime Neurons (Visual Feature)</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk includes a feature known as <strong>RealTime Neurons</strong>, which visually represents how the system has learned about you.
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Brain growth state is stored locally in your browser (localStorage)</li>
            <li>This data is not backed up to our servers</li>
            <li>Clearing browser data or switching devices may reset this visual state</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            The underlying profile data used to generate this feature is stored securely in your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">5. Vent Mode Privacy</h2>
          <p className="mt-2 text-muted-foreground">
            Vent mode is private by default. Private vent-mode messages are not stored in your database chat history.
          </p>
          <p className="mt-2 text-muted-foreground">
            You may opt in to sharing vent chats in Settings. When enabled, vent-mode messages may be stored and processed like other chats.
          </p>
          <p className="mt-2 text-muted-foreground">
            If RealTalk cannot determine your vent sharing setting, private venting remains the default fallback.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">6. Weekly Insights</h2>
          <p className="mt-2 text-muted-foreground">
            If enabled, RealTalk generates periodic summaries based on your conversations, including:
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>emotional trends</li>
            <li>thought patterns</li>
            <li>interaction quality</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            These insights are generated by AI and are reflective only. They do not constitute clinical or professional assessment.
          </p>
          <p className="mt-2 text-muted-foreground">You may disable this feature at any time.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base">7. AI Providers &amp; Service Availability</h2>
          <p className="mt-2 text-muted-foreground">RealTalk uses third-party AI providers to generate responses, including:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Mistral AI (primary)</li>
            <li>Cloudflare (fallback)</li>
            <li>Google (optional fallback)</li>
          </ul>
          <p className="mt-2 text-muted-foreground">Response quality and availability may vary.</p>
          <p className="mt-2 text-muted-foreground">We do not guarantee:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>uninterrupted service</li>
            <li>consistent response quality</li>
            <li>continuous availability of any specific provider</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">8. Acceptable Use</h2>
          <p className="mt-2 text-muted-foreground">You agree not to:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>misuse the platform</li>
            <li>attempt unauthorised access</li>
            <li>interfere with system functionality</li>
            <li>use RealTalk for unlawful, harmful, or abusive purposes</li>
            <li>attempt to reverse-engineer or exploit AI systems</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">9. Gmail Integration (Optional)</h2>
          <p className="mt-2 text-muted-foreground">If you connect Google:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>you authorise RealTalk to send emails on your behalf when explicitly triggered or when optional features (such as weekly insights) are enabled</li>
            <li>RealTalk does not read, store, or analyse your Gmail messages</li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            This feature is optional and can be disabled at any time.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">9a. CV Toolkit</h2>
          <p className="mt-2 text-muted-foreground">
            The CV Toolkit allows you to upload a CV and receive AI-generated feedback, job matching, cover letters, and more.
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>CV content is processed by AI and not permanently stored as raw files</li>
            <li>You are responsible for ensuring the CV you upload belongs to you or you have permission to use it</li>
            <li>AI-generated outputs (cover letters, rewrites, etc.) are drafts only — review before use</li>
            <li>Usage is metered per plan. Unused daily allowances do not carry over</li>
            <li>Do not upload CVs containing highly sensitive data such as passport or financial details</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">9b. Voice Input</h2>
          <p className="mt-2 text-muted-foreground">
            Voice input is an optional feature that uses your device microphone to transcribe speech to text.
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Audio is transcribed in real time and not stored as audio files</li>
            <li>Voice input usage is metered in minutes per month based on your plan</li>
            <li>You are responsible for any content spoken via voice input</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">9c. Subscription Plans &amp; Billing</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk offers the following plans: Free, Pro, Platinum, Student, and Professional.
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Paid plans are billed monthly or annually via Stripe</li>
            <li>Plan features and usage limits are defined per plan and subject to change with notice</li>
            <li>Feature usage limits (e.g. CV toolkit uses per day, voice input minutes per month) reset on a rolling basis</li>
            <li>Unused allowances do not carry over between periods</li>
            <li>Refunds are subject to our Refund Policy</li>
          </ul>
          <p className="mt-2 text-muted-foreground font-medium mt-3">Student Plan eligibility:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>The Student plan is available only to users registered with a recognised academic email address (e.g. .ac.uk, .edu)</li>
            <li>Eligibility is verified automatically based on your account email domain</li>
            <li>Subscribing to the Student plan with a non-academic email, or continuing a Student subscription after losing academic status, constitutes a breach of these Terms</li>
            <li>We reserve the right to revoke the Student plan and move affected accounts to an appropriate plan if misuse is detected</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">10. Schedule Reminders</h2>
          <p className="mt-2 text-muted-foreground">If enabled, RealTalk may send reminder emails based on your configured schedule.</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>timing is controlled by user settings</li>
            <li>delivery may use Gmail or platform email systems</li>
            <li>reminders can be disabled at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">10a. Location-Based Features</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk may offer optional country-aware responses to provide more relevant links and regional guidance.
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Location context may be derived from GPS permission, IP-based lookup fallback, locale inference, or manual country selection</li>
            <li>Location lookups depend on third-party services and network availability</li>
            <li>Location results may be approximate and are not guaranteed to be accurate</li>
            <li>You are responsible for reviewing location-based guidance before relying on it</li>
            <li>You can change or clear saved location context at any time in-app</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">11. Intellectual Property</h2>
          <p className="mt-2 text-muted-foreground">All platform content, branding, design, and features (including RealTime Neurons) are owned by RealTalk LTD.</p>
          <p className="mt-2 text-muted-foreground">You retain ownership of the content you submit.</p>
          <p className="mt-2 text-muted-foreground">
            By using RealTalk, you grant us a limited licence to store and process your content solely to provide the service.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">12. Data Rights</h2>
          <p className="mt-2 text-muted-foreground">You may:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>export your data</li>
            <li>review stored data</li>
            <li>permanently delete your account</li>
            <li>toggle vent chat sharing at any time</li>
          </ul>
          <p className="mt-2 text-muted-foreground">These options are available via the account data page.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base">13. Limitation of Liability</h2>
          <p className="mt-2 text-muted-foreground">RealTalk is provided "as is".</p>
          <p className="mt-2 text-muted-foreground">To the fullest extent permitted by law, we are not liable for:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>reliance on AI-generated content</li>
            <li>decisions made based on responses</li>
            <li>service interruptions or provider outages</li>
            <li>data loss, including browser-stored data</li>
            <li>indirect or consequential damages</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">14. Changes to These Terms</h2>
          <p className="mt-2 text-muted-foreground">
            We may update these Terms as the platform evolves.
          </p>
          <p className="mt-2 text-muted-foreground">
            Continued use of RealTalk after updates constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">15. Contact</h2>
          <p className="mt-2 text-muted-foreground">For questions about these Terms:</p>
          <p className="mt-2 text-muted-foreground">
            <strong>Email:</strong>{" "}
            <a
              href="mailto:realtalklimited@gmail.com"
              className="text-primary hover:underline"
            >
              realtalklimited@gmail.com
            </a>
          </p>
          <p className="mt-2 text-muted-foreground">Instagram: @userealtalk</p>
        </section>
      </div>
    </div>
  );
}
