import { query, queryOne } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { generateCode } from "@/lib/short-code";
import { screenUrl } from "@/lib/screening";
import { canCreateCode, getEntitlement } from "@/lib/plan";

/**
 * Everything the signed-in owner can do to their own codes.
 *
 * Deliberately separate from `src/lib/codes.ts`, which is the redirect path.
 * Nothing here is ever imported by `app/[code]/route.ts`, and
 * `src/__tests__/redirect-isolation.test.ts` is what keeps that true.
 *
 * **Every query filters by `user_id`.** Not as a convention but as the rule:
 * an id in a URL is a guess until the database has agreed it belongs to the
 * session. There is no "fetch then check" anywhere in this file.
 */

/** A code as its owner sees it, with the scan counts the list needs. */
export type OwnedCode = {
  id: string;
  shortCode: string;
  name: string;
  destinationUrl: string;
  status: "active" | "paused" | "blocked";
  blockedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  scansToday: number;
  scans7d: number;
  scans30d: number;
};

/** The owner may move a code between these two. `blocked` is an admin verdict. */
export type OwnerStatus = "active" | "paused";

type CodeRow = {
  id: string;
  short_code: string;
  name: string;
  destination_url: string;
  status: OwnedCode["status"];
  blocked_reason: string | null;
  created_at: Date;
  updated_at: Date;
  scans_today: string;
  scans_7d: string;
  scans_30d: string;
};

function toOwnedCode(row: CodeRow): OwnedCode {
  return {
    id: String(row.id),
    shortCode: row.short_code,
    name: row.name,
    destinationUrl: row.destination_url,
    status: row.status,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scansToday: Number(row.scans_today),
    scans7d: Number(row.scans_7d),
    scans30d: Number(row.scans_30d),
  };
}

/**
 * Scan totals, counted from `qr_scans` rather than the `qr_scan_daily` rollup.
 *
 * The rollup table has no writer yet and carries no country or device columns,
 * so it cannot answer the questions this dashboard asks. Building it, plus the
 * retention sweep that prunes raw rows per the plan's `history_days`, is still
 * outstanding phase 4 work. Until then these read the raw table, which the
 * `(qr_id, scanned_at desc)` index serves well at this scale.
 *
 * Bots are excluded everywhere. A WhatsApp link preview is not a scan.
 */
const COUNTS = `
  coalesce(count(*) filter (
    where not s.is_bot and s.scanned_at >= date_trunc('day', now())
  ), 0) as scans_today,
  coalesce(count(*) filter (
    where not s.is_bot and s.scanned_at >= now() - interval '7 days'
  ), 0) as scans_7d,
  coalesce(count(*) filter (
    where not s.is_bot and s.scanned_at >= now() - interval '30 days'
  ), 0) as scans_30d
`;

export async function listCodes(userId: string): Promise<OwnedCode[]> {
  const rows = await query<CodeRow>(
    `select
       c.id, c.short_code, c.name, c.destination_url, c.status,
       c.blocked_reason, c.created_at, c.updated_at,
       ${COUNTS}
     from qr_codes c
     left join qr_scans s on s.qr_id = c.id
     where c.user_id = $1
     group by c.id
     order by c.created_at desc`,
    [userId]
  );
  return rows.map(toOwnedCode);
}

export async function getCode(
  userId: string,
  id: string
): Promise<OwnedCode | null> {
  const row = await queryOne<CodeRow>(
    `select
       c.id, c.short_code, c.name, c.destination_url, c.status,
       c.blocked_reason, c.created_at, c.updated_at,
       ${COUNTS}
     from qr_codes c
     left join qr_scans s on s.qr_id = c.id
     where c.user_id = $1 and c.id = $2
     group by c.id`,
    [userId, id]
  );
  return row ? toOwnedCode(row) : null;
}

export type CreateResult =
  | { ok: true; id: string; shortCode: string }
  | { ok: false; reason: string };

/**
 * Allocate a short code and save it.
 *
 * The collision strategy is the one the generator documents: never check
 * first, because checking races. Insert against the unique index and retry on
 * violation. Five attempts against a 58^7 space is already far past paranoid.
 */
export async function createCode(
  userId: string,
  input: { name: string; destinationUrl: string }
): Promise<CreateResult> {
  const screened = screenUrl(input.destinationUrl);
  if (!screened.ok) return { ok: false, reason: screened.reason };

  const allowed = canCreateCode(await getEntitlement(userId));
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  const name = input.name.trim();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shortCode = generateCode();
    try {
      const row = await queryOne<{ id: string }>(
        `insert into qr_codes (user_id, short_code, name, destination_url)
         values ($1, $2, $3, $4)
         returning id`,
        [userId, shortCode, name, screened.normalised]
      );
      // A fresh code has no history row: there is no previous destination to
      // record, and inventing one would make the log lie about a change that
      // never happened.
      return { ok: true, id: String(row!.id), shortCode };
    } catch (error) {
      const collided =
        error instanceof Error &&
        error.message.includes("qr_codes_short_code_key");
      if (!collided) throw error;
    }
  }

  return {
    ok: false,
    reason: "Could not allocate a short code. Please try again.",
  };
}

export async function renameCode(
  userId: string,
  id: string,
  name: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_codes set name = $3, updated_at = now()
     where user_id = $1 and id = $2
     returning id`,
    [userId, id, name.trim()]
  );
  // The name is never on the redirect path, so no cache purge is needed.
  return row !== null;
}

export type ChangeResult = { ok: true } | { ok: false; reason: string };

/**
 * Re-point a code, and write what it used to be to `qr_destination_history`.
 *
 * One statement rather than two, because the repo has no transaction helper
 * and a destination change that silently lost its history entry would be worse
 * than one that failed. The CTE reads the old value before the update sees it.
 */
export async function changeDestination(
  userId: string,
  id: string,
  destinationUrl: string
): Promise<ChangeResult> {
  const screened = screenUrl(destinationUrl);
  if (!screened.ok) return { ok: false, reason: screened.reason };

  const row = await queryOne<{ short_code: string }>(
    `with prev as (
       select id, short_code, destination_url
       from qr_codes
       where user_id = $1 and id = $2
     ), updated as (
       update qr_codes c
         set destination_url = $3, updated_at = now()
       from prev
       where c.id = prev.id
       returning c.short_code
     ), logged as (
       insert into qr_destination_history (qr_id, old_url, new_url, changed_by)
       select prev.id, prev.destination_url, $3, $1 from prev
     )
     select short_code from updated`,
    [userId, id, screened.normalised]
  );

  if (!row) return { ok: false, reason: "That code could not be found." };

  // The redirect path caches destinations for 60 seconds. Purging drops this
  // instance's copy immediately; other instances wait out the TTL.
  await purgeDestination(row.short_code);
  return { ok: true };
}

/**
 * Pause or resume. The owner can never set `blocked`, which is an admin
 * verdict about a destination, not a preference — hence `OwnerStatus`.
 *
 * A blocked code is also refused here: lifting a block is an admin action and
 * must not be reachable from the owner's own dashboard.
 */
export async function setStatus(
  userId: string,
  id: string,
  status: OwnerStatus
): Promise<boolean> {
  const row = await queryOne<{ short_code: string }>(
    `update qr_codes set status = $3, updated_at = now()
     where user_id = $1 and id = $2 and status <> 'blocked'
     returning short_code`,
    [userId, id, status]
  );
  if (!row) return false;

  await purgeDestination(row.short_code);
  return true;
}

export type HistoryEntry = {
  oldUrl: string | null;
  newUrl: string;
  changedAt: Date;
};

export async function destinationHistory(
  userId: string,
  id: string
): Promise<HistoryEntry[]> {
  const rows = await query<{
    old_url: string | null;
    new_url: string;
    changed_at: Date;
  }>(
    `select h.old_url, h.new_url, h.changed_at
     from qr_destination_history h
     join qr_codes c on c.id = h.qr_id
     where c.user_id = $1 and h.qr_id = $2
     order by h.changed_at desc
     limit 50`,
    [userId, id]
  );
  return rows.map((r) => ({
    oldUrl: r.old_url,
    newUrl: r.new_url,
    changedAt: r.changed_at,
  }));
}

/** The only windows the analytics queries will accept. */
export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

/**
 * Clamp a requested range to a known window.
 *
 * This is a security boundary, not a convenience. Postgres will not take a
 * bound parameter inside an `interval` literal, so the number below is
 * interpolated into SQL — which is safe only because nothing but 7, 30 or 90
 * can ever come out of here. Anything else, including `NaN` from a malformed
 * query string, collapses to 30.
 */
export function analyticsWindow(days: number): AnalyticsWindow {
  return (ANALYTICS_WINDOWS as readonly number[]).includes(days)
    ? (days as AnalyticsWindow)
    : 30;
}

/** One day's scans, for the chart. Days with no scans are present and zero. */
export type DayPoint = { day: string; scans: number };

/** A share of scans by some dimension, biggest first. */
export type Slice = { label: string; scans: number };

export type Analytics = {
  days: DayPoint[];
  countries: Slice[];
  devices: Slice[];
  total: number;
};

/**
 * Scans by day, country and device for one code.
 *
 * `generate_series` fills the gaps: a chart that silently omits quiet days
 * compresses time and makes a flat week look busy. Every day in the window is
 * present whether or not anything scanned.
 *
 * Bots are excluded, consistent with the list totals.
 */
export async function codeAnalytics(
  userId: string,
  id: string,
  days: number
): Promise<Analytics> {
  const window = analyticsWindow(days);

  const owns = await queryOne<{ id: string }>(
    `select id from qr_codes where user_id = $1 and id = $2`,
    [userId, id]
  );
  if (!owns) return { days: [], countries: [], devices: [], total: 0 };

  const [dayRows, countryRows, deviceRows] = await Promise.all([
    query<{ day: Date; scans: string }>(
      `select d.day::date as day,
              coalesce(count(s.id) filter (where not s.is_bot), 0) as scans
       from generate_series(
              date_trunc('day', now()) - interval '${window - 1} days',
              date_trunc('day', now()),
              interval '1 day'
            ) as d(day)
       left join qr_scans s
         on s.qr_id = $1
        and s.scanned_at >= d.day
        and s.scanned_at <  d.day + interval '1 day'
       group by d.day
       order by d.day`,
      [id]
    ),
    query<{ label: string | null; scans: string }>(
      `select country as label, count(*) as scans
       from qr_scans
       where qr_id = $1 and not is_bot
         and scanned_at >= now() - interval '${window} days'
       group by country
       order by count(*) desc
       limit 10`,
      [id]
    ),
    query<{ label: string | null; scans: string }>(
      `select device_type as label, count(*) as scans
       from qr_scans
       where qr_id = $1 and not is_bot
         and scanned_at >= now() - interval '${window} days'
       group by device_type
       order by count(*) desc
       limit 10`,
      [id]
    ),
  ]);

  const dayPoints = dayRows.map((r) => ({
    day: r.day.toISOString().slice(0, 10),
    scans: Number(r.scans),
  }));

  // "Unknown" rather than a blank row: geo is a deliberate stub on hosts that
  // do not supply a country header, and a nameless slice reads as a bug.
  const toSlices = (rows: { label: string | null; scans: string }[]): Slice[] =>
    rows.map((r) => ({ label: r.label ?? "Unknown", scans: Number(r.scans) }));

  return {
    days: dayPoints,
    countries: toSlices(countryRows),
    devices: toSlices(deviceRows),
    total: dayPoints.reduce((sum, point) => sum + point.scans, 0),
  };
}

/** Raw scan rows for CSV export, newest first. Never includes the IP hash. */
export async function scanRows(
  userId: string,
  id: string,
  days: number
): Promise<
  { scannedAt: Date; country: string | null; device: string | null; os: string | null; browser: string | null }[]
> {
  const window = analyticsWindow(days);

  const rows = await query<{
    scanned_at: Date;
    country: string | null;
    device_type: string | null;
    os: string | null;
    browser: string | null;
  }>(
    `select s.scanned_at, s.country, s.device_type, s.os, s.browser
     from qr_scans s
     join qr_codes c on c.id = s.qr_id
     where c.user_id = $1 and s.qr_id = $2 and not s.is_bot
       and s.scanned_at >= now() - interval '${window} days'
     order by s.scanned_at desc
     limit 10000`,
    [userId, id]
  );

  return rows.map((r) => ({
    scannedAt: r.scanned_at,
    country: r.country,
    device: r.device_type,
    os: r.os,
    browser: r.browser,
  }));
}
