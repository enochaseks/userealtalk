import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "Privacy Policy — RealTalk" }] }),
});

function PrivacyPage() {
  return (
    <div className="flex-1 max-w-3xl w-full mx-auto px-5 py-10">
      <h1 className="font-serif text-3xl tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated: April 18, 2026
      </p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="font-semibold text-base">What we collect</h2>
          <p className="mt-2 text-muted-foreground">
            We store account details (such as email), your chats, saved plans, optional weekly insight settings,
            and profile details you choose to provide.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">How Gmail access works</h2>
          <p className="mt-2 text-muted-foreground">
            Gmail access is optional. If you connect Google, RealTalk requests Gmail send scope only to send email
            you explicitly choose to send. RealTalk does not require Gmail access for normal chat use.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">How we use data</h2>
          <p className="mt-2 text-muted-foreground">
            Data is used to provide chat features, save your history, generate plans, and optionally produce weekly
            insights when enabled in your settings.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">Your choices</h2>
          <p className="mt-2 text-muted-foreground">
            You can review account data options, export your data, and request account deletion from the
            account data page.
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
