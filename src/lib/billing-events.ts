import { createHash } from "node:crypto";
import { z } from "zod";
import type { Plan } from "@/lib/plans";

/**
 * Reading a Paystack delivery and deciding what it means, with no database and
 * no network in sight.
 *
 * Split out from `billing.ts` so the part that is easy to get wrong -- which
 * event moves a subscription where, and what the next period end is -- can be
 * tested directly, at every boundary, without a Postgres or a Paystack.
 */

/** The five we act on. Anything else is logged and ignored, never an error. */
export const HANDLED_EVENTS = [
  "subscription.create",
  "charge.success",
  "invoice.payment_failed",
  "subscription.not_renew",
  "subscription.disable",
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

/**
 * Deliberately loose. Paystack sends far more than this and may add fields at
 * any time; rejecting an unknown field would turn a Paystack release into an
 * outage of our billing. Only what is read is described, and `passthrough`
 * keeps the rest for the `payload` column, which is the record of what actually
 * arrived.
 */
export const eventSchema = z
  .object({
    event: z.string(),
    data: z
      .object({
        id: z.union([z.number(), z.string()]).optional(),
        status: z.string().optional(),
        reference: z.string().optional(),
        paid_at: z.string().optional(),
        next_payment_date: z.string().nullish(),
        subscription_code: z.string().optional(),
        email_token: z.string().optional(),
        amount: z.number().optional(),
        plan: z
          .union([
            z.object({ plan_code: z.string().optional() }).passthrough(),
            z.string(),
            z.array(z.unknown()),
          ])
          .nullish(),
        customer: z
          .object({ email: z.string().optional(), customer_code: z.string().optional() })
          .passthrough()
          .optional(),
        metadata: z
          .object({ user_id: z.string().optional() })
          .passthrough()
          .nullish(),
      })
      .passthrough(),
  })
  .passthrough();

export type PaystackEvent = z.infer<typeof eventSchema>;

/**
 * The idempotency key for `qr_payment_events.event_key`.
 *
 * Paystack sends no delivery id, so it is built from the event name and the id
 * of the thing the event is about -- a transaction id for a charge, an invoice
 * id for a failure. Those are unique per occurrence, so a genuine renewal next
 * month gets its own key while a retry of *this* delivery collides and is
 * dropped.
 *
 * With no id at all, the body itself is the key. Two identical bodies are then
 * treated as the same event, which is the safe way round: replaying a charge is
 * far worse than missing a duplicate.
 */
export function eventKey(event: PaystackEvent, rawBody: string): string {
  const id = event.data?.id;
  if (id !== undefined && id !== null && `${id}`.length > 0) {
    return `${event.event}:${id}`;
  }
  const digest = createHash("sha256").update(rawBody, "utf8").digest("hex");
  return `${event.event}:body:${digest}`;
}

/** The plan code on a charge, which Paystack types three different ways. */
export function planCodeOf(event: PaystackEvent): string | null {
  const plan = event.data?.plan;
  if (!plan) return null;
  if (typeof plan === "string") return plan.length > 0 ? plan : null;
  if (Array.isArray(plan)) return null;
  return plan.plan_code ?? null;
}

export function isHandled(event: string): event is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(event);
}

export type SubscriptionChange =
  | {
      kind: "activate";
      subscriptionCode: string | null;
      emailToken: string | null;
      currentPeriodEnd: Date | null;
    }
  | { kind: "extend"; currentPeriodEnd: Date | null }
  | { kind: "past_due"; graceUntil: Date }
  | { kind: "cancel_at_period_end" }
  | { kind: "cancelled" }
  | { kind: "ignore"; why: string };

/**
 * One interval forward from a paid date.
 *
 * Computed rather than read from the charge, because `charge.success` does not
 * carry the subscription's next payment date -- and fetching it would put a
 * Paystack round trip inside webhook processing, where a Paystack slowdown
 * would then become our failed deliveries. `setMonth` handles month lengths
 * (31 Jan + 1 month lands in early March, which is what Paystack bills anyway).
 *
 * Reconciliation against `fetchSubscription` is the backstop for drift; it does
 * not belong on this path.
 */
export function nextPeriodEnd(from: Date, interval: Plan["interval"]): Date {
  const end = new Date(from.getTime());
  if (interval === "annually") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * What this event does to the subscription.
 *
 * `plan` is null when the event carries no plan code we recognise. A charge
 * without a plan is a one-off payment, not a subscription, so it is ignored
 * rather than guessed at -- guessing here would hand someone a plan they never
 * bought.
 */
export function decideChange(
  event: PaystackEvent,
  context: { plan: Plan | null; now: Date }
): SubscriptionChange {
  const { plan, now } = context;
  const data = event.data ?? {};

  switch (event.event) {
    case "subscription.create": {
      if (!plan) return { kind: "ignore", why: "no known plan on subscription.create" };
      return {
        kind: "activate",
        subscriptionCode: data.subscription_code ?? null,
        emailToken: data.email_token ?? null,
        currentPeriodEnd:
          parseDate(data.next_payment_date) ??
          nextPeriodEnd(parseDate(data.paid_at) ?? now, plan.interval),
      };
    }

    case "charge.success": {
      if (!plan) return { kind: "ignore", why: "charge with no plan: one-off payment" };
      // A charge that did not succeed is not a renewal, whatever its name.
      if (data.status && data.status !== "success") {
        return { kind: "ignore", why: `charge.success with status ${data.status}` };
      }
      return {
        kind: "extend",
        currentPeriodEnd: nextPeriodEnd(parseDate(data.paid_at) ?? now, plan.interval),
      };
    }

    case "invoice.payment_failed": {
      // Grace comes from the plan, so it can be changed without a deploy. With
      // no plan matched, fall back to the shortest safe thing: no grace at all
      // would cut codes off instantly on a billing glitch, so this uses the
      // documented 7-day default.
      const graceDays = plan?.graceDays ?? 7;
      return { kind: "past_due", graceUntil: addDays(now, graceDays) };
    }

    case "subscription.not_renew":
      return { kind: "cancel_at_period_end" };

    case "subscription.disable":
      return { kind: "cancelled" };

    default:
      return { kind: "ignore", why: `unhandled event ${event.event}` };
  }
}
