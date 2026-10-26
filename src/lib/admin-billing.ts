import { query, queryOne } from "@/lib/db";

/**
 * Billing figures for the staff admin. Reads only; the staff changes that
 * write live in `plan-admin.ts`, with the rules that bound them.
 */

/** What one charge is worth per month: an annual price spread over twelve. */
export function monthlyKobo(amountKobo: number, interval: "monthly" | "annually"): number {
  return interval === "annually" ? Math.round(amountKobo / 12) : amountKobo;
}

/**
 * A `like` pattern that matches `term` literally. Without this, a search for
 * `100%` or `a_b` would be read as wildcards.
 */
export function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type PlanSubscribers = {
  planId: number;
  slug: string;
  name: string;
  interval: "monthly" | "annually";
  amountKobo: number;
  isActive: boolean;
  hasPaystackCode: boolean;
  active: number;
  pastDue: number;
  nonRenewing: number;
};

/** Every plan with the subscriptions currently on it, retired plans included. */
export async function planSubscribers(): Promise<PlanSubscribers[]> {
  const rows = await query<{
    id: string;
    slug: string;
    name: string;
    interval: "monthly" | "annually";
    amount_kobo: string;
    is_active: boolean;
    paystack_plan_code: string | null;
    active: string;
    past_due: string;
    non_renewing: string;
  }>(
    `select p.id, p.slug, p.name, p.interval, p.amount_kobo, p.is_active, p.paystack_plan_code,
            count(s.id) filter (where s.status = 'active')   as active,
            count(s.id) filter (where s.status = 'past_due') as past_due,
            count(s.id) filter (where s.cancel_at_period_end) as non_renewing
     from qr_plans p
     left join qr_subscriptions s
       on s.plan_id = p.id and s.status in ('active', 'past_due')
     group by p.id
     order by p.sort_order, p.amount_kobo`
  );
  return rows.map((row) => ({
    planId: Number(row.id),
    slug: row.slug,
    name: row.name,
    interval: row.interval,
    amountKobo: Number(row.amount_kobo),
    isActive: row.is_active,
    hasPaystackCode: row.paystack_plan_code !== null,
    active: Number(row.active),
    pastDue: Number(row.past_due),
    nonRenewing: Number(row.non_renewing),
  }));
}

export type RevenueSummary = {
  /** Monthly recurring revenue from active paid subscriptions, in kobo. */
  mrrKobo: number;
  /** The same, for subscriptions in their grace period. Revenue at risk. */
  atRiskKobo: number;
  paidActive: number;
  pastDue: number;
  nonRenewing: number;
  free: number;
};

/**
 * Totals from the per-plan counts, so the overview's headline figures and its
 * per-plan table are one read and cannot disagree.
 */
export function summariseRevenue(plans: PlanSubscribers[]): RevenueSummary {
  const summary: RevenueSummary = {
    mrrKobo: 0,
    atRiskKobo: 0,
    paidActive: 0,
    pastDue: 0,
    nonRenewing: 0,
    free: 0,
  };
  for (const plan of plans) {
    if (plan.amountKobo <= 0) {
      summary.free += plan.active + plan.pastDue;
      continue;
    }
    const perMonth = monthlyKobo(plan.amountKobo, plan.interval);
    summary.mrrKobo += perMonth * plan.active;
    summary.atRiskKobo += perMonth * plan.pastDue;
    summary.paidActive += plan.active;
    summary.pastDue += plan.pastDue;
    summary.nonRenewing += plan.nonRenewing;
  }
  return summary;
}

export type AccountTotals = { total: number; suspended: number; newLast30Days: number };

export async function accountTotals(): Promise<AccountTotals> {
  const row = await queryOne<{ total: string; suspended: string; new_30: string }>(
    `select count(*) as total,
            count(*) filter (where suspended_at is not null) as suspended,
            count(*) filter (where created_at > now() - interval '30 days') as new_30
     from qr_users`
  );
  return {
    total: Number(row?.total ?? 0),
    suspended: Number(row?.suspended ?? 0),
    newLast30Days: Number(row?.new_30 ?? 0),
  };
}

export type PastDueAccount = {
  userId: string;
  email: string;
  planName: string;
  graceUntil: Date | null;
};

/** Accounts in their grace period, soonest to pause first. */
export async function pastDueAccounts(limit = 20): Promise<PastDueAccount[]> {
  const rows = await query<{ user_id: string; email: string; plan_name: string; grace_until: Date | null }>(
    `select u.id as user_id, u.email, p.name as plan_name, s.grace_until
     from qr_subscriptions s
     join qr_users u on u.id = s.user_id
     join qr_plans p on p.id = s.plan_id
     where s.status = 'past_due'
     order by s.grace_until nulls last
     limit $1`,
    [limit]
  );
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    planName: row.plan_name,
    graceUntil: row.grace_until,
  }));
}

export type WebhookHealth = {
  unprocessed: number;
  failed: number;
  recent: { id: number; type: string; receivedAt: Date; error: string | null }[];
};

/**
 * Paystack events that have not been applied. Each one is a payment, renewal
 * or cancellation the database has not caught up with, so this is the first
 * place to look when a customer says they paid and their plan did not change.
 */
export async function webhookHealth(): Promise<WebhookHealth> {
  const [counts, recent] = await Promise.all([
    queryOne<{ unprocessed: string; failed: string }>(
      `select count(*) filter (where processed_at is null) as unprocessed,
              count(*) filter (where processed_at is null and error is not null) as failed
       from qr_payment_events`
    ),
    query<{ id: string; type: string; received_at: Date; error: string | null }>(
      `select id, type, received_at, error from qr_payment_events
       where processed_at is null
       order by received_at desc
       limit 10`
    ),
  ]);
  return {
    unprocessed: Number(counts?.unprocessed ?? 0),
    failed: Number(counts?.failed ?? 0),
    recent: recent.map((row) => ({
      id: Number(row.id),
      type: row.type,
      receivedAt: row.received_at,
      error: row.error,
    })),
  };
}

export type CustomerRow = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  suspended: boolean;
  planName: string | null;
  interval: "monthly" | "annually" | null;
  status: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  codes: number;
};

/**
 * Accounts, newest first, optionally filtered by email or name. Each carries
 * its live subscription if it has one, else its most recent.
 */
export async function listCustomers(search: string, limit = 50): Promise<CustomerRow[]> {
  const rows = await query<{
    id: string;
    email: string;
    name: string;
    created_at: Date;
    suspended_at: Date | null;
    plan_name: string | null;
    interval: "monthly" | "annually" | null;
    status: string | null;
    current_period_end: Date | null;
    cancel_at_period_end: boolean | null;
    codes: string;
  }>(
    `select u.id, u.email, u.name, u.created_at, u.suspended_at,
            p.name as plan_name, p.interval, s.status, s.current_period_end, s.cancel_at_period_end,
            (select count(*) from qr_codes c where c.user_id = u.id) as codes
     from qr_users u
     left join lateral (
       select * from qr_subscriptions s
       where s.user_id = u.id
       order by (s.status in ('active', 'past_due')) desc, s.updated_at desc
       limit 1
     ) s on true
     left join qr_plans p on p.id = s.plan_id
     where $1 = '' or u.email ilike $2 or u.name ilike $2
     order by u.created_at desc
     limit $3`,
    [search, likeContains(search), limit]
  );
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    suspended: row.suspended_at !== null,
    planName: row.plan_name,
    interval: row.interval,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    codes: Number(row.codes),
  }));
}

export type CustomerDetail = {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  suspendedAt: Date | null;
  hasPaystackCustomer: boolean;
  subscriptions: {
    id: number;
    planName: string;
    planSlug: string;
    status: string;
    currentPeriodEnd: Date | null;
    graceUntil: Date | null;
    cancelAtPeriodEnd: boolean;
    viaPaystack: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[];
  codes: { id: number; name: string; shortCode: string; status: string; createdAt: Date }[];
};

/** One account, every subscription it has held, and its codes. */
export async function getCustomer(userId: string): Promise<CustomerDetail | null> {
  const profile = await queryOne<{
    id: string;
    email: string;
    name: string;
    created_at: Date;
    suspended_at: Date | null;
    paystack_customer_code: string | null;
  }>(
    `select id, email, name, created_at, suspended_at, paystack_customer_code
     from qr_users where id = $1`,
    [userId]
  );
  if (!profile) return null;

  const [subscriptions, codes] = await Promise.all([
    query<{
      id: string;
      plan_name: string;
      plan_slug: string;
      status: string;
      current_period_end: Date | null;
      grace_until: Date | null;
      cancel_at_period_end: boolean;
      paystack_subscription_code: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `select s.id, p.name as plan_name, p.slug as plan_slug, s.status, s.current_period_end,
              s.grace_until, s.cancel_at_period_end, s.paystack_subscription_code,
              s.created_at, s.updated_at
       from qr_subscriptions s
       join qr_plans p on p.id = s.plan_id
       where s.user_id = $1
       order by s.created_at desc`,
      [userId]
    ),
    query<{ id: string; name: string; short_code: string; status: string; created_at: Date }>(
      `select id, name, short_code, status, created_at
       from qr_codes where user_id = $1
       order by created_at desc
       limit 200`,
      [userId]
    ),
  ]);

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    createdAt: profile.created_at,
    suspendedAt: profile.suspended_at,
    hasPaystackCustomer: profile.paystack_customer_code !== null,
    subscriptions: subscriptions.map((row) => ({
      id: Number(row.id),
      planName: row.plan_name,
      planSlug: row.plan_slug,
      status: row.status,
      currentPeriodEnd: row.current_period_end,
      graceUntil: row.grace_until,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      viaPaystack: row.paystack_subscription_code !== null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    codes: codes.map((row) => ({
      id: Number(row.id),
      name: row.name,
      shortCode: row.short_code,
      status: row.status,
      createdAt: row.created_at,
    })),
  };
}
