import { createHmac, timingSafeEqual } from "node:crypto";
import { required } from "@/lib/env";

/**
 * Paystack, the money side.
 *
 * Nothing here is constructed at module scope and the secret key is read
 * through `required()` at the point of use, so `next build` -- which evaluates
 * route modules to collect their configuration -- never needs a credential.
 *
 * Amounts are always kobo integers. Naira never appears as a float in this
 * codebase: 0.1 + 0.2 is not 0.3, and that is not a rounding error anyone wants
 * in a charge.
 */
const API = "https://api.paystack.co";

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${required("PAYSTACK_SECRET_KEY")}`,
      "content-type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    // Money calls are never cached, whatever the framework's default becomes.
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: T }
    | null;

  if (!response.ok || !payload?.status) {
    throw new PaystackError(
      payload?.message ?? `Paystack ${path} failed with ${response.status}`,
      response.status,
      payload
    );
  }

  return payload.data as T;
}

/**
 * Verify `x-paystack-signature`: HMAC SHA-512 of the **raw** body with the
 * secret key.
 *
 * The raw body matters. `JSON.parse` then `JSON.stringify` does not round-trip
 * byte for byte -- key order and whitespace both move -- so a signature checked
 * against a re-serialised body fails for perfectly good deliveries. The caller
 * reads the text once and passes it here before parsing anything.
 *
 * Compared with `timingSafeEqual`, which needs both sides the same length, so
 * the length is checked first and a wrong-length header is simply rejected.
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", required("PAYSTACK_SECRET_KEY"))
    .update(rawBody, "utf8")
    .digest("hex");

  if (signature.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
}

export type InitializedTransaction = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

/**
 * Start a checkout for a plan.
 *
 * `amount` is required by the API even with a plan attached, and Paystack then
 * charges the plan's own amount -- so it is passed as the plan amount to keep
 * the two from disagreeing in the Paystack dashboard.
 *
 * `metadata.user_id` is how a webhook arriving later is tied back to an
 * account. The customer email alone is not enough: Neon Auth lets an email
 * change, and the charge would then belong to nobody.
 */
export function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  planCode: string;
  userId: string;
  callbackUrl: string;
}): Promise<InitializedTransaction> {
  return call<InitializedTransaction>("/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amountKobo,
      plan: input.planCode,
      callback_url: input.callbackUrl,
      metadata: { user_id: input.userId },
    },
  });
}

export type PaystackSubscription = {
  subscription_code: string;
  email_token: string;
  status: string;
  next_payment_date: string | null;
  plan: { plan_code: string } | null;
};

/** Read a subscription back, for reconciliation rather than the hot path. */
export function fetchSubscription(code: string): Promise<PaystackSubscription> {
  return call<PaystackSubscription>(`/subscription/${encodeURIComponent(code)}`);
}

/**
 * Stop a subscription renewing.
 *
 * Paystack has no plan swap, so an upgrade is this plus a fresh checkout --
 * which is also why `email_token` is stored on our row: disabling needs it, and
 * it is not derivable from anything else we hold.
 */
export function disableSubscription(code: string, emailToken: string): Promise<unknown> {
  return call("/subscription/disable", {
    method: "POST",
    body: { code, token: emailToken },
  });
}
