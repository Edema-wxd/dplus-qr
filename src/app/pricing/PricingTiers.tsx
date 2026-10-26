"use client";

import Link from "next/link";
import { primaryButtonClass } from "@/components/controls";
import { PlanTiers } from "@/components/PlanTiers";
import type { Tier } from "@/lib/plan-tiers";

/**
 * The shared price table with a sign-up link on every card. Checkout needs an
 * account, so the public page sends everyone to create one; the billing page
 * is where a plan is actually chosen.
 */
export function PricingTiers({ tiers }: { tiers: Tier[] }) {
  return (
    <PlanTiers
      tiers={tiers}
      action={() => (
        <Link href="/auth/sign-up" className={`${primaryButtonClass} no-underline`}>
          Create an account
        </Link>
      )}
    />
  );
}
