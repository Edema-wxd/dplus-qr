import { cache } from "react";
import { resolveScope } from "@/lib/resolve-scope";
import { getEntitlement, type Entitlement } from "@/lib/entitlement";

/**
 * The entitlement of the account the dashboard is showing (the person's own,
 * or a team they are working in) for the shell, read once per
 * request however many shell pieces ask (the plan meter and the header's
 * upgrade button both do).
 *
 * `undefined` when there is nothing to show: signed out, or the read failed.
 * The shell's pieces are conveniences, so a failure renders nothing rather
 * than breaking the page around them.
 */
export const readEntitlement = cache(async (): Promise<Entitlement | null | undefined> => {
  try {
    const scope = await resolveScope();
    if (!scope) return undefined;
    return await getEntitlement(scope.accountId);
  } catch (error) {
    console.error("[dash] could not read plan usage", error);
    return undefined;
  }
});
