"use client";

import { useActionState } from "react";
import { startCheckoutAction, type CheckoutFormState } from "./actions";
import { primaryButtonClass, secondaryButtonClass } from "../app/DashShell";

export type PlanOption = {
  slug: string;
  name: string;
  priceNgn: string;
  interval: "monthly" | "annually";
  maxCodes: number;
  historyLabel: string;
  csvExport: boolean;
  customLinks: boolean;
  isCurrent: boolean;
};

/**
 * The plan chooser.
 *
 * One form for the whole list rather than one per card, so the pending state
 * is shared: with a form each, every button would have to track its own
 * pending flag and a second click during the redirect could start a second
 * checkout.
 *
 * The cards and buttons use the shapes `DashShell` exports, so choosing a plan
 * looks like the rest of the signed-in surface rather than like a page from
 * another product: same radius, same ink, same pressed response.
 */
export function PlanCards({ plans }: { plans: PlanOption[] }) {
  const [state, action, pending] = useActionState<CheckoutFormState, FormData>(
    startCheckoutAction,
    {}
  );

  return (
    <form action={action}>
      {state.error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <li
            key={plan.slug}
            className="flex flex-col rounded-lg border border-[var(--paper-rule)] bg-white p-5"
          >
            <h3 className="text-base font-medium">{plan.name}</h3>
            <p className="mt-1 text-2xl">
              ₦{plan.priceNgn}
              <span className="text-sm text-[var(--paper-soft)]">
                {plan.interval === "annually" ? " / year" : " / month"}
              </span>
            </p>
            {plan.interval === "annually" ? (
              <p className="mt-0.5 text-xs text-[var(--paper-soft)]">
                Two months free
              </p>
            ) : null}

            <ul className="mt-4 flex-1 space-y-1 text-sm text-[var(--paper-soft)]">
              <li>{plan.maxCodes} dynamic codes</li>
              <li>{plan.historyLabel} of scan history</li>
              <li>{plan.csvExport ? "CSV export" : "No CSV export"}</li>
              {plan.customLinks ? <li>Custom links, like /yourname</li> : null}
            </ul>

            <button
              type="submit"
              name="plan"
              value={plan.slug}
              disabled={pending || plan.isCurrent}
              className={`mt-5 ${
                plan.isCurrent ? secondaryButtonClass : primaryButtonClass
              }`}
            >
              {plan.isCurrent ? "Current plan" : pending ? "Starting…" : "Choose"}
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}
