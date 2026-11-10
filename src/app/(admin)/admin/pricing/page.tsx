import type { Metadata } from "next";
import { listAllPlans } from "@/lib/plans";
import { tierKey } from "@/lib/plan-tiers";
import { getPricingContent } from "@/lib/site-content";
import { audit, requireStaff } from "../guard";
import { AdminShell } from "../AdminShell";
import { PricingForm } from "./PricingForm";

export const metadata: Metadata = { title: "Pricing page" };
export const instant = false;

/**
 * The words on the public pricing page: headline, plan highlight, card
 * button and taglines, the billing points (which are also the Terms' clauses)
 * and extra questions. Prices and limits are the plans' own (Admin, Plans).
 */
export default async function AdminPricing() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/pricing" });

  const [content, plans] = await Promise.all([getPricingContent(), listAllPlans()]);

  // One entry per tier, named by its monthly row where there is one.
  const tiers = new Map<string, string>();
  for (const plan of plans) {
    if (plan.amountKobo <= 0) continue;
    const key = tierKey(plan.slug);
    if (!tiers.has(key) || plan.interval === "monthly") tiers.set(key, plan.name);
  }

  return (
    <AdminShell
      heading="Pricing page"
      current="/admin/pricing"
      meta="The words on the public pricing page. Saving changes it at once, along with the matching clauses of the Terms."
    >
      <PricingForm
        content={content}
        tiers={[...tiers].map(([key, name]) => ({ key, name }))}
      />
    </AdminShell>
  );
}
