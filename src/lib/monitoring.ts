import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { LINK_KINDS } from "@/lib/qr-types";
import { screenUrl } from "@/lib/screening";

/**
 * What staff watch: the abuse-report queue, and lists of codes behaving in
 * ways abuse tends to: a sudden burst of scans, a new account re-pointing its
 * codes, a destination today's screening rules would refuse, and repeated
 * reports. Every list is a prompt to look, never a verdict; staff act on the
 * code's own page.
 */

// ---------------------------------------------------------------------------
// Pure rules, tested directly.
// ---------------------------------------------------------------------------

/** A spike needs at least this many scans today, so a quiet code going from 1 to 6 is not one. */
export const SPIKE_MIN_SCANS = 50;
/** And at least this many times its daily average over the previous seven days. */
export const SPIKE_FACTOR = 5;

/**
 * Today's scans so far against a full day's average, which can only
 * understate today: a spike flagged at noon is a real one.
 */
export function isSpike(today: number, dailyAverage: number): boolean {
  return today >= Math.max(SPIKE_MIN_SCANS, SPIKE_FACTOR * dailyAverage);
}

/** An account counts as new for this long when it re-points a code. */
export const NEW_ACCOUNT_DAYS = 14;

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

const single = (value: unknown) => (Array.isArray(value) ? value[0] : value);
export const reportStatusSchema = z.preprocess(single, z.enum(REPORT_STATUSES)).catch("open");

// ---------------------------------------------------------------------------
// The abuse-report queue.
// ---------------------------------------------------------------------------

export type QueuedReport = {
  id: number;
  reportedCode: string;
  reporterEmail: string | null;
  reason: string;
  status: ReportStatus;
  createdAt: Date;
  /** Null when the report names a code that does not exist, or one that has gone. */
  code: {
    id: number;
    name: string;
    kind: string;
    destinationUrl: string;
    status: "active" | "paused" | "blocked";
    archived: boolean;
    ownerId: string;
    ownerEmail: string;
    ownerErased: boolean;
    openReports: number;
  } | null;
};

/** Reports in one state. Open ones oldest first, so nothing waits forever; closed ones newest first. */
export async function listReports(status: ReportStatus, limit = 100): Promise<QueuedReport[]> {
  const rows = await query<{
    id: string;
    reported_code: string;
    reporter_email: string | null;
    reason: string;
    status: ReportStatus;
    created_at: Date;
    qr_id: string | null;
    name: string | null;
    kind: string | null;
    destination_url: string | null;
    code_status: "active" | "paused" | "blocked" | null;
    archived: boolean | null;
    owner_id: string | null;
    owner_email: string | null;
    owner_erased: boolean | null;
    open_reports: string | null;
  }>(
    `select r.id, r.reported_code, r.reporter_email, r.reason, r.status, r.created_at,
            c.id as qr_id, c.name, c.kind, c.destination_url, c.status as code_status,
            c.archived_at is not null as archived,
            u.id as owner_id, u.email as owner_email, u.erased_at is not null as owner_erased,
            (select count(*) from qr_abuse_reports o where o.qr_id = c.id and o.status = 'open') as open_reports
     from qr_abuse_reports r
     left join qr_codes c on c.id = r.qr_id
     left join qr_users u on u.id = c.user_id
     where r.status = $1
     order by case when $1 = 'open' then r.created_at end asc,
              r.created_at desc
     limit $2`,
    [status, limit]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    reportedCode: row.reported_code,
    reporterEmail: row.reporter_email,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    code:
      row.qr_id === null
        ? null
        : {
            id: Number(row.qr_id),
            name: row.name!,
            kind: row.kind!,
            destinationUrl: row.destination_url!,
            status: row.code_status!,
            archived: row.archived === true,
            ownerId: row.owner_id!,
            ownerEmail: row.owner_email!,
            ownerErased: row.owner_erased === true,
            openReports: Number(row.open_reports ?? 0),
          },
  }));
}

/** Close an open report. Returns the code it named, for the audit row. */
export async function closeReport(
  id: number,
  status: "actioned" | "dismissed"
): Promise<{ reportedCode: string } | null> {
  return queryOne<{ reportedCode: string }>(
    `update qr_abuse_reports set status = $2
     where id = $1 and status = 'open'
     returning reported_code as "reportedCode"`,
    [id, status]
  );
}

export async function openReportCount(): Promise<number> {
  const row = await queryOne<{ n: string }>(`select count(*) as n from qr_abuse_reports where status = 'open'`);
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Watch lists.
// ---------------------------------------------------------------------------

export type WatchedCode = {
  id: number;
  shortCode: string;
  name: string;
  kind: string;
  destinationUrl: string;
  ownerId: string;
  ownerEmail: string;
};

type WatchedRow = {
  id: string;
  short_code: string;
  name: string;
  kind: string;
  destination_url: string;
  owner_id: string;
  owner_email: string;
};

const WATCHED_COLUMNS = `c.id, c.short_code, c.name, c.kind, c.destination_url,
  u.id as owner_id, u.email as owner_email`;

function toWatched(row: WatchedRow): WatchedCode {
  return {
    id: Number(row.id),
    shortCode: row.short_code,
    name: row.name,
    kind: row.kind,
    destinationUrl: row.destination_url,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
  };
}

const UTC_TODAY = `(now() at time zone 'UTC')::date`;

/**
 * Codes scanned far more today than usual, judged as `isSpike` judges: today's
 * raw scans against the rollup's daily average over the previous seven days.
 * Archived codes are left out; a blocked one is kept, since a blocked code
 * still being scanned hard says the artwork is out there.
 */
export async function scanSpikes(limit = 20): Promise<(WatchedCode & { today: number; average: number })[]> {
  const rows = await query<WatchedRow & { today: string; average: string }>(
    `with today as (
       select qr_id, count(*) as n from qr_scans
       where not is_bot and scanned_at >= ${UTC_TODAY}
       group by qr_id
     ),
     base as (
       select qr_id, sum(scans) / 7.0 as average from qr_scan_daily
       where day >= ${UTC_TODAY} - 7 and day < ${UTC_TODAY}
       group by qr_id
     )
     select ${WATCHED_COLUMNS}, t.n as today, coalesce(b.average, 0) as average
     from today t
     join qr_codes c on c.id = t.qr_id and c.archived_at is null
     join qr_users u on u.id = c.user_id
     left join base b on b.qr_id = t.qr_id
     where t.n >= greatest($1, $2 * coalesce(b.average, 0))
     order by t.n desc
     limit $3`,
    [SPIKE_MIN_SCANS, SPIKE_FACTOR, limit]
  );
  return rows.map((row) => ({ ...toWatched(row), today: Number(row.today), average: Number(row.average) }));
}

/**
 * Codes on new accounts whose destination changed in the last week. Making a
 * code with a harmless link and re-pointing it once it is printed or shared is
 * the oldest trick a dynamic code allows.
 */
export async function newAccountChanges(
  limit = 20
): Promise<(WatchedCode & { changedAt: Date; changes: number; accountCreatedAt: Date })[]> {
  const rows = await query<WatchedRow & { changed_at: Date; changes: string; account_created_at: Date }>(
    `select ${WATCHED_COLUMNS}, h.changed_at, h.changes, u.created_at as account_created_at
     from (
       select qr_id, max(changed_at) as changed_at, count(*) as changes
       from qr_destination_history
       where changed_at > now() - interval '7 days'
       group by qr_id
     ) h
     join qr_codes c on c.id = h.qr_id and c.archived_at is null and c.status <> 'blocked'
     join qr_users u on u.id = c.user_id
     where u.created_at > now() - make_interval(days => $1)
     order by h.changed_at desc
     limit $2`,
    [NEW_ACCOUNT_DAYS, limit]
  );
  return rows.map((row) => ({
    ...toWatched(row),
    changedAt: row.changed_at,
    changes: Number(row.changes),
    accountCreatedAt: row.account_created_at,
  }));
}

/** How many live link codes `failingDestinations` checks per page load, newest first. */
export const SCREEN_SAMPLE = 5000;

/**
 * Live link codes whose destination today's screening rules would refuse:
 * saved before a rule existed, or before a list grew. Screening is pure and
 * cheap, so this runs on page load over the newest `SCREEN_SAMPLE` live codes
 * rather than waiting on a cron.
 */
export async function failingDestinations(
  limit = 50
): Promise<{ codes: (WatchedCode & { reason: string })[]; checked: number }> {
  const rows = await query<WatchedRow>(
    `select ${WATCHED_COLUMNS}
     from qr_codes c
     join qr_users u on u.id = c.user_id
     where c.status = 'active' and c.archived_at is null and c.kind = any($1::text[])
     order by c.created_at desc
     limit $2`,
    [LINK_KINDS as readonly string[], SCREEN_SAMPLE]
  );
  const failing: (WatchedCode & { reason: string })[] = [];
  for (const row of rows) {
    const screened = screenUrl(row.destination_url);
    if (!screened.ok) {
      failing.push({ ...toWatched(row), reason: screened.reason });
      if (failing.length >= limit) break;
    }
  }
  return { codes: failing, checked: rows.length };
}

/** Codes with two or more open reports, most reported first. */
export async function mostReported(limit = 20): Promise<(WatchedCode & { openReports: number })[]> {
  const rows = await query<WatchedRow & { open_reports: string }>(
    `select ${WATCHED_COLUMNS}, r.n as open_reports
     from (
       select qr_id, count(*) as n from qr_abuse_reports
       where status = 'open' and qr_id is not null
       group by qr_id having count(*) >= 2
     ) r
     join qr_codes c on c.id = r.qr_id
     join qr_users u on u.id = c.user_id
     order by r.n desc
     limit $1`,
    [limit]
  );
  return rows.map((row) => ({ ...toWatched(row), openReports: Number(row.open_reports) }));
}
