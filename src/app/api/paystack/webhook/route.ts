import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Paystack webhook. Phase 3 fills in the event handling; the signature check
 * and the idempotency guard are written now because they are the parts that
 * must never be bolted on afterwards.
 *
 * Webhooks are the only source of truth for payment state. Nothing in the
 * browser return flow may set a subscription to active.
 */
export async function POST(request: Request) {
  const secret = env().PAYSTACK_SECRET_KEY;
  if (!secret) {
    console.error("[paystack] webhook received but no secret configured");
    return new Response("not configured", { status: 503 });
  }

  // The raw body is required: re-serialising parsed JSON changes the bytes and
  // breaks the HMAC.
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!signature || !verify(raw, signature, secret)) {
    console.error("[paystack] signature verification failed");
    return new Response("invalid signature", { status: 401 });
  }

  // TODO(phase-3): insert into qr_payment_events keyed on the event id for
  // idempotency, return 200 immediately, then process:
  //   subscription.create, charge.success, invoice.payment_failed,
  //   subscription.not_renew, subscription.disable
  return Response.json({ received: true });
}

function verify(raw: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
