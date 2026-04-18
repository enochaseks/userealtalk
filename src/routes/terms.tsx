import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

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
      <p className="mt-3 text-sm text-muted-foreground">Last updated: April 18, 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="font-semibold text-base">Service scope</h2>
          <p className="mt-2 text-muted-foreground">
            RealTalk provides AI-assisted thinking, planning, and writing support. It is not legal, medical,
            or emergency advice.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Acceptable use</h2>
          <p className="mt-2 text-muted-foreground">
            You agree not to misuse the service, attempt unauthorized access, or use the platform for harmful,
            unlawful, or abusive activity.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Gmail integration</h2>
          <p className="mt-2 text-muted-foreground">
            If you connect Google, you authorize RealTalk to send Gmail messages on your behalf only when you
            initiate a send action. Gmail connection is optional.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Data rights</h2>
          <p className="mt-2 text-muted-foreground">
            You can export your data and request account deletion from the account data page.
          </p>
          <div className="mt-2">
            <Link to="/account-data" className="text-primary hover:underline">
              Go to account & data export
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
