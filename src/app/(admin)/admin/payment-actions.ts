"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { retryPaystackEvent } from "@/lib/billing";
import { recordChange, staffForAction } from "./guard";
import type { AdminFormState } from "./actions";

/**
 * Try an unapplied Paystack event again (DECISIONS.md, 11 November 2026). For
 * after staff fix what deferred it -- connecting a plan, say -- or for one
 * whose attempts all failed. It goes through the same claim and checks as a
 * delivery, so a retry can never apply an event twice or activate a plan the
 * webhook would have refused.
 */
const REFUSED: AdminFormState = { error: "Only staff can do that." };

export async function retryPaymentEventAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const id = z.coerce.number().int().positive().safeParse(form.get("eventId"));
  if (!id.success) return { error: "That event does not exist." };

  let outcome: Awaited<ReturnType<typeof retryPaystackEvent>>;
  try {
    outcome = await retryPaystackEvent(String(id.data));
  } catch (error) {
    console.error("[admin] Paystack event retry failed", id.data, error);
    return { error: "It failed again. Nothing was changed; try again in a minute." };
  }

  if ("followUp" in outcome && outcome.followUp) after(outcome.followUp);
  await recordChange(staff, "payment_event.retry", "payment_event", String(id.data), { outcome: outcome.kind });
  revalidatePath("/admin");

  switch (outcome.kind) {
    case "missing":
      return { error: "That event does not exist." };
    case "duplicate":
      return { notice: "Already applied." };
    case "busy":
      return { error: "It is being applied right now. Reload in a minute." };
    case "applied":
      return { notice: "Applied." };
    case "ignored":
      return { notice: `Done, nothing to change: ${outcome.why}.` };
    case "deferred":
      return { error: `Still cannot be applied: ${outcome.why}.` };
  }
}
