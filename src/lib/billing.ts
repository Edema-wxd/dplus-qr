import { query, queryOne, withTransaction } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { getPlanByPaystackCode, type Plan } from "@/lib/plans";
import { disableSubscription } from "@/lib/paystack";
import { alertOnce } from "@/lib/error-alerts";
import {
  notifyCancelled,
  notifyPaymentFailed,
  notifyPaymentSucceeded,
} from "@/lib/billing-notify";
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

/**
 * What became of one attempt at an event.
 *
 * `followUp` is what to do once the caller has answered: stop a replaced
 * subscription at Paystack, purge cached destinations, email the customer,
 * alert staff. None of it is part of the money, and the webhook runs it in
 * `after()` so Paystack's request waits only on the database.
 *
 * `busy` means another attempt at the same event holds the claim right now;
 * `duplicate` means the event has already been applied.
 */
export type ApplyOutcome = (
  | { kind: "duplicate"; eventKey: string }
  | { kind: "busy"; eventKey: string }
  | { kind: "ignored"; eventKey: string; why: string }
  | { kind: "applied"; eventKey: string; change: SubscriptionChange["kind"] }
  | { kind: "deferred"; eventKey: string; why: string }
) & { followUp?: () => Promise<void> };

/**
 * How long a claim on an event holds before another attempt may take it over.
 * Long enough for any real attempt to finish; short enough that an attempt
 * that died (a timeout, a deploy) does not hold the event past Paystack's
 * next re-delivery.
 */
const CLAIM_LEASE = "2 minutes";

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

type Run = <R extends Record<string, unknown>>(
  text: string,
  params?: readonly unknown[]
) => Promise<R[]>;

/** A Paystack subscription an activation replaced, to be stopped there. */
export type Superseded = { code: string; emailToken: string };

/**
 * What a write did. `matched` is false when no live row was the one the event
 * is about -- a renewal for a plan the account is not on, or an event for a
 * subscription already replaced -- and then nothing was changed.
 */
type Written = { matched: boolean; superseded: Superseded[] };

/**
 * The SQL for each decision. Separated so the shapes stay readable.
 *
 * Every write names the row it is about. Before 10 November 2026 these
 * matched any live row of the account, so after an upgrade the old
 * subscription's renewal, failure or cancellation landed on the new plan:
 * cancelling a leftover Starter subscription lapsed a paid Business plan,
 * and a Starter renewal could clear a failed Business payment's grace.
 */
async function writeChange(
  run: Run,
  input: { userId: string; plan: Plan | null; change: SubscriptionChange }
): Promise<Written> {
  const { userId, plan, change } = input;

  switch (change.kind) {
    case "activate": {
      // Supersede whatever was live before: the partial unique index allows
      // only one row in ('active','past_due') per user, and an upgrade is a new
      // subscription rather than an edit of the old one. Old rows are kept as
      // history, never deleted. Their Paystack subscriptions are returned so
      // the caller can stop them after the commit; one the customer already
      // cancelled (`cancel_at_period_end`) has been stopped.
      const replaced = await run<{
        paystack_subscription_code: string | null;
        paystack_email_token: string | null;
        cancel_at_period_end: boolean;
      }>(
        `update qr_subscriptions
           set status = 'cancelled', updated_at = now()
         where user_id = $1
           and status in ('active', 'past_due')
           and paystack_subscription_code is distinct from $2
         returning paystack_subscription_code, paystack_email_token, cancel_at_period_end`,
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

      const superseded = replaced.flatMap((row) =>
        row.paystack_subscription_code && row.paystack_email_token && !row.cancel_at_period_end
          ? [{ code: row.paystack_subscription_code, emailToken: row.paystack_email_token }]
          : []
      );
      return { matched: true, superseded };
    }

    case "extend": {
      // Back to active and grace cleared: a renewal after a failure is exactly
      // how a past_due account recovers, and INFRASTRUCTURE promises codes come
      // back the moment a payment succeeds. Only the row on the charge's plan
      // -- and on its subscription, when the charge names one -- is renewed.
      const rows = await run(
        `update qr_subscriptions
           set status             = 'active',
               current_period_end = coalesce($2, current_period_end),
               grace_until        = null,
               updated_at         = now()
         where user_id = $1
           and status in ('active', 'past_due')
           and plan_id = $3
           and ($4::text is null or paystack_subscription_code = $4)
         returning id`,
        [userId, change.currentPeriodEnd, plan!.id, change.subscriptionCode]
      );
      return { matched: rows.length > 0, superseded: [] };
    }

    case "past_due": {
      const rows = await run(
        `update qr_subscriptions
           set status      = 'past_due',
               grace_until = $2,
               updated_at  = now()
         where user_id = $1
           and status in ('active', 'past_due')
           and paystack_subscription_code = $3
         returning id`,
        [userId, change.graceUntil, change.subscriptionCode]
      );
      return { matched: rows.length > 0, superseded: [] };
    }

    case "cancel_at_period_end": {
      const rows = await run(
        `update qr_subscriptions
           set cancel_at_period_end = true,
               updated_at           = now()
         where user_id = $1
           and status in ('active', 'past_due')
           and paystack_subscription_code = $2
         returning id`,
        [userId, change.subscriptionCode]
      );
      return { matched: rows.length > 0, superseded: [] };
    }

    case "cancelled": {
      const rows = await run(
        `update qr_subscriptions
           set status     = 'cancelled',
               updated_at = now()
         where user_id = $1
           and status in ('active', 'past_due')
           and paystack_subscription_code = $2
         returning id`,
        [userId, change.subscriptionCode]
      );
      return { matched: rows.length > 0, superseded: [] };
    }

    case "ignore":
    case "defer":
      return { matched: false, superseded: [] };
  }
}

/**
 * Whether a `subscription.create` is one this account asked for.
 *
 * Paystack sends it without metadata, so the account comes from the customer
 * email, and anyone can pay with someone else's email through Paystack
 * Inline. Activating supersedes the account's plan and stops its current
 * subscription at Paystack, so it must not happen on an email alone. Trusted
 * when the subscription is already this account's (Paystack re-sending it), or
 * when the account started a checkout for this plan here in the last seven
 * days (migration 031). The matching checkout is returned so the same
 * transaction can mark it used.
 */
async function activationOrigin(
  userId: string,
  planId: number,
  subscriptionCode: string
): Promise<{ trusted: true; intentId: string | null } | { trusted: false; why: string }> {
  const existing = await queryOne<{ user_id: string }>(
    "select user_id from qr_subscriptions where paystack_subscription_code = $1",
    [subscriptionCode]
  );
  if (existing) {
    return existing.user_id === userId
      ? { trusted: true, intentId: null }
      : { trusted: false, why: "subscription.create for a subscription held by another account" };
  }

  const intent = await queryOne<{ id: string }>(
    `select id from qr_checkout_intents
      where user_id = $1 and plan_id = $2 and consumed_at is null
        and created_at > now() - interval '7 days'
      order by created_at desc
      limit 1`,
    [userId, planId]
  );
  if (intent) return { trusted: true, intentId: intent.id };

  return {
    trusted: false,
    why: "subscription.create with no checkout started here for that account and plan",
  };
}

/**
 * Stop the Paystack subscriptions an activation replaced, after the commit.
 *
 * Without this an upgrade kept the old plan billing at Paystack. A failure is
 * not retried here -- the new plan is already live -- but staff are told,
 * because until someone stops it the customer is charged for both.
 */
async function stopSuperseded(userId: string, superseded: Superseded[]): Promise<void> {
  for (const old of superseded) {
    try {
      await disableSubscription(old.code, old.emailToken);
    } catch (error) {
      console.error("[paystack] could not stop a superseded subscription", old.code, error);
      await alertOnce(
        `paystack-supersede:${old.code}`,
        "An old subscription is still billing",
        [
          "A customer moved to a new plan, but the subscription it replaced could",
          "not be stopped at Paystack, so they may be charged for both.",
          "",
          `  Account: ${userId}`,
          `  Old subscription: ${old.code}`,
          "",
          "Disable it in the Paystack dashboard (Subscriptions).",
        ].join("\n")
      );
    }
  }
}

/**
 * Record a delivery and claim it, in one statement.
 *
 * A new event is inserted already claimed. One seen before is claimed again
 * only while it is unprocessed and nobody else holds it: before 11 November
 * 2026 any existing row ended the delivery, so an event whose first attempt
 * threw was never applied and Paystack's re-delivery of it was dropped as a
 * duplicate. The payload of the first delivery is kept; Paystack re-sends the
 * same body.
 */
async function claimDelivery(
  key: string,
  type: string,
  rawBody: string
): Promise<{ id: string } | { kind: "duplicate" | "busy" }> {
  const claimed = await query<{ id: string }>(
    `insert into qr_payment_events (event_key, type, payload, attempts, claimed_at)
     values ($1, $2, $3::jsonb, 1, now())
     on conflict (event_key) do update
       set attempts = qr_payment_events.attempts + 1, claimed_at = now()
       where qr_payment_events.processed_at is null
         and (qr_payment_events.claimed_at is null
              or qr_payment_events.claimed_at < now() - interval '${CLAIM_LEASE}')
     returning id`,
    [key, type, rawBody]
  );
  if (claimed.length > 0) return { id: claimed[0].id };
  return { kind: await whyUnclaimed("event_key = $1", key) };
}

/** Whether an event that could not be claimed is done, or in someone's hands. */
async function whyUnclaimed(where: string, value: string): Promise<"duplicate" | "busy"> {
  const row = await queryOne<{ processed: boolean }>(
    `select processed_at is not null as processed from qr_payment_events where ${where}`,
    [value]
  );
  return row && !row.processed ? "busy" : "duplicate";
}

/**
 * Record the delivery, then act on it.
 *
 * The claim goes first and carries the unique constraint on `event_key`, so
 * an applied event fails there and never reaches the subscription write.
 * Marking it processed happens in the same transaction as the effect, so there
 * is no window where an event is logged as handled but did nothing. If the
 * attempt throws, the row stays unprocessed and its claim lapses, and the next
 * delivery, a staff retry or the daily sweep tries again.
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
  const claim = await claimDelivery(key, event.event, rawBody);
  if ("kind" in claim) return { kind: claim.kind, eventKey: key };

  return processClaimed(claim.id, key, event);
}

/**
 * Try a stored event again, by its row id: the admin's Retry and the daily
 * sweep. Claimed exactly as a delivery is, so a retry racing Paystack's own
 * re-delivery cannot apply it twice. The stored key is reused rather than
 * recomputed, because `payload` is jsonb and no longer the bytes a body-hash
 * key was made from.
 */
export async function retryPaystackEvent(eventId: string): Promise<ApplyOutcome | { kind: "missing" }> {
  const rows = await query<{ event_key: string; payload: unknown }>(
    `update qr_payment_events
        set attempts = attempts + 1, claimed_at = now()
      where id = $1
        and processed_at is null
        and (claimed_at is null or claimed_at < now() - interval '${CLAIM_LEASE}')
      returning event_key, payload`,
    [eventId]
  );
  if (rows.length === 0) {
    const exists = await queryOne<{ id: string }>("select id from qr_payment_events where id = $1", [eventId]);
    if (!exists) return { kind: "missing" };
    const kind = await whyUnclaimed("id = $1", eventId);
    return { kind, eventKey: "" };
  }

  const { event_key: key, payload } = rows[0];
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`stored Paystack payload did not parse: ${parsed.error.message}`);
  }
  return processClaimed(eventId, key, parsed.data);
}

export type SweepResult = { tried: number; applied: number; deferred: number; failed: number };

/**
 * The daily backstop for events whose attempts all threw and that Paystack has
 * stopped re-sending. Only rows with no recorded reason: a deferred event is
 * waiting on a person, and trying it again changes nothing until they act.
 * A fortnight back at most, and a few at a time, so one bad payload cannot
 * make the job run long.
 */
export async function retryStuckEvents(limit = 20): Promise<SweepResult> {
  const stuck = await query<{ id: string }>(
    `select id from qr_payment_events
      where processed_at is null
        and error is null
        and received_at > now() - interval '14 days'
        and (claimed_at is null or claimed_at < now() - interval '1 hour')
      order by received_at
      limit $1`,
    [limit]
  );

  const result: SweepResult = { tried: 0, applied: 0, deferred: 0, failed: 0 };
  for (const { id } of stuck) {
    result.tried++;
    try {
      const outcome = await retryPaystackEvent(id);
      if (outcome.kind === "applied") result.applied++;
      if (outcome.kind === "deferred") result.deferred++;
      if ("followUp" in outcome && outcome.followUp) await outcome.followUp();
    } catch (error) {
      result.failed++;
      console.error("[paystack] retry of a stuck event failed", id, error);
    }
  }
  return result;
}

/** Act on an event this attempt holds the claim on. */
async function processClaimed(eventId: string, key: string, event: PaystackEvent): Promise<ApplyOutcome> {
  async function markProcessed(note: string | null): Promise<void> {
    await query(
      "update qr_payment_events set processed_at = now(), claimed_at = null, error = $2 where id = $1",
      [eventId, note]
    );
  }

  // Released, so a person who fixes the cause can retry it at once.
  async function defer(why: string, stored = why): Promise<ApplyOutcome> {
    await query("update qr_payment_events set claimed_at = null, error = $2 where id = $1", [eventId, stored]);
    return { kind: "deferred", eventKey: key, why, followUp: () => alertDeferred(key, why) };
  }

  if (!isHandled(event.event)) {
    await markProcessed(null);
    return { kind: "ignored", eventKey: key, why: `unhandled event ${event.event}` };
  }

  const planCode = planCodeOf(event);
  const plan = planCode ? await getPlanByPaystackCode(planCode) : null;

  // A plan code Paystack knows and we do not means the dashboard has a plan
  // this database was never told about. Left unprocessed on purpose, so it can
  // be retried once the row is seeded rather than quietly losing a sale.
  if (planCode && !plan) {
    return defer(
      `unknown plan code ${planCode}; connect the plan, then retry`,
      `unknown paystack plan code ${planCode}`
    );
  }

  const userId = await resolveUserId(event);
  if (!userId) return defer("no matching account", "no matching qr_users row");

  const change = decideChange(event, { plan, now: new Date() });

  if (change.kind === "ignore") {
    await markProcessed(change.why);
    return { kind: "ignored", eventKey: key, why: change.why };
  }

  if (change.kind === "defer") return defer(change.why);

  let intentId: string | null = null;
  if (change.kind === "activate") {
    const origin = await activationOrigin(userId, plan!.id, change.subscriptionCode!);
    if (!origin.trusted) return defer(origin.why);
    intentId = origin.intentId;
  }

  const written = await withTransaction(async (run) => {
    const result = await writeChange(run, { userId, plan, change });
    if (!result.matched) {
      await run(
        "update qr_payment_events set processed_at = now(), claimed_at = null, error = $2 where id = $1",
        [eventId, "no live subscription matched this event; nothing changed"]
      );
      return result;
    }

    if (intentId) {
      const used = await run(
        `update qr_checkout_intents
            set consumed_at = now(), subscription_code = $2
          where id = $1 and consumed_at is null
          returning id`,
        [intentId, change.kind === "activate" ? change.subscriptionCode : null]
      );
      // Another delivery used the same checkout a moment ago. Rolled back and
      // left unprocessed, so a person decides rather than both activating.
      if (used.length === 0) throw new Error("checkout intent already used by another subscription");
    }

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
      "update qr_payment_events set processed_at = now(), claimed_at = null, error = null where id = $1",
      [eventId]
    );
    return result;
  });

  // An event about a subscription that is no longer live -- the one an
  // upgrade replaced, typically -- changes nothing and tells nobody.
  if (!written.matched) {
    return { kind: "ignored", eventKey: key, why: "no live subscription matched" };
  }

  return {
    kind: "applied",
    eventKey: key,
    change: change.kind,
    // After the commit, never inside it, and after the caller has answered.
    // Stopping the old plan at Paystack and purging the cache are not part of
    // this transaction's money. The emails are side effects on the outside
    // world: a mail failure inside the transaction would roll back a payment
    // we have already taken. `notify*` swallow their own errors.
    followUp: async () => {
      await stopSuperseded(userId, written.superseded);
      await purgeOwnerCodes(userId);
      await notifyOf({ userId, plan, change });
    },
  };
}

/** Tell staff an event is waiting on them. One email per reason per hour. */
async function alertDeferred(key: string, why: string): Promise<void> {
  console.error("[paystack] deferred", key, why);
  await alertOnce(
    `paystack-deferred:${why}`,
    "A Paystack event needs a person",
    [
      "A Paystack event could not be applied on its own:",
      "",
      `  ${why}`,
      "",
      "It is listed under Payments on the admin overview, with a Retry button",
      "for once the cause is fixed. Until it is dealt with, a customer's plan",
      "may not match what they paid for.",
      "Further events deferred for the same reason are not emailed for an hour.",
    ].join("\n")
  );
}

/**
 * Tell the customer what just happened to their billing.
 *
 * Separate from the write so the transaction stays about the money. A plan name
 * is needed and `plan` is null for the events that do not carry a plan code, so
 * those fall back to the name on the subscription row rather than going out
 * addressed to a blank.
 */
async function notifyOf(input: {
  userId: string;
  plan: Plan | null;
  change: SubscriptionChange;
}): Promise<void> {
  const { userId, plan, change } = input;

  try {
    const current = await queryOne<{ plan_name: string; current_period_end: Date | null }>(
      `select p.name as plan_name, s.current_period_end
         from qr_subscriptions s
         join qr_plans p on p.id = s.plan_id
        where s.user_id = $1
        order by s.updated_at desc
        limit 1`,
      [userId]
    );

    const planName = plan?.name ?? current?.plan_name ?? "your";
    const periodEnd = current?.current_period_end ?? null;

    switch (change.kind) {
      case "activate":
        await notifyPaymentSucceeded({ userId, planName, periodEnd, first: true });
        return;
      case "extend":
        await notifyPaymentSucceeded({ userId, planName, periodEnd, first: false });
        return;
      case "past_due":
        await notifyPaymentFailed({ userId, planName, graceUntil: change.graceUntil });
        return;
      case "cancel_at_period_end":
        await notifyCancelled({ userId, planName, periodEnd });
        return;
      // A disabled subscription is told about by the grace-expiry job when the
      // codes actually go quiet. Two emails saying the same thing on the same
      // day is how people learn to ignore billing mail.
      case "cancelled":
      case "ignore":
      case "defer":
        return;
    }
  } catch (error) {
    console.error("[paystack] could not send billing notification", error);
  }
}
