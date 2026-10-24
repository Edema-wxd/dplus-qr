"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/server";
import { cancelAtPeriodEnd, startCheckout } from "@/lib/checkout";

/**
 * Billing mutations.
 *
 * The session is re-read here rather than trusted from the page that rendered
 * the form: `proxy.ts` guards pages, not data, and a Server Action is an
 * endpoint anyone can post to. The plan slug is the only thing taken from the
 * form -- the account and its email come from the session and our own row, so
 * a tampered form cannot start a checkout against someone else's account.
 */
async function requireUserId(): Promise<string> {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  return session.user.id;
}

const planSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  // Slugs are ours, not user input in any real sense -- but this is a server
  // boundary, so it is validated like one.
  .regex(/^[a-z0-9-]+$/, "That is not a plan.");

export type CheckoutFormState = { error?: string };

export async function startCheckoutAction(
  _previous: CheckoutFormState,
  formData: FormData
): Promise<CheckoutFormState> {
  const userId = await requireUserId();

  const parsed = planSlugSchema.safeParse(formData.get("plan"));
  if (!parsed.success) {
    return { error: "Choose a plan to continue." };
  }

  let result;
  try {
    result = await startCheckout({ userId, planSlug: parsed.data });
  } catch (error) {
    // A Paystack outage is not the customer's fault and must not look like
    // their mistake, nor leave them staring at a dead button.
    console.error("[billing] could not start checkout", error);
    return {
      error: "We could not reach our payment provider just now. Please try again.",
    };
  }

  if (!result.ok) return { error: result.reason };

  // Outside the try: `redirect` throws by design, and catching it would turn a
  // successful checkout into the error above.
  redirect(result.url);
}

export type CancelFormState = { error?: string; done?: boolean };

export async function cancelPlanAction(
  _previous: CancelFormState,
  _formData: FormData
): Promise<CancelFormState> {
  const userId = await requireUserId();

  const result = await cancelAtPeriodEnd(userId);
  if (!result.ok) return { error: result.reason };

  // The page re-reads the subscription, so the flag has to be visible to it.
  revalidatePath("/billing");
  return { done: true };
}
