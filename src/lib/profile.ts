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

  return toProfile(rows[0]);
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await queryOne<Row>(
    `select id, email, name, paystack_customer_code, suspended_at
     from qr_users where id = $1`,
    [userId]
  );
  return row ? toProfile(row) : null;
}
