import { query, queryOne } from "@/lib/db";
import { normaliseCode } from "@/lib/short-code";
import { DYNAMIC_KINDS, isPageKind } from "@/lib/qr-types";
import { SIGNUP_REF_PARAM } from "@/lib/signup-ref";

export { SIGNUP_REF_PARAM };

/**
 * Accounts that arrive through the "Powered by QRiate+" footer on a hosted
 * page.
 *
 * The footer links to sign-up with the page's code (`signupLinkFor` in
 * `signup-ref.ts`), the form carries it as a hidden field, and a successful
 * sign-up records which code sent it (migration 024). Nothing is stored in
 * the visitor's browser:
 * the privacy policy promises one cookie, the sign-in session, so only a
 * sign-up made on that same visit is credited.
 */

/**
 * The referring code from a sign-up form, or null.
 *
 * Only something shaped like a short code or a custom code is kept; anything
 * else is ignored rather than refused, because a bad referral must never stop
 * someone creating an account.
 */
export function parseSignupRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return normaliseCode(trimmed);
}

const PAGE_KINDS = DYNAMIC_KINDS.filter(isPageKind);

/**
 * Credit a new account to the hosted page that sent it.
 *
 * Only a real hosted page is credited: the insert selects the code, so a code
 * that does not exist, or a link code with no page and so no footer, records
 * nothing. Once per account; a second call is a no-op.
 */
export async function recordSignupSource(userId: string, refCode: string): Promise<boolean> {
  const row = await queryOne<{ user_id: string }>(
    `insert into qr_signup_sources (user_id, source, ref_code_id)
     select $1, 'hosted_page', c.id
     from qr_codes c
     where c.short_code = $2 and c.kind = any($3::text[])
     on conflict (user_id) do nothing
     returning user_id`,
    [userId, refCode, PAGE_KINDS]
  );
  return row !== null;
}

export type PageReferrals = {
  /** Accounts created from a hosted page's footer in the window. */
  total: number;
  /** The pages that sent them, most first. */
  topPages: {
    codeId: string;
    shortCode: string;
    codeName: string;
    ownerId: string;
    ownerEmail: string;
    signups: number;
  }[];
};

/** For the staff overview: what the footer has brought in lately. */
export async function pageReferrals(days = 30, limit = 5): Promise<PageReferrals> {
  const [totals, pages] = await Promise.all([
    queryOne<{ total: string }>(
      `select count(*) as total from qr_signup_sources
       where created_at > now() - make_interval(days => $1)`,
      [days]
    ),
    query<{
      code_id: string;
      short_code: string;
      code_name: string;
      owner_id: string;
      owner_email: string;
      signups: string;
    }>(
      `select c.id as code_id, c.short_code, c.name as code_name,
              u.id as owner_id, u.email as owner_email, count(*) as signups
       from qr_signup_sources s
       join qr_codes c on c.id = s.ref_code_id
       join qr_users u on u.id = c.user_id
       where s.created_at > now() - make_interval(days => $1)
       group by c.id, u.id
       order by count(*) desc, c.id
       limit $2`,
      [days, limit]
    ),
  ]);

  return {
    total: Number(totals?.total ?? 0),
    topPages: pages.map((row) => ({
      codeId: String(row.code_id),
      shortCode: row.short_code,
      codeName: row.code_name,
      ownerId: row.owner_id,
      ownerEmail: row.owner_email,
      signups: Number(row.signups),
    })),
  };
}
