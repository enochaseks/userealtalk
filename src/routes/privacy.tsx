import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

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
        Last updated: April 19, 2026
      </p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">

        <section>
          <h2 className="font-semibold text-base">What we collect</h2>
          <p className="mt-2 text-muted-foreground">
            We store account details (email address), your chat conversations, saved plans, comfort boundary
            settings, profile preference notes extracted from your chats, optional weekly insight data, and
            any profile information you choose to provide (such as a display name or avatar).
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">RealTime Neurons — brain growth card</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk includes a visual feature called <strong>RealTime Neurons</strong> — an animated brain card
            on your profile's Insights tab. This card reflects how well RealTalk has learned about you across
            eight dimensions: interests, communication style, life context, emotional patterns, positive
            response signals, comfort boundaries, weekly insight depth, and plan engagement.
          </p>
          <p className="mt-2 text-muted-foreground">
            Brain growth progress is stored in your browser's <strong>localStorage</strong> under the key
            <code className="mx-1 px-1 rounded bg-muted text-xs font-mono">brain_growth_v2_&#123;userId&#125;</code>.
            This data stays on your device — it is not synced to our servers. Clearing your browser data or
            switching browsers will reset the displayed growth level. The underlying profile data that drives
            the neurons (interests, style, etc.) is always stored server-side in your account.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Profile learning (automatic)</h2>
          <p className="mt-2 text-muted-foreground">
            After each conversation, RealTalk automatically extracts preference signals from your recent
            messages using an AI model. This runs silently in the background and updates stored fields
            including: interests, communication style, life context, emotional tone, positive response
            signals, and comfort boundaries. This data is used solely to personalise future conversations
            and is linked to your account in our database.
          </p>
          <p className="mt-2 text-muted-foreground">
            You can review and delete your stored profile data at any time via the account data page.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Weekly insights</h2>
          <p className="mt-2 text-muted-foreground">
            If weekly insights are enabled in your profile settings, RealTalk generates a structured
            summary of emotional trends, thought patterns, and interaction quality across your recent
            chats each week. These insights are stored in your account and can optionally be emailed
            to your Gmail address. You can disable this feature at any time in your profile settings.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">AI providers</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk uses a cascade of AI providers to power chat responses, profile learning, and weekly
            insights. The primary provider is <strong>Mistral AI</strong>. If Mistral is unavailable,
            requests fall back to <strong>Google Gemini</strong>, then to <strong>Cloudflare Workers AI
            (Llama 3.1 8B)</strong>. Your messages are sent to whichever provider handles your request.
            All providers process data under their own privacy policies. We do not share your identity
            with these providers — only the text content of the current request is transmitted.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">How Gmail access works</h2>
          <p className="mt-2 text-muted-foreground">
            Gmail access is entirely optional. If you choose to connect Google, RealTalk requests the Gmail
            send scope only — used to send emails you explicitly initiate from within the app. RealTalk
            does not read, index, or store your Gmail messages. Gmail connection is not required for any
            core feature.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">How we use your data</h2>
          <p className="mt-2 text-muted-foreground">
            Your data is used to: provide and improve the chat experience; personalise responses using
            learned preferences; generate plans and weekly insight summaries; display your RealTime Neurons
            brain growth card; and send optional weekly insight emails. We do not sell your data or use
            it for advertising.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Data retention</h2>
          <p className="mt-2 text-muted-foreground">
            Your data is retained for as long as your account exists. You may export or delete your data
            at any time. On account deletion, all server-side data (chats, plans, insights, profile
            preferences) is permanently removed. Browser localStorage data (such as brain growth progress)
            must be cleared manually from your browser settings.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Your choices</h2>
          <p className="mt-2 text-muted-foreground">
            You can export your data, review what is stored, and permanently delete your account from
            the account data page. You can disable weekly insights and email delivery at any time in
            your profile settings.
          </p>
          <div className="mt-2">
            <Link to="/account-data" className="text-primary hover:underline">
              Go to account &amp; data export
            </Link>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-base">Contact</h2>
          <p className="mt-2 text-muted-foreground">
            For privacy questions or data requests, message us on Instagram{" "}
            <a href="https://instagram.com/userealtalk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              @userealtalk
            </a>.
          </p>
        </section>

      </div>
    </div>
  );
}
