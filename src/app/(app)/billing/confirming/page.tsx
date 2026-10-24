import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getBillingState } from "@/lib/checkout";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { DashShell } from "../../app/DashShell";
import { Poller } from "./Poller";

export const metadata: Metadata = { title: "Confirming your payment" };

export const instant = false;

/**
 * Where Paystack returns the customer.
 *
 * This page proves nothing. The browser arriving here means the customer
 * finished the Paystack form, not that the money moved -- migration 004 makes
 * the webhook the only writer of subscription status, so all this does is read
 * our own row and wait for it to change.
 *
 * Someone who closes the tab still gets their plan; the webhook does not care
 * whether anyone is watching.
 */
export default async function ConfirmingPage() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  const state = await getBillingState(user.id);

  return (
    <DashShell heading={state.paidAndActive ? "Payment confirmed" : "Confirming your payment"}>
      <div className="max-w-xl space-y-4">
        {state.paidAndActive ? (
          <>
            <p>
              Your {state.planName} plan is active. Your codes are live and will
              keep working.
            </p>
            <p>
              <Link className="underline" href="/app">
                Go to your codes
              </Link>
            </p>
          </>
        ) : (
          <>
            <p aria-live="polite">
              We are waiting for our payment provider to confirm the charge. This
              usually takes a few seconds.
            </p>
            <p className="text-sm text-[var(--paper-soft)]">
              You do not need to stay on this page. We record payments from the
              provider directly, so your plan will activate either way.
            </p>
            <Poller done={state.paidAndActive} />
            <p className="text-sm text-[var(--paper-soft)]">
              Charged but still waiting after a few minutes? Email{" "}
              <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </>
        )}
      </div>
    </DashShell>
  );
}
