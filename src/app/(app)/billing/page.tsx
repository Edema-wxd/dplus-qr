import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { getBillingState } from "@/lib/checkout";
import { listPurchasablePlans } from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { DashShell } from "../app/DashShell";
import { PlanCards, type PlanOption } from "./PlanCards";
import { CancelPlan } from "./CancelPlan";

export const metadata: Metadata = { title: "Plan and billing" };

// Entirely the signed-in user's own state, with no useful static shell to
// stream around, so it blocks rather than wrapping everything in Suspense.
export const instant = false;

function historyLabel(days: number): string {
  if (days >= 730) return "24 months";
  if (days >= 365) return "12 months";
  return `${days} days`;
}

/** Kobo to a naira string. Integers throughout; naira is never a float here. */
function naira(kobo: number): string {
  return Math.round(kobo / 100).toLocaleString("en-NG");
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default async function BillingPage() {
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
    listPurchasablePlans(),
  ]);

  const options: PlanOption[] = plans.map((plan) => ({
    slug: plan.slug,
    name: plan.name,
    priceNgn: naira(plan.amountKobo),
    interval: plan.interval,
    maxCodes: plan.maxCodes,
    historyLabel: historyLabel(plan.historyDays),
    csvExport: plan.features.csv_export === true,
    isCurrent: state.planSlug === plan.slug,
  }));

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
            <Row label="Status" value={state.status ?? "—"} />
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

          <div className="mt-4">
            {options.length > 0 ? (
              <PlanCards plans={options} />
            ) : (
              /*
                `listPurchasablePlans()` requires a Paystack plan code, so this
                is what shows before `npm run plans:sync` has attached them.
                Honest about it rather than rendering buttons that cannot work.
              */
              <p className="text-sm text-[var(--paper-soft)]">
                Paid plans are not open for self-service checkout yet. Email{" "}
                <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>{" "}
                and we will set your account up directly.
              </p>
            )}
          </div>
        </section>
      </div>
    </DashShell>
  );
}
