"use client";

import { useState } from "react";
import type { Tier, TierPrice } from "@/lib/plan-tiers";

type Interval = "monthly" | "annual";

/**
 * The price table, shared by the public pricing page and the billing page so
 * the two can never show a tier differently.
 *
 * One switch for the whole table rather than two prices per card: a customer
 * compares tiers at one interval, and six prices on three cards reads as a
 * puzzle. What each card's button does is the caller's business -- a sign-up
 * link on the public page, a checkout submit on the billing page -- so it is
 * passed in as `action`.
 *
 * Reads only the paper tokens, which both the `.dash` and `.legal` surfaces
 * define.
 */
export function PlanTiers({
  tiers,
  action,
  initialInterval = "monthly",
}: {
  tiers: Tier[];
  action: (price: TierPrice, tier: Tier) => React.ReactNode;
  initialInterval?: Interval;
}) {
  const [interval, setInterval] = useState<Interval>(initialInterval);
  const hasAnnual = tiers.some((tier) => tier.annual);
  const monthsFree = Math.max(0, ...tiers.map((tier) => tier.annual?.monthsFree ?? 0));

  return (
    <div>
      {hasAnnual ? (
        <div
          role="radiogroup"
          aria-label="Billing interval"
          className="mb-5 inline-flex rounded-md border border-[var(--paper-rule)] bg-white p-0.5 text-sm"
        >
          {(["monthly", "annual"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={interval === value}
              onClick={() => setInterval(value)}
              className={`rounded px-3.5 py-1.5 transition-colors duration-150 ${
                interval === value
                  ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                  : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
              }`}
            >
              {value === "monthly" ? "Monthly" : "Annually"}
              {value === "annual" && monthsFree > 0 ? (
                <span className={interval === value ? "opacity-75" : ""}>
                  {" "}
                  · {monthsFree} months free
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          // A tier missing the chosen interval falls back to the one it has,
          // so a card never renders without a price.
          const price =
            (interval === "annual" ? tier.annual : tier.monthly) ?? tier.monthly ?? tier.annual;
          if (!price) return null;
          const annual = price === tier.annual;

          return (
            <li
              key={tier.key}
              className="flex flex-col rounded-lg border border-[var(--paper-rule)] bg-white p-5"
            >
              <h3 className="text-base font-medium">{tier.name}</h3>
              <p className="mt-2 text-[1.75rem] leading-none tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
                ₦{price.priceNgn}
                <span className="text-sm tracking-normal text-[var(--paper-soft)]">
                  {annual ? " / year" : " / month"}
                </span>
              </p>
              <p className="mt-1.5 min-h-[1.25rem] text-xs text-[var(--paper-soft)]">
                {annual
                  ? `₦${price.perMonthNgn} a month${price.monthsFree > 0 ? `, ${price.monthsFree} months free` : ""}`
                  : null}
              </p>

              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-[var(--paper-soft)]">
                {tier.features.map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-[0.6em] h-1 w-2 shrink-0 rounded-full bg-[var(--paper-rule)]"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-col">{action(price, tier)}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
