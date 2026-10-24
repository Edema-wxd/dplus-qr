import { after } from "next/server";
import { env } from "@/lib/env";
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
 * 2. Answer 200 quickly and process after. Paystack retries on a slow or
 *    failed response, and a retry of work already half-done is how a charge
 *    gets applied twice. The idempotency key makes a retry harmless anyway,
 *    but not making it wait is cheaper for both sides.
 * 3. Never 500 on our own bug. A 500 makes Paystack retry something that will
 *    fail identically; the event is already recorded, so it can be replayed
 *    from the table deliberately instead.
 *
 * `no-store` because a cached webhook response is meaningless, and this route
 * reads a request API (headers), so Cache Components does not try to evaluate
 * it at build time.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  // A missing key is a deployment fault, not a bad delivery. 503 rather than
  // 500 because Paystack retries a 503 -- so the event survives long enough
  // for someone to set the variable, instead of being lost to a hard failure.
  if (!env().PAYSTACK_SECRET_KEY) {
    console.error("[paystack] delivery received but no secret is configured");
    return new Response("not configured", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  if (!verifySignature(rawBody, signature)) {
    // No detail: an attacker probing the endpoint learns nothing from this.
    console.warn("[paystack] rejected a delivery with a bad signature");
    return new Response("invalid signature", {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }

  after(async () => {
    try {
      const outcome = await applyPaystackEvent(rawBody);
      if (outcome.kind === "deferred") {
        // Needs a human: the event is stored with its reason in `error`.
        console.error("[paystack] deferred", outcome.eventKey, outcome.why);
      } else {
        console.info("[paystack]", outcome.kind, outcome.eventKey);
      }
    } catch (error) {
      console.error("[paystack] processing failed", error);
    }
  });

  return new Response("ok", {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
