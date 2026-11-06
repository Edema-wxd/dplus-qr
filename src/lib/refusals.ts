import type { Entitlement } from "@/lib/entitlement";
import { listPublicPlans } from "@/lib/plans";
import { featureOffer, offerRefusal, type Gate } from "@/lib/upgrade-offers";

/**
 * The sentence a Server Action or save returns when a plan gate says no.
 *
 * The `can*` gates in `entitlement.ts` are pure and answer yes or no. Naming
 * the plan that unlocks the feature means reading the plan rows, so it happens
 * here, at the point a refusal is sent, and never in copy: staff move flags
 * between plans from `/admin/plans` and a written-in "Pro and Business" goes
 * stale. The wording itself is `offerRefusal()`, which is pure and tested.
 */
export async function featureRefusal(
  gate: Exclude<Gate, "history" | "codes">,
  entitlement: Entitlement | null,
  instead?: string
): Promise<string> {
  return offerRefusal(featureOffer(gate, entitlement, await listPublicPlans()), instead);
}
