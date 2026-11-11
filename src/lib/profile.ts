import { query, queryOne } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";

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
  /**
   * Set while the account's codes are held until its email is confirmed
   * (migration 033): the redirect shows the paused page for every one of
   * them. Only ever set on an account created unverified, and cleared for
   * good once it is verified.
   */
  codesHeldSince: Date | null;
};

type Row = {
  id: string;
  email: string;
  name: string;
  paystack_customer_code: string | null;
  suspended_at: Date | null;
  codes_held_since: Date | null;
};

const COLUMNS = "id, email, name, paystack_customer_code, suspended_at, codes_held_since";

function toProfile(row: Row): Profile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    paystackCustomerCode: row.paystack_customer_code,
    suspendedAt: row.suspended_at,
    codesHeldSince: row.codes_held_since,
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
 * It is also where a new account's codes are held and released (migration
 * 033, DECISIONS.md 11 November 2026):
 *
 * - A row *created* for an unverified account starts held, so its codes show
 *   the paused page until the address is confirmed. A throwaway sign-up can no
 *   longer mint a live link on this domain.
 * - The first call that sees the email verified clears the hold and purges
 *   the account's codes from the redirect cache, so they serve at once.
 * - An existing row is never put on hold. Accounts from before the hold keep
 *   serving, and a verified account that changes its address keeps serving:
 *   a printed code must not go dark because of an email setting.
 *
 * Idempotent, and cheap enough to call on every authenticated page load.
 */
export async function ensureProfile(user: {
  id: string;
  email: string;
  name?: string | null;
  /**
   * From the session. Required so no caller forgets it: anything but `true`
   * holds a newly created account, and leaves an existing one as it is.
   */
  emailVerified: boolean | null | undefined;
}): Promise<Profile> {
  const verified = user.emailVerified === true;
  const rows = await query<Row & { released: boolean }>(
    `with before as (
       select codes_held_since from qr_users where id = $1
     )
     insert into qr_users (id, email, name, codes_held_since)
     values ($1, $2, $3, case when $4 then null else now() end)
     on conflict (id) do update
       set email            = excluded.email,
           name             = excluded.name,
           -- Released once verified, and never set again on an existing row.
           codes_held_since = case when $4 then null else qr_users.codes_held_since end,
           updated_at       = now()
       -- An erased profile stays anonymous. Staff erase it before removing
       -- the sign-in account, so a session still open in between must not
       -- copy the name and email straight back.
       where qr_users.erased_at is null
     returning ${COLUMNS},
               coalesce((select codes_held_since is not null from before), false)
                 and codes_held_since is null as released`,
    [user.id, user.email, user.name?.trim() || user.email, verified]
  );

  // Same reasoning as the profile row itself: repairing on every authenticated
  // load means an account that signed up before the free plan existed, or whose
  // grant failed once, is fixed the next time its owner opens a page.
  await ensureFreeSubscription(user.id);

  // No row back means the update was skipped because the profile is erased.
  // It still exists, so read it as it stands.
  if (!rows[0]) {
    const erased = await getProfile(user.id);
    if (!erased) throw new Error(`[profile] ${user.id} vanished during ensureProfile`);
    return erased;
  }

  if (rows[0].released) await purgeOwnerCodes(user.id);
  return toProfile(rows[0]);
}

/**
 * Drop a released account's codes from the redirect cache. Best effort: an
 * entry left behind expires within the cache's TTL regardless.
 */
async function purgeOwnerCodes(userId: string): Promise<void> {
  try {
    const codes = await query<{ short_code: string }>(
      "select short_code from qr_codes where user_id = $1",
      [userId]
    );
    await Promise.allSettled(codes.map((code) => purgeDestination(code.short_code)));
  } catch (error) {
    console.error("[profile] could not purge codes after release", error);
  }
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
    `select ${COLUMNS} from qr_users where id = $1`,
    [userId]
  );
  return row ? toProfile(row) : null;
}
