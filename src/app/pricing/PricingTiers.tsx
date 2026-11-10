"use client";

import Link from "next/link";
import { primaryButtonClass } from "@/components/controls";
import { PlanTiers } from "@/components/PlanTiers";
import type { Tier } from "@/lib/plan-tiers";
import type { PricingContent } from "@/lib/pricing-content";

/**
 * The shared price table with a sign-up link on every card. Checkout needs an
 * account, so the public page sends everyone to create one; the billing page
 * is where a plan is actually chosen.
 */
export function PricingTiers({
  tiers,
  content,
}: {
  tiers: Tier[];
  content: Pick<PricingContent, "ctaLabel" | "featuredTier" | "featuredLabel" | "taglines">;
}) {
  return (
    <PlanTiers
      tiers={tiers}
      featured={content.featuredTier || null}
      featuredLabel={content.featuredLabel}
      taglines={content.taglines}
      action={() => (
        <Link href="/auth/sign-up" className={`${primaryButtonClass} no-underline`}>
          {content.ctaLabel}
        </Link>
      )}
    />
  );
}
