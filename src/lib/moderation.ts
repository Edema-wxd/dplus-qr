import { z } from "zod";
import { query, queryOne, withTransaction } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { isDynamicKind, isPageKind } from "@/lib/qr-types";
import { checkReputation, screenUrl, type ReputationVerdict } from "@/lib/screening";
import { likeContains } from "@/lib/admin-billing";

/**
 * Staff moderation: every code on the platform, and what staff can do to a
 * code or an account.
 *
 * Nothing here deletes a code row. Taking a code down means blocking, pausing
 * or archiving it; taking an account down means suspending, archiving or
 * erasing it. The row always stays, so the unique index keeps holding its
 * short code and a printed code can never be reissued to someone else.
 *
 * Every write purges the redirect cache for the codes it touched, so the
 * change reaches scanners within seconds rather than a cache window.
 */

// ---------------------------------------------------------------------------
// Pure rules, tested directly.
// ---------------------------------------------------------------------------

export const CODE_STATUS_FILTERS = ["active", "paused", "blocked", "archived"] as const;
export const CODE_FLAG_FILTERS = ["reported", "changed"] as const;

const single = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** The staff code list's filters, read leniently: a bad value means "any". */
export const codeFiltersSchema = z.object({
  q: z.preprocess(single, z.string().trim().max(100).catch("")).catch(""),
  status: z.preprocess(single, z.enum(CODE_STATUS_FILTERS)).optional().catch(undefined),
  kind: z
    .preprocess(single, z.string().refine(isDynamicKind))
    .optional()
    .catch(undefined),
  flag: z.preprocess(single, z.enum(CODE_FLAG_FILTERS)).optional().catch(undefined),
  page: z.preprocess(single, z.coerce.number().int().min(1).max(1000)).catch(1),
});

export type CodeFilters = z.infer<typeof codeFiltersSchema>;

/** A reason staff give for a block. The owner sees it, so it must say something. */
export const reasonSchema = z
  .string()
  .trim()
  .min(3, "Give a reason. The owner sees it on their dashboard.")
  .max(500, "Keep the reason under 500 characters.");

/**
 * The host a code sends people to, or null for a page hosted here
 * (`/p/{code}`) or a value that is not a URL at all.
 */
export function destinationHost(destination: string): string | null {
  if (!/^https?:\/\//i.test(destination)) return null;
  try {
    return new URL(destination).host;
  } catch {
    return null;
  }
}

/**
 * A destination split for display around the host the browser will visit,
 * so `https://paystack.com@evil.ng/login` reads as what it is: everything
 * before the host stays visible, and the host is its own part.
 *
 * If the host is not in the text as written, the parser rewrote it, as it
 * does an internationalised name into `xn--` form. That form is then shown
 * first, since it is what gives away a look-alike character.
 */
export function splitDestination(url: string): { before: string; host: string; rest: string } {
  const host = destinationHost(url);
  if (!host) return { before: "", host: "", rest: url };

  // The real host follows the last `@` of the authority, never a look-alike
  // in the userinfo before it.
  const start = url.indexOf("//") + 2;
  const end = url.slice(start).search(/[/?#]/);
  const authority = end === -1 ? url.slice(start) : url.slice(start, start + end);
  const found = authority.toLowerCase().indexOf(host.toLowerCase(), authority.lastIndexOf("@") + 1);
  if (found === -1) return { before: "", host, rest: ` · ${url}` };

  const at = start + found;
  return { before: url.slice(0, at), host: url.slice(at, at + host.length), rest: url.slice(at + host.length) };
}

/**
 * Erasing cannot be undone, so staff type the account's email to confirm it.
 * Case and surrounding space are forgiven; anything else is not.
 */
export function erasureConfirmed(typed: string, email: string): boolean {
  const want = email.trim().toLowerCase();
  return want.length > 0 && typed.trim().toLowerCase() === want;
}

export type EraseFacts = {
  staffId: string;
  userId: string;
  targetIsAdmin: boolean;
  alreadyErased: boolean;
  liveViaPaystack: boolean;
};

/** Why an account may not be erased, or null when it may. */
export function eraseRefusal(facts: EraseFacts): string | null {
  if (facts.userId === facts.staffId) return "You cannot erase your own account.";
  if (facts.targetIsAdmin) {
    return "This is a staff account. Remove its admin role in the database first.";
  }
  if (facts.alreadyErased) return "This account has already been erased.";
  if (facts.liveViaPaystack) {
    return "This account still pays through Paystack. Cancel the subscription in Paystack first, or it keeps charging an account that no longer exists.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

const UTC_TODAY = `(now() at time zone 'UTC')::date`;

/**
 * Scans over the last seven UTC days, today included: the rollup for the six
 * finished days and raw rows for today, the same split `codeAnalytics` uses.
 */
const SCANS_7D = `(
  (select coalesce(sum(d.scans), 0) from qr_scan_daily d
    where d.qr_id = c.id and d.day >= ${UTC_TODAY} - 6 and d.day < ${UTC_TODAY})
  + (select count(*) from qr_scans s
    where s.qr_id = c.id and not s.is_bot and s.scanned_at >= ${UTC_TODAY})
)`;

export type StaffCodeRow = {
  id: number;
  shortCode: string;
  name: string;
  kind: string;
  destinationUrl: string;
  status: "active" | "paused" | "blocked";
  archived: boolean;
  createdAt: Date;
  owner: { id: string; email: string; name: string; suspended: boolean; erased: boolean };
  scans7d: number;
  lastChangedAt: Date | null;
  /** Destination changed in the last 24 hours, judged by the database clock. */
  changedRecently: boolean;
  openReports: number;
};

type CodeListRow = {
  id: string;
  short_code: string;
  name: string;
  kind: string;
  destination_url: string;
  status: "active" | "paused" | "blocked";
  archived: boolean;
  created_at: Date;
  owner_id: string;
  owner_email: string;
  owner_name: string;
  owner_suspended: boolean;
  owner_erased: boolean;
  scans_7d: string;
  last_changed_at: Date | null;
  changed_recently: boolean;
  open_reports: string;
};

function toStaffCodeRow(row: CodeListRow): StaffCodeRow {
  return {
    id: Number(row.id),
    shortCode: row.short_code,
    name: row.name,
    kind: row.kind,
    destinationUrl: row.destination_url,
    status: row.status,
    archived: row.archived,
    createdAt: row.created_at,
    owner: {
      id: row.owner_id,
      email: row.owner_email,
      name: row.owner_name,
      suspended: row.owner_suspended,
      erased: row.owner_erased,
    },
    scans7d: Number(row.scans_7d),
    lastChangedAt: row.last_changed_at,
    changedRecently: row.changed_recently,
    openReports: Number(row.open_reports),
  };
}

const CODE_COLUMNS = `
  c.id, c.short_code, c.name, c.kind, c.destination_url, c.status,
  c.archived_at is not null as archived, c.created_at,
  u.id as owner_id, u.email as owner_email, u.name as owner_name,
  u.suspended_at is not null as owner_suspended,
  u.erased_at is not null as owner_erased,
  ${SCANS_7D} as scans_7d,
  (select max(h.changed_at) from qr_destination_history h where h.qr_id = c.id) as last_changed_at,
  exists (select 1 from qr_destination_history h
          where h.qr_id = c.id and h.changed_at > now() - interval '24 hours') as changed_recently,
  (select count(*) from qr_abuse_reports r where r.qr_id = c.id and r.status = 'open') as open_reports
`;

export const CODES_PER_PAGE = 50;

/**
 * Every code on the platform, newest first, a page at a time.
 *
 * Archived codes appear only under their own filter, so the default list is
 * what is actually in circulation. A search matches a short code exactly
 * (it is case-sensitive), and a name, destination or owner email anywhere.
 */
export async function listStaffCodes(
  filters: CodeFilters
): Promise<{ rows: StaffCodeRow[]; hasMore: boolean }> {
  const offset = (filters.page - 1) * CODES_PER_PAGE;
  const rows = await query<CodeListRow>(
    `select ${CODE_COLUMNS}
     from qr_codes c
     join qr_users u on u.id = c.user_id
     where ($1 = '' or c.short_code = $1 or c.name ilike $2
            or c.destination_url ilike $2 or u.email ilike $2)
       and (case
              when $3 = '' then c.archived_at is null
              when $3 = 'archived' then c.archived_at is not null
              else c.archived_at is null and c.status = $3
            end)
       and ($4 = '' or c.kind = $4)
       and ($5 <> 'reported' or exists (
             select 1 from qr_abuse_reports r where r.qr_id = c.id and r.status = 'open'))
       and ($5 <> 'changed' or exists (
             select 1 from qr_destination_history h
             where h.qr_id = c.id and h.changed_at > now() - interval '24 hours'))
     order by c.created_at desc, c.id desc
     limit $6 offset $7`,
    [
      filters.q,
      likeContains(filters.q),
      filters.status ?? "",
      filters.kind ?? "",
      filters.flag ?? "",
      CODES_PER_PAGE + 1,
      offset,
    ]
  );
  return {
    rows: rows.slice(0, CODES_PER_PAGE).map(toStaffCodeRow),
    hasMore: rows.length > CODES_PER_PAGE,
  };
}

export type StaffCodeDetail = StaffCodeRow & {
  blockedReason: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
  hostedPage: boolean;
};

export async function getStaffCode(id: number): Promise<StaffCodeDetail | null> {
  const row = await queryOne<
    CodeListRow & { blocked_reason: string | null; archived_at: Date | null; updated_at: Date }
  >(
    `select ${CODE_COLUMNS}, c.blocked_reason, c.archived_at, c.updated_at
     from qr_codes c
     join qr_users u on u.id = c.user_id
     where c.id = $1`,
    [id]
  );
  if (!row) return null;
  return {
    ...toStaffCodeRow(row),
    blockedReason: row.blocked_reason,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    hostedPage: isPageKind(row.kind),
  };
}

export type DestinationChange = {
  oldUrl: string | null;
  newUrl: string;
  changedBy: string | null;
  changedAt: Date;
};

export async function destinationChanges(qrId: number, limit = 50): Promise<DestinationChange[]> {
  const rows = await query<{
    old_url: string | null;
    new_url: string;
    changed_by: string | null;
    changed_at: Date;
  }>(
    `select h.old_url, h.new_url, u.email as changed_by, h.changed_at
     from qr_destination_history h
     left join qr_users u on u.id = h.changed_by
     where h.qr_id = $1
     order by h.changed_at desc
     limit $2`,
    [qrId, limit]
  );
  return rows.map((row) => ({
    oldUrl: row.old_url,
    newUrl: row.new_url,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
  }));
}

export type AbuseReport = {
  id: number;
  reporterEmail: string | null;
  reason: string;
  status: "open" | "actioned" | "dismissed";
  createdAt: Date;
};

export async function codeReports(qrId: number): Promise<AbuseReport[]> {
  const rows = await query<{
    id: string;
    reporter_email: string | null;
    reason: string;
    status: AbuseReport["status"];
    created_at: Date;
  }>(
    `select id, reporter_email, reason, status, created_at
     from qr_abuse_reports where qr_id = $1
     order by created_at desc
     limit 50`,
    [qrId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    reporterEmail: row.reporter_email,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export type StaffAction = {
  action: string;
  actor: string | null;
  detail: Record<string, unknown>;
  createdAt: Date;
};

/**
 * What staff have done to one target, newest first. Views are left out: this
 * is the history of changes, and a page view on every load would bury it.
 */
export async function staffActions(
  targetType: "code" | "customer",
  targetId: string,
  limit = 30
): Promise<StaffAction[]> {
  const rows = await query<{
    action: string;
    actor: string | null;
    detail: Record<string, unknown>;
    created_at: Date;
  }>(
    `select a.action, u.email as actor, a.detail, a.created_at
     from qr_admin_audit a
     left join qr_users u on u.id = a.actor_id
     where a.target_type = $1 and a.target_id = $2 and a.action not in ('view', 'search')
     order by a.created_at desc
     limit $3`,
    [targetType, targetId, limit]
  );
  return rows.map((row) => ({
    action: row.action,
    actor: row.actor,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

/** Whether Neon Auth still holds a sign-in account for this id. */
export async function hasSignInAccount(userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(`select id from neon_auth."user" where id = $1`, [userId]);
  return row !== null;
}

// ---------------------------------------------------------------------------
// Code writes. Each returns the short code it changed, or null when the code
// was not in a state the action applies to.
// ---------------------------------------------------------------------------

async function purgeAll(shortCodes: string[]): Promise<void> {
  // Best effort, as everywhere else: the cache expires on its own, and a
  // Redis outage must not report a change that landed as one that failed.
  await Promise.allSettled(shortCodes.map((code) => purgeDestination(code)));
}

async function changeCode(sql: string, params: unknown[]): Promise<string | null> {
  const row = await queryOne<{ short_code: string }>(sql, params);
  if (!row) return null;
  await purgeAll([row.short_code]);
  return row.short_code;
}

/** Block a code. The scanner sees the "disabled for safety" page; the owner sees the reason. */
export function blockCode(id: number, reason: string): Promise<string | null> {
  return changeCode(
    `update qr_codes set status = 'blocked', blocked_reason = $2, updated_at = now()
     where id = $1 and status <> 'blocked'
     returning short_code`,
    [id, reason]
  );
}

/**
 * Lift a block and put the code live again: staff have judged the destination
 * fine. An archived code stays out of service until it is unarchived.
 */
export function unblockCode(id: number): Promise<string | null> {
  return changeCode(
    `update qr_codes set status = 'active', blocked_reason = null, updated_at = now()
     where id = $1 and status = 'blocked'
     returning short_code`,
    [id]
  );
}

/** Pause or resume on the owner's behalf. Never touches a block or an archive. */
export function setCodeStatusAsStaff(id: number, status: "active" | "paused"): Promise<string | null> {
  return changeCode(
    `update qr_codes set status = $2, updated_at = now()
     where id = $1 and status <> 'blocked' and status <> $2 and archived_at is null
     returning short_code`,
    [id, status]
  );
}

/**
 * Archive: out of service and out of the owner's dashboard, and no longer
 * counted against their plan. Set `paused` as well (unless blocked), so a
 * redirect cache entry or build from before migration 017 still never
 * redirects it.
 */
export function archiveCode(id: number): Promise<string | null> {
  return changeCode(
    `update qr_codes
        set archived_at = now(),
            status = case when status = 'blocked' then 'blocked' else 'paused' end,
            updated_at = now()
      where id = $1 and archived_at is null
      returning short_code`,
    [id]
  );
}

/**
 * Bring an archived code back to its owner's dashboard. It returns paused, so
 * nothing serves until someone decides it should. Refused for an erased
 * account, whose codes have nothing left to bring back.
 */
export function unarchiveCode(id: number): Promise<string | null> {
  return changeCode(
    `update qr_codes c set archived_at = null, updated_at = now()
     from qr_users u
     where c.id = $1 and c.archived_at is not null
       and u.id = c.user_id and u.erased_at is null and u.archived_at is null
     returning c.short_code`,
    [id]
  );
}

export type ScreenOutcome = {
  hosted: boolean;
  screen: { ok: true } | { ok: false; reason: string };
  reputation: ReputationVerdict | null;
};

/**
 * Run a code's destination through the checks a new destination gets today.
 * A hosted page has no outside destination: its links were screened when the
 * owner saved them.
 */
export async function rescreenCode(id: number): Promise<ScreenOutcome | null> {
  const row = await queryOne<{ kind: string; destination_url: string }>(
    `select kind, destination_url from qr_codes where id = $1`,
    [id]
  );
  if (!row) return null;
  if (isPageKind(row.kind)) return { hosted: true, screen: { ok: true }, reputation: null };

  const screened = screenUrl(row.destination_url);
  return {
    hosted: false,
    screen: screened.ok ? { ok: true } : { ok: false, reason: screened.reason },
    reputation: screened.ok ? await checkReputation(screened.normalised) : null,
  };
}

// ---------------------------------------------------------------------------
// Account writes.
// ---------------------------------------------------------------------------

async function shortCodesOf(userId: string): Promise<string[]> {
  const rows = await query<{ short_code: string }>(
    `select short_code from qr_codes where user_id = $1`,
    [userId]
  );
  return rows.map((row) => row.short_code);
}

/**
 * Suspend: every code the account owns shows the paused page, and the owner
 * can still sign in to see why. Distinct from Neon Auth's `banned`.
 */
export async function suspendAccount(userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_users set suspended_at = now(), updated_at = now()
     where id = $1 and suspended_at is null and erased_at is null
     returning id`,
    [userId]
  );
  if (!row) return false;
  await purgeAll(await shortCodesOf(userId));
  return true;
}

/** Lift a suspension. An archived account is unarchived first, deliberately. */
export async function unsuspendAccount(userId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_users set suspended_at = null, updated_at = now()
     where id = $1 and suspended_at is not null and archived_at is null and erased_at is null
     returning id`,
    [userId]
  );
  if (!row) return false;
  await purgeAll(await shortCodesOf(userId));
  return true;
}

/** Block every code the account owns that is not already blocked. Returns how many. */
export async function blockAllCodes(userId: string, reason: string): Promise<number> {
  const rows = await query<{ short_code: string }>(
    `update qr_codes set status = 'blocked', blocked_reason = $2, updated_at = now()
     where user_id = $1 and status <> 'blocked'
     returning short_code`,
    [userId, reason]
  );
  await purgeAll(rows.map((row) => row.short_code));
  return rows.length;
}

/**
 * Archive an account: suspend it and archive every code it holds, all with
 * one timestamp so unarchiving can find exactly these codes.
 */
export async function archiveAccount(userId: string): Promise<number | null> {
  const archived = await withTransaction(async (run) => {
    const account = await run<{ archived_at: Date }>(
      `update qr_users
          set archived_at = now(), suspended_at = coalesce(suspended_at, now()), updated_at = now()
        where id = $1 and archived_at is null and erased_at is null
        returning archived_at`,
      [userId]
    );
    if (!account[0]) return null;
    return run<{ short_code: string }>(
      `update qr_codes
          set archived_at = $2,
              status = case when status = 'blocked' then 'blocked' else 'paused' end,
              updated_at = now()
        where user_id = $1 and archived_at is null
        returning short_code`,
      [userId, account[0].archived_at]
    );
  });
  if (!archived) return null;
  await purgeAll(archived.map((row) => row.short_code));
  return archived.length;
}

/**
 * Undo an archive: the account and the codes archived with it come back,
 * paused. Codes staff archived on their own beforehand stay archived, and the
 * suspension stays until staff lift it, so nothing serves by surprise.
 */
export async function unarchiveAccount(userId: string): Promise<number | null> {
  const restored = await withTransaction(async (run) => {
    const account = await run<{ archived_at: Date }>(
      `select archived_at from qr_users
        where id = $1 and archived_at is not null and erased_at is null
        for update`,
      [userId]
    );
    if (!account[0]) return null;
    const codes = await run<{ short_code: string }>(
      `update qr_codes set archived_at = null, updated_at = now()
        where user_id = $1 and archived_at = $2
        returning short_code`,
      [userId, account[0].archived_at]
    );
    await run(`update qr_users set archived_at = null, updated_at = now() where id = $1`, [userId]);
    return codes;
  });
  if (!restored) return null;
  await purgeAll(restored.map((row) => row.short_code));
  return restored.length;
}

export type ErasePrecheck = {
  email: string;
  erased: boolean;
  liveViaPaystack: boolean;
};

export async function erasePrecheck(userId: string): Promise<ErasePrecheck | null> {
  const row = await queryOne<{ email: string; erased: boolean; live_via_paystack: boolean }>(
    `select u.email, u.erased_at is not null as erased,
            exists (select 1 from qr_subscriptions s
                    where s.user_id = u.id and s.status in ('active', 'past_due')
                      and s.paystack_subscription_code is not null) as live_via_paystack
     from qr_users u where u.id = $1`,
    [userId]
  );
  return row ? { email: row.email, erased: row.erased, liveViaPaystack: row.live_via_paystack } : null;
}

export type EraseResult =
  | { ok: true; codes: number; fileKeys: string[] }
  | { ok: false; error: string };

/**
 * Erase an account's personal data and content, for good.
 *
 * Every row that holds what the customer wrote, uploaded or collected is
 * deleted or blanked: scans and their rollup, destination history, feedback,
 * files and logos, each code's name, destination, content and style, and the
 * profile's name, email and Paystack customer code. What remains is a
 * skeleton: the profile row and each code row, anonymous, so the foreign keys
 * hold and every short code stays reserved. Its codes answer as unknown.
 *
 * Kept: subscription rows (financial records, with no personal data once the
 * email token is cleared), abuse reports (the reporter's, not the account's)
 * and the staff audit trail.
 *
 * Returns the UploadThing keys of the deleted files, for the caller to remove
 * from storage once this has committed. The sign-in account in Neon Auth is
 * removed by the caller too, after this, because it needs the staff session.
 */
export async function eraseAccountData(userId: string): Promise<EraseResult> {
  const result = await withTransaction(async (run) => {
    const account = await run<{ id: string }>(
      `select id from qr_users where id = $1 and erased_at is null for update`,
      [userId]
    );
    if (!account[0]) return { ok: false as const, error: "This account has already been erased." };

    // Re-checked under the lock: a checkout could have completed since the page loaded.
    const paying = await run<{ id: string }>(
      `select id from qr_subscriptions
        where user_id = $1 and status in ('active', 'past_due') and paystack_subscription_code is not null`,
      [userId]
    );
    if (paying[0]) {
      return { ok: false as const, error: "This account started paying through Paystack. Cancel that first." };
    }

    const files = await run<{ file_key: string }>(
      `select file_key from qr_files where user_id = $1
       union
       select file_key from qr_logos where user_id = $1`,
      [userId]
    );

    const owned = `select id from qr_codes where user_id = $1`;
    await run(`delete from qr_scans where qr_id in (${owned})`, [userId]);
    await run(`delete from qr_scan_daily where qr_id in (${owned})`, [userId]);
    await run(`delete from qr_destination_history where qr_id in (${owned})`, [userId]);
    await run(`delete from qr_feedback where qr_id in (${owned})`, [userId]);
    await run(`update qr_destination_history set changed_by = null where changed_by = $1`, [userId]);

    const codes = await run<{ short_code: string }>(
      `update qr_codes
          set name = 'Erased', destination_url = '', content = null, style = '{}'::jsonb,
              logo_id = null, logo_key = null,
              archived_at = coalesce(archived_at, now()),
              status = case when status = 'blocked' then 'blocked' else 'paused' end,
              updated_at = now()
        where user_id = $1
        returning short_code`,
      [userId]
    );

    await run(`delete from qr_logos where user_id = $1`, [userId]);
    await run(`delete from qr_files where user_id = $1`, [userId]);
    await run(
      `update qr_subscriptions
          set status = case when status in ('active', 'past_due') then 'cancelled' else status end,
              paystack_email_token = null, updated_at = now()
        where user_id = $1`,
      [userId]
    );
    await run(
      `update qr_users
          set email = '', name = '', paystack_customer_code = null,
              suspended_at = coalesce(suspended_at, now()),
              archived_at = coalesce(archived_at, now()),
              erased_at = now(), updated_at = now()
        where id = $1`,
      [userId]
    );

    return {
      ok: true as const,
      shortCodes: codes.map((row) => row.short_code),
      fileKeys: files.map((row) => row.file_key),
    };
  });

  if (!result.ok) return result;
  await purgeAll(result.shortCodes);
  return { ok: true, codes: result.shortCodes.length, fileKeys: result.fileKeys };
}
