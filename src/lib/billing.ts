import { query, queryOne, withTransaction } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { getPlanByPaystackCode, type Plan } from "@/lib/plans";
import {
  decideChange,
  eventKey,
  eventSchema,
  isHandled,
  planCodeOf,
  type PaystackEvent,
  type SubscriptionChange,
} from "@/lib/billing-events";

/**
 * Applying Paystack deliveries to our own tables.
 *
 * Migration 004 says webhooks are the only writer of `qr_subscriptions.status`
 * and nothing in the browser flow may set it. This module is that writer. The
 * one documented exception is the free-plan grant in `profile.ts`, which is
 * narrowed so it can only ever insert where no subscription exists at all.
 */

export type ApplyOutcome =
  | { kind: "duplicate"; eventKey: string }
  | { kind: "ignored"; eventKey: string; why: string }
  | { kind: "applied"; eventKey: string; change: SubscriptionChange["kind"] }
  | { kind: "deferred"; eventKey: string; why: string };

/**
 * Who the event belongs to.
 *
 * `metadata.user_id` is set when we start the checkout, so it is the reliable
 * route. Email is the fallback for anything started outside our flow -- a
 * charge created by hand in the Paystack dashboard, say -- and matched case
 * insensitively against the index migration 002 created for exactly this.
 *
 * The customer code is recorded on the way past, so a later invoice that
 * carries only that can still find its account.
 */
async function resolveUserId(event: PaystackEvent): Promise<string | null> {
  const fromMetadata = event.data?.metadata?.user_id;
  if (fromMetadata) {
    const row = await queryOne<{ id: string }>(
      "select id from qr_users where id = $1",
      [fromMetadata]
    );
    if (row) return row.id;
  }

  const email = event.data?.customer?.email;
  if (email) {
    const row = await queryOne<{ id: string }>(
      "select id from qr_users where lower(email) = lower($1)",
      [email]
    );
    if (row) return row.id;
  }

  const customerCode = event.data?.customer?.customer_code;
  if (customerCode) {
    const row = await queryOne<{ id: string }>(
      "select id from qr_users where paystack_customer_code = $1",
      [customerCode]
    );
    if (row) return row.id;
  }

  return null;
}

/**
 * Every short code this account owns, so the destination cache can be dropped
 * after a status change.
 *
 * Without this, a lapsed account keeps serving for the rest of the cache window
 * and a *restored* one keeps showing the paused page -- which is the worse half
 * of the pair, because the customer has just paid.
 */
async function purgeOwnerCodes(userId: string): Promise<void> {
  const rows = await query<{ short_code: string }>(
    "select short_code from qr_codes where user_id = $1",
    [userId]
  );

  // Best effort, and deliberately not fatal: Redis being down must not make a
  // webhook fail and be retried. The cache expires on its own regardless.
  await Promise.allSettled(rows.map((row) => purgeDestination(row.short_code)));
}

/** The SQL for each decision. Separated so the shapes stay readable. */
async function writeChange(
  run: <R extends Record<string, unknown>>(
    text: string,
    params?: readonly unknown[]
  ) => Promise<R[]>,
  input: { userId: string; plan: Plan | null; change: SubscriptionChange }
): Promise<void> {
  const { userId, plan, change } = input;

  switch (change.kind) {
    case "activate": {
      // Supersede whatever was live before: the partial unique index allows
      // only one row in ('active','past_due') per user, and an upgrade is a new
      // subscription rather than an edit of the old one. Old rows are kept as
      // history, never deleted.
      await run(
        `update qr_subscriptions
           set status = 'cancelled', updated_at = now()
         where user_id = $1
           and status in ('active', 'past_due')
           and ($2::text is null or paystack_subscription_code is distinct from $2)`,
        [userId, change.subscriptionCode]
      );

      await run(
        `insert into qr_subscriptions
           (user_id, plan_id, paystack_subscription_code, paystack_email_token,
            status, current_period_end, grace_until, cancel_at_period_end)
         values ($1, $2, $3, $4, 'active', $5, null, false)
         on conflict (paystack_subscription_code) do update
           set plan_id              = excluded.plan_id,
               paystack_email_token = coalesce(excluded.paystack_email_token,
                                               qr_subscriptions.paystack_email_token),
               status               = 'active',
               current_period_end   = excluded.current_period_end,
               grace_until          = null,
               cancel_at_period_end = false,
               updated_at           = now()`,
        [
          userId,
          plan!.id,
          change.subscriptionCode,
          change.emailToken,
          change.currentPeriodEnd,
        ]
      );
      return;
    }

    case "extend": {
      // Back to active and grace cleared: a renewal after a failure is exactly
      // how a past_due account recovers, and INFRASTRUCTURE promises codes come
      // back the moment a payment succeeds.
      await run(
        `update qr_subscriptions
           set status             = 'active',
               current_period_end = coalesce($2, current_period_end),
               grace_until        = null,
               updated_at         = now()
         where user_id = $1
           and status in ('active', 'past_due')`,
        [userId, change.currentPeriodEnd]
      );
      return;
    }

    case "past_due": {
      await run(
        `update qr_subscriptions
           set status      = 'past_due',
               grace_until = $2,
               updated_at  = now()
         where user_id = $1
           and status in ('active', 'past_due')`,
        [userId, change.graceUntil]
      );
      return;
    }

    case "cancel_at_period_end": {
      await run(
        `update qr_subscriptions
           set cancel_at_period_end = true,
               updated_at           = now()
         where user_id = $1
           and status in ('active', 'past_due')`,
        [userId]
      );
      return;
    }

    case "cancelled": {
      await run(
        `update qr_subscriptions
           set status     = 'cancelled',
               updated_at = now()
         where user_id = $1
           and status in ('active', 'past_due')`,
        [userId]
      );
      return;
    }

    case "ignore":
      return;
  }
}

/**
 * Record the delivery, then act on it, in one transaction.
 *
 * Order matters. The insert goes first and carries the unique constraint on
 * `event_key`, so a replay fails there and never reaches the subscription
 * write. Marking it processed happens in the same transaction as the effect,
 * so there is no window where an event is logged as handled but did nothing --
 * Paystack does not re-send, so that window would lose money silently.
 *
 * The signature must already have been verified by the caller. This function
 * trusts its input.
 */
export async function applyPaystackEvent(rawBody: string): Promise<ApplyOutcome> {
  const parsed = eventSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) {
    throw new Error(`Paystack payload did not parse: ${parsed.error.message}`);
  }
  const event = parsed.data;
  const key = eventKey(event, rawBody);

  // Logged whether or not we act on it: the payload column is the record of
  // what Paystack actually sent, which is the only evidence in a dispute.
  const inserted = await query<{ id: string }>(
    `insert into qr_payment_events (event_key, type, payload)
     values ($1, $2, $3::jsonb)
     on conflict (event_key) do nothing
     returning id`,
    [key, event.event, rawBody]
  );

  if (inserted.length === 0) return { kind: "duplicate", eventKey: key };
  const eventId = inserted[0].id;

  async function markProcessed(note: string | null): Promise<void> {
    await query(
      "update qr_payment_events set processed_at = now(), error = $2 where id = $1",
      [eventId, note]
    );
  }

  if (!isHandled(event.event)) {
    await markProcessed(null);
    return { kind: "ignored", eventKey: key, why: `unhandled event ${event.event}` };
  }

  const planCode = planCodeOf(event);
  const plan = planCode ? await getPlanByPaystackCode(planCode) : null;

  // A plan code Paystack knows and we do not means the dashboard has a plan
  // this database was never told about. Left unprocessed on purpose, so it can
  // be replayed once the row is seeded rather than quietly losing a sale.
  if (planCode && !plan) {
    await query("update qr_payment_events set error = $2 where id = $1", [
      eventId,
      `unknown paystack plan code ${planCode}`,
    ]);
    return {
      kind: "deferred",
      eventKey: key,
      why: `unknown plan code ${planCode}; seed qr_plans and replay`,
    };
  }

  const userId = await resolveUserId(event);
  if (!userId) {
    await query("update qr_payment_events set error = $2 where id = $1", [
      eventId,
      "no matching qr_users row",
    ]);
    return { kind: "deferred", eventKey: key, why: "no matching account" };
  }

  const change = decideChange(event, { plan, now: new Date() });

  if (change.kind === "ignore") {
    await markProcessed(change.why);
    return { kind: "ignored", eventKey: key, why: change.why };
  }

  await withTransaction(async (run) => {
    await writeChange(run, { userId, plan, change });

    // Remember the customer code the first time we see it, so a later event
    // carrying only that can still be matched to this account.
    const customerCode = event.data?.customer?.customer_code;
    if (customerCode) {
      await run(
        `update qr_users
           set paystack_customer_code = $2, updated_at = now()
         where id = $1 and paystack_customer_code is distinct from $2`,
        [userId, customerCode]
      );
    }

    await run(
      "update qr_payment_events set processed_at = now(), error = null where id = $1",
      [eventId]
    );
  });

  // After the commit, never inside it: a cache purge is not part of the money.
  await purgeOwnerCodes(userId);

  return { kind: "applied", eventKey: key, change: change.kind };
}
