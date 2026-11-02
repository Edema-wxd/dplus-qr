import { cache } from "react";
import { auth } from "@/lib/auth/server";
import { getEntitlement, type Entitlement } from "@/lib/entitlement";

/**
 * The signed-in account's entitlement for the dashboard shell, read once per
 * request however many shell pieces ask (the plan meter and the header's
 * upgrade button both do).
 *
 * `undefined` when there is nothing to show: signed out, or the read failed.
 * The shell's pieces are conveniences, so a failure renders nothing rather
 * than breaking the page around them.
 */
export const readEntitlement = cache(async (): Promise<Entitlement | null | undefined> => {
  try {
    const { data: session } = await auth.getSession();
    if (!session?.user) return undefined;
    return await getEntitlement(session.user.id);
  } catch (error) {
    console.error("[dash] could not read plan usage", error);
    return undefined;
  }
});
