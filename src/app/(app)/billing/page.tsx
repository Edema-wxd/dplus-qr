import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { getBillingState } from "@/lib/checkout";
import { listPublicPlans } from "@/lib/plans";
import { groupTiers } from "@/lib/plan-tiers";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { DashShell } from "../app/DashShell";
import { PlanCards } from "./PlanCards";
import { CancelPlan } from "./CancelPlan";

export const metadata: Metadata = { title: "Plan and billing" };

// Entirely the signed-in user's own state, with no useful static shell to
// stream around, so it blocks rather than wrapping everything in Suspense.
export const instant = false;

/**
 * How a subscription status is said out loud.
 *
 * The column stores `active`, `past_due`, `non_renewing` and so on, which are
 * our words for our own state machine. Printing them raw asks a customer to
 * work out whether `past_due` means their codes have stopped -- and the answer
 * is on this page, so it may as well be the label.
 */
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  past_due: "Payment overdue",
  non_renewing: "Active, not renewing",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  paused: "Paused",
  incomplete: "Awaiting payment",
};

function statusLabel(status: string | null): string {
  if (!status) return "\u2014";
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

/** Paper tokens, like every other panel inside `DashShell`. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-[var(--paper-soft)]">
        {label}
      </dt>
      <dd className="text-sm text-[var(--paper-ink)]">{value}</dd>
    </div>
  );
}

export default async function BillingPage() {
  // Before the session read, not after: `auth` validates its env vars on
  // first use and throws when they are absent, so without this `next build`
  // tries to prerender the page and fails on a secret it should never need.
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  const profile = await ensureProfile({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  const [state, plans] = await Promise.all([
    getBillingState(profile.id),
    listPublicPlans(),
  ]);

  // The same tiers the public pricing page shows, from the same rows, so a
  // customer never meets one price there and another here.
  const tiers = groupTiers(plans);
  const anyPurchasable = tiers.some(
    (tier) => tier.monthly?.purchasable || tier.annual?.purchasable
  );

  return (
    <DashShell heading="Plan and billing">
      <div className="max-w-5xl space-y-10">
        <section aria-labelledby="current-heading">
          <h2
            id="current-heading"
            className="border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]"
          >
            Current plan
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Row label="Plan" value={state.planName ?? "No plan yet"} />
            <Row label="Status" value={statusLabel(state.status ?? null)} />
            <Row
              label="Renews"
              value={
                state.currentPeriodEnd
                  ? state.currentPeriodEnd.toLocaleDateString("en-NG")
                  : "—"
              }
            />
            {state.graceUntil ? (
              <Row
                label="Payment overdue — codes pause"
                value={state.graceUntil.toLocaleDateString("en-NG")}
              />
            ) : null}
          </dl>
          {state.cancelAtPeriodEnd ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">
              This plan is set to stop at the end of the current period. Your codes
              keep working until then, and nothing is ever deleted.
            </p>
          ) : state.planSlug && state.planSlug !== "free" ? (
            <div className="mt-4">
              <CancelPlan
                periodEndLabel={
                  state.currentPeriodEnd
                    ? state.currentPeriodEnd.toLocaleDateString("en-NG", {
                        dateStyle: "long",
                      })
                    : null
                }
              />
            </div>
          ) : null}
        </section>

        <section aria-labelledby="plans-heading">
          <h2
            id="plans-heading"
            className="border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]"
          >
            Plans
          </h2>

          {/*
            Stated before the charge, not after it. The refund position and the
            fact that a subscription renews itself are the two things a customer
            is entitled to know at the moment they choose a plan, and a payment
            provider's merchant review looks for exactly this line.
          */}
          <p className="mt-4 max-w-[62ch] text-xs leading-relaxed text-[var(--paper-soft)]">
            Choosing a plan starts a subscription that renews automatically until
            you cancel it. Payments are charged in advance and are not refundable;
            cancelling always runs to the end of the period you have paid for. See
            the{" "}
            <Link href="/terms" className="underline underline-offset-4">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              privacy policy
            </Link>
            .
          </p>

          {tiers.length > 0 ? (
            <div className="mt-6">
              <PlanCards tiers={tiers} currentSlug={state.planSlug} />
            </div>
          ) : null}

          {anyPurchasable ? null : (
            /*
              A plan is bought online only once `npm run plans:sync` has given
              it a Paystack code. Until then the prices still show, and this
              says how to get one rather than leaving dead buttons unexplained.
            */
            <p className="mt-4 text-sm text-[var(--paper-soft)]">
              Paid plans are not open for self-service checkout yet. Email{" "}
              <a
                className="text-[var(--paper-ink)] underline underline-offset-4"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              and we will set your account up directly.
            </p>
          )}
        </section>
      </div>
    </DashShell>
  );
}
