import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/refund-policy")({
  component: RefundPolicyPage,
  head: () => ({ meta: [{ title: "Refund & Cancellation Policy — RealTalk" }] }),
});

function RefundPolicyPage() {
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
      <h1 className="font-serif text-3xl tracking-tight">Refund &amp; Cancellation Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: April 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="font-semibold text-base">1. Payments &amp; Billing</h2>
          <p className="mt-2 text-muted-foreground">
            All RealTalk subscriptions are processed and managed by <strong>Stripe</strong>, a third-party payment provider. RealTalk does not store or handle your card details directly.
          </p>
          <p className="mt-2 text-muted-foreground">
            By subscribing, you agree to Stripe's terms of service and privacy policy in addition to ours.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">2. Cancellation</h2>
          <p className="mt-2 text-muted-foreground">
            You can cancel your Pro or Platinum subscription at any time through the Stripe billing portal.
          </p>
          <p className="mt-2 text-muted-foreground">
            To cancel, go to <strong>Settings → Subscription → Billing portal</strong>. Your subscription will stay active until the end of the current billing period and will not renew. Your account will then revert to the Free plan automatically.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">3. Refunds</h2>
          <p className="mt-2 text-muted-foreground">
            Because payments are processed entirely through Stripe, refunds are subject to <strong>Stripe's refund and dispute policies</strong>. RealTalk does not issue refunds directly.
          </p>
          <p className="mt-2 text-muted-foreground">
            If you believe you have been charged in error or wish to dispute a charge, you should:
          </p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Contact your card provider or bank to raise a dispute.</li>
            <li>Contact Stripe support directly at <strong>stripe.com/support</strong>.</li>
            <li>Email us at realtalklimited@gmail.com and we will assist where we can, but we are not able to issue refunds outside of Stripe's process.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-base">4. Free Plan</h2>
          <p className="mt-2 text-muted-foreground">
            The Free plan has no payment associated with it. You can stop using RealTalk at any time and request account deletion from Settings.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base">5. Contact</h2>
          <p className="mt-2 text-muted-foreground">For billing or cancellation questions:</p>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">
            <li>Email: <a href="mailto:realtalklimited@gmail.com" className="text-primary hover:underline">realtalklimited@gmail.com</a></li>
            <li>Stripe support: stripe.com/support</li>
          </ul>

        </section>
      </div>
    </div>
  );
}
