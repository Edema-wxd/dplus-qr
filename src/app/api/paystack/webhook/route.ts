import { after } from "next/server";
import { env } from "@/lib/env";
import { reportError } from "@/lib/error-alerts";
import { verifySignature } from "@/lib/paystack";
import { applyPaystackEvent } from "@/lib/billing";

/**
 * Paystack webhook. The only source of truth for payment state.
 *
 * Three rules, in this order:
 *
 * 1. Verify `x-paystack-signature` against the RAW body before reading it.
 *    `request.text()` once, verify, and only then parse -- re-serialising JSON
 *    changes the bytes and would fail a signature that is perfectly valid.
 * 2. Apply the event before answering, and answer by what happened. Paystack
 *    re-delivers anything that does not get a 200, so a failure answers 500
 *    and the event comes back. Until 11 November 2026 this route answered 200
 *    first and applied the event in `after()`, so a database cold start lost a
 *    payment for good: Paystack had its 200, and nothing else retried
 *    (security audit, M2).
 * 3. Only the money waits. The claim on the event row (`applyPaystackEvent`)
 *    makes a re-delivery that overlaps a slow first attempt answer 503 rather
 *    than apply the event twice, and everything after the commit -- stopping
 *    a replaced subscription, purging cached destinations, customer email,
 *    staff alerts -- runs in `after()`.
 *
 * A deferred event answers 200: it is stored with its reason and needs a
 * person, and a re-delivery would only defer it again. Staff retry it from
 * the admin once the cause is fixed.
 *
 * `no-store` because a cached webhook response is meaningless, and this route
 * reads a request API (headers), so Cache Components does not try to evaluate
 * it at build time.
 */
function answer(body: string, status: number): Response {
  return new Response(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  // A missing key is a deployment fault, not a bad delivery. 503 so Paystack
  // retries and the event survives long enough for someone to set it.
  if (!env().PAYSTACK_SECRET_KEY) {
    console.error("[paystack] delivery received but no secret is configured");
    return answer("not configured", 503);
  }

  if (!verifySignature(rawBody, signature)) {
    // No detail: an attacker probing the endpoint learns nothing from this.
    console.warn("[paystack] rejected a delivery with a bad signature");
    return answer("invalid signature", 401);
  }

  try {
    const outcome = await applyPaystackEvent(rawBody);
    if (outcome.followUp) after(outcome.followUp);

    if (outcome.kind === "busy") {
      // Another attempt at this event is still running. Paystack tries again
      // later, by when it is either applied (and then a duplicate) or free.
      return answer("in progress", 503);
    }
    if (outcome.kind !== "deferred") console.info("[paystack]", outcome.kind, outcome.eventKey);
    return answer("ok", 200);
  } catch (error) {
    console.error("[paystack] processing failed", error);
    after(() =>
      reportError(error, { where: "Paystack webhook", method: "POST", path: "/api/paystack/webhook" })
    );
    return answer("not applied", 500);
  }
}
