"use client";

import { useActionState } from "react";
import { startCheckoutAction, type CheckoutFormState } from "./actions";
import { primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { PlanTiers } from "@/components/PlanTiers";
import type { Tier } from "@/lib/plan-tiers";

/**
 * The plan chooser: the shared price table, with each card's button posting a
 * checkout.
 *
 * One form for the whole table rather than one per card, so the pending state
 * is shared: with a form each, every button would have to track its own
 * pending flag and a second click during the redirect could start a second
 * checkout.
 */
export function PlanCards({
  tiers,
  currentSlug,
}: {
  tiers: Tier[];
  currentSlug: string | null;
}) {
  const [state, action, pending] = useActionState<CheckoutFormState, FormData>(
    startCheckoutAction,
    {}
  );

  // Open on the interval the customer already pays at, so "Current plan" is on
  // screen rather than behind the switch.
  const onAnnual = tiers.some((tier) => tier.annual?.slug === currentSlug);

  return (
    <form action={action}>
      {state.error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}

      <PlanTiers
        tiers={tiers}
        initialInterval={onAnnual ? "annual" : "monthly"}
        action={(price) => {
          const isCurrent = price.slug === currentSlug;
          return (
            <button
              type="submit"
              name="plan"
              value={price.slug}
              disabled={pending || isCurrent || !price.purchasable}
              className={isCurrent || !price.purchasable ? secondaryButtonClass : primaryButtonClass}
            >
              {isCurrent
                ? "Current plan"
                : !price.purchasable
                  ? "Not available online yet"
                  : pending
                    ? "Starting…"
                    : "Choose"}
            </button>
          );
        }}
      />
    </form>
  );
}
