import { query, queryOne } from "@/lib/db";

/**
 * The QR platform's row for an account. Accounts live in `neon_auth."user"`;
 * this is what we add on top.
 */
export type Profile = {
  id: string;
  email: string;
  name: string;
  paystackCustomerCode: string | null;
  suspendedAt: Date | null;
};

type Row = {
  id: string;
  email: string;
  name: string;
  paystack_customer_code: string | null;
  suspended_at: Date | null;
};

function toProfile(row: Row): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    paystackCustomerCode: row.paystack_customer_code,
    suspendedAt: row.suspended_at,
  };
}

/**
 * Create or refresh the profile row for a signed-in user.
 *
 * Neon Auth owns the account, so there is no database trigger tying the two
 * together -- this is the seam. Called after sign-up and whenever a signed-in
 * page loads, so a user who signed up through any route (including social
 * OAuth later) still ends up with a row, and an email change propagates.
 *
 * Idempotent, and cheap enough to call on every authenticated page load.
 */
export async function ensureProfile(user: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<Profile> {
  const rows = await query<Row>(
    `insert into qr_users (id, email, name)
     values ($1, $2, $3)
     on conflict (id) do update
       set email      = excluded.email,
           name       = excluded.name,
           updated_at = now()
     returning id, email, name, paystack_customer_code, suspended_at`,
    [user.id, user.email, user.name?.trim() || user.email]
  );

  // Same reasoning as the profile row itself: repairing on every authenticated
  // load means an account that signed up before the free plan existed, or whose
  // grant failed once, is fixed the next time its owner opens a page.
  await ensureFreeSubscription(user.id);

  return toProfile(rows[0]);
}

/**
 * Give an account the free plan, but only if it has no subscription at all.
 *
 * **This is the one place outside the Paystack webhook that writes
 * `qr_subscriptions.status`, and migration 004 says that is the webhook's job.**
 * The exception is deliberate and narrow, because without it the dashboard
 * would hand users codes that scan to the paused page: `qr_codes`' lookup
 * treats "no subscription" as "not entitled".
 *
 * Two things keep it safe:
 *
 * - `where not exists (...)` means it grants only to an account with **no**
 *   subscription row of any status. It can never resurrect a cancelled
 *   Paystack subscription, never contend with the partial unique index on
 *   `(user_id) where status in ('active','past_due')`, and never overwrite a
 *   status the webhook owns.
 * - It can only ever select the `free` plan, which has `amount_kobo = 0` and
 *   no `paystack_plan_code`.
 *
 * Phase 3 removes this. When checkout exists, free accounts either migrate to
 * a paid plan or lapse through the normal grace path like everyone else.
 */
export async function ensureFreeSubscription(userId: string): Promise<void> {
  await query(
    `insert into qr_subscriptions (user_id, plan_id, status)
     select $1, p.id, 'active'
     from qr_plans p
     where p.slug = 'free'
       and p.is_active
       and not exists (
         select 1 from qr_subscriptions where user_id = $1
       )`,
    [userId]
  );
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await queryOne<Row>(
    `select id, email, name, paystack_customer_code, suspended_at
     from qr_users where id = $1`,
    [userId]
  );
  return row ? toProfile(row) : null;
}
