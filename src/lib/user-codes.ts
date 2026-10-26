import { query, queryOne } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { generateCode } from "@/lib/short-code";
import { linkDestination, parsePageContent, type PageContent } from "@/lib/page-content";
import { resolveFiles } from "@/lib/files";
import {
  isLinkKind,
  isPageKind,
  pagePath,
  type DynamicKind,
  type LinkKind,
  type PageKind,
} from "@/lib/qr-types";
import { canCreateCode, getEntitlement } from "@/lib/entitlement";
import { readQrStyle, type QrStyle } from "@/lib/qr-style";
import { ownsLiveLogo } from "@/lib/logos";

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

/**
 * Validate an id out of a URL before it reaches a query.
 *
 * `qr_codes.id` is `bigserial`, so `where c.id = $2` with a non-numeric value
 * does not return no rows -- Postgres raises `invalid input syntax for type
 * bigint` and the request becomes a 500. `/app/anything` is a perfectly
 * ordinary thing for a stale link or a crawler to ask for, and it has to be a
 * 404. Every entry point that takes an id from a URL parses it here first.
 *
 * Capped at 19 digits, the width of a signed 64-bit integer, so an absurdly
 * long run of digits is also a miss rather than an overflow error.
 */
export function parseCodeId(raw: string): string | null {
  return /^[1-9]\d{0,18}$/.test(raw) ? raw : null;
}

/** A code as its owner sees it, with the scan counts the list needs. */
export type OwnedCode = {
  id: string;
  shortCode: string;
  name: string;
  /** What the code is: a link type, or a page type we host. */
  kind: DynamicKind;
  /**
   * For a link type, where scans go. For a page type, our own relative
   * `/p/{short_code}` -- the content is in `content`.
   */
  destinationUrl: string;
  /** A page type's stored content, unparsed. Null for link types. */
  content: unknown;
  status: "active" | "paused" | "blocked";
  blockedReason: string | null;
  /** Always safe to draw: a missing or invalid stored value reads as the default. */
  style: QrStyle;
  /** The logo drawn in the middle, if any. Still shown if since archived. */
  logo: { id: string; url: string } | null;
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
  kind: DynamicKind;
  destination_url: string;
  content: unknown;
  status: OwnedCode["status"];
  blocked_reason: string | null;
  style: unknown;
  logo_id: string | null;
  logo_url: string | null;
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
    kind: row.kind,
    destinationUrl: row.destination_url,
    content: row.content,
    status: row.status,
    blockedReason: row.blocked_reason,
    style: readQrStyle(row.style),
    logo:
      row.logo_id && row.logo_url
        ? { id: String(row.logo_id), url: row.logo_url }
        : null,
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

/**
 * The code's logo, joined on the owner as well as the id, so a row pointing
 * at another account's logo (which `setCodeLogo` never writes) would draw no
 * logo rather than someone else's.
 */
const LOGO_JOIN = `left join qr_logos l on l.id = c.logo_id and l.user_id = c.user_id`;

export async function listCodes(userId: string): Promise<OwnedCode[]> {
  const rows = await query<CodeRow>(
    `select
       c.id, c.short_code, c.name, c.kind, c.destination_url, c.content, c.status,
       c.blocked_reason, c.style, c.created_at, c.updated_at,
       l.id as logo_id, l.url as logo_url,
       ${COUNTS}
     from qr_codes c
     ${LOGO_JOIN}
     left join qr_scans s on s.qr_id = c.id
     where c.user_id = $1
     group by c.id, l.id
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
       c.id, c.short_code, c.name, c.kind, c.destination_url, c.content, c.status,
       c.blocked_reason, c.style, c.created_at, c.updated_at,
       l.id as logo_id, l.url as logo_url,
       ${COUNTS}
     from qr_codes c
     ${LOGO_JOIN}
     left join qr_scans s on s.qr_id = c.id
     where c.user_id = $1 and c.id = $2
     group by c.id, l.id`,
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
export type CreateInput =
  | { kind: LinkKind; name: string; destinationUrl: string; logoId?: string | null }
  | { kind: PageKind; name: string; content: unknown; logoId?: string | null };

/**
 * Validate what a page type will show: files resolved against the account's
 * own uploads first, then the kind's schema.
 */
async function checkContent(
  userId: string,
  kind: PageKind,
  raw: unknown
): Promise<{ ok: true; content: PageContent } | { ok: false; reason: string }> {
  const resolved = await resolveFiles(userId, raw);
  if (!resolved.ok) return resolved;
  return parsePageContent(kind, resolved.content);
}

export async function createCode(
  userId: string,
  input: CreateInput
): Promise<CreateResult> {
  // A link type's destination is screened. A page type's destination is our
  // own page, built from the short code below; its content is checked here.
  let destination: string | null = null;
  let content: PageContent | null = null;
  if (isLinkKind(input.kind)) {
    const screened = linkDestination(
      input.kind,
      (input as { destinationUrl: string }).destinationUrl
    );
    if (!screened.ok) return { ok: false, reason: screened.reason };
    destination = screened.normalised;
  } else {
    const checked = await checkContent(
      userId,
      input.kind,
      (input as { content: unknown }).content
    );
    if (!checked.ok) return checked;
    content = checked.content;
  }

  const allowed = canCreateCode(await getEntitlement(userId));
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  const logoId = input.logoId ?? null;
  if (logoId && !(await ownsLiveLogo(userId, logoId))) {
    return {
      ok: false,
      reason: "That logo is no longer in your library. Pick another, or upload it again.",
    };
  }

  const name = input.name.trim();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shortCode = generateCode();
    try {
      const row = await queryOne<{ id: string }>(
        `insert into qr_codes
           (user_id, short_code, name, kind, destination_url, content, logo_id)
         values ($1, $2, $3, $4, $5, $6::jsonb, $7::bigint)
         returning id`,
        [
          userId,
          shortCode,
          name,
          input.kind,
          destination ?? pagePath(shortCode),
          content === null ? null : JSON.stringify(content),
          logoId,
        ]
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

/**
 * Save the colours a code's artwork is drawn in.
 *
 * Merged into the `style` object rather than replacing it, so a later key
 * (a logo's placement, say) is not wiped by a colour change. The caller has
 * already run `checkQrStyle`; this only writes.
 *
 * No cache purge: `style` is never read by the redirect path, and changing it
 * changes the image, not where a scan goes.
 */
export async function setCodeStyle(
  userId: string,
  id: string,
  style: QrStyle
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_codes
       set style = style || jsonb_build_object('dark', $3::text, 'light', $4::text),
           updated_at = now()
     where user_id = $1 and id = $2
     returning id`,
    [userId, id, style.dark, style.light]
  );
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
  // The kind decides how the input is read: an Instagram code takes a handle
  // and must stay on Instagram. A page type has no destination to change --
  // its content is edited instead -- so it is refused rather than re-pointed
  // away from its own page.
  const current = await queryOne<{ kind: string }>(
    `select kind from qr_codes where user_id = $1 and id = $2`,
    [userId, id]
  );
  if (!current) return { ok: false, reason: "That code could not be found." };
  if (!isLinkKind(current.kind)) {
    return { ok: false, reason: "This code shows a page. Edit its content instead." };
  }
  const screened = linkDestination(current.kind, destinationUrl);
  if (!screened.ok) return { ok: false, reason: screened.reason };

  const row = await queryOne<{ short_code: string }>(
    `with prev as (
       select id, short_code, destination_url
       from qr_codes
       where user_id = $1 and id = $2 and kind = $4
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
    [userId, id, screened.normalised, current.kind]
  );

  if (!row) return { ok: false, reason: "That code could not be found." };

  // The redirect path caches destinations for 60 seconds. Purging drops this
  // instance's copy immediately; other instances wait out the TTL.
  await purgeDestination(row.short_code);
  return { ok: true };
}

/**
 * Replace a page type's content.
 *
 * The kind is fixed at creation -- a menu does not become a coupon -- so the
 * statement only matches a row of the kind the content was checked against.
 * No cache purge: the redirect path caches the destination, which is
 * unchanged, and the hosted page reads content fresh on every view.
 */
export async function updateCodeContent(
  userId: string,
  id: string,
  raw: unknown
): Promise<ChangeResult> {
  const current = await queryOne<{ kind: string }>(
    `select kind from qr_codes where user_id = $1 and id = $2`,
    [userId, id]
  );
  if (!current) return { ok: false, reason: "That code could not be found." };
  if (!isPageKind(current.kind)) {
    return { ok: false, reason: "This code is a link. Change where it points instead." };
  }

  const checked = await checkContent(userId, current.kind, raw);
  if (!checked.ok) return checked;

  const row = await queryOne<{ id: string }>(
    `update qr_codes set content = $4::jsonb, updated_at = now()
     where user_id = $1 and id = $2 and kind = $3
     returning id`,
    [userId, id, current.kind, JSON.stringify(checked.content)]
  );
  return row ? { ok: true } : { ok: false, reason: "That code could not be found." };
}

export type FeedbackEntry = { rating: number; comment: string | null; createdAt: Date };

/** Answers left on a feedback code, newest first, with the average. */
export async function codeFeedback(
  userId: string,
  id: string
): Promise<{ entries: FeedbackEntry[]; count: number; average: number | null }> {
  const [rows, summary] = await Promise.all([
    query<{ rating: number; comment: string | null; created_at: Date }>(
      `select f.rating, f.comment, f.created_at
       from qr_feedback f
       join qr_codes c on c.id = f.qr_id
       where c.user_id = $1 and c.id = $2
       order by f.created_at desc
       limit 100`,
      [userId, id]
    ),
    queryOne<{ count: string; average: string | null }>(
      `select count(*) as count, avg(f.rating) as average
       from qr_feedback f
       join qr_codes c on c.id = f.qr_id
       where c.user_id = $1 and c.id = $2`,
      [userId, id]
    ),
  ]);
  return {
    entries: rows.map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.created_at })),
    count: Number(summary?.count ?? 0),
    average: summary?.average ? Number(summary.average) : null,
  };
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
 * Reads the `qr_scan_daily` rollup for every completed day and raw `qr_scans`
 * only for today. That split is not an optimisation -- it is the only correct
 * source. Retention deletes raw rows once they are older than the owner's plan
 * allows, so anything beyond that window exists *only* in the rollup; reading
 * raw rows alone would make a code's history quietly vanish as it aged.
 * Today's rows are not rolled up yet, so they come from the raw table and the
 * two halves are added together.
 *
 * `generate_series` fills the gaps: a chart that silently omits quiet days
 * compresses time and makes a flat week look busy. Every day in the window is
 * present whether or not anything scanned.
 *
 * Days are UTC, matching the rollup, so a scan is never counted on one day by
 * the chart and another by the totals.
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

  // The rollup plus today, as one set of rows every query below groups from.
  const COMBINED = `
    with combined as (
      select d.day, d.country, d.device_type, d.scans
      from qr_scan_daily d
      where d.qr_id = $1
        and d.day >= (now() at time zone 'UTC')::date - make_interval(days => ${window} - 1)
        and d.day <  (now() at time zone 'UTC')::date
      union all
      select
        (s.scanned_at at time zone 'UTC')::date,
        coalesce(nullif(s.country, ''), 'unknown'),
        coalesce(nullif(s.device_type, ''), 'unknown'),
        count(*)
      from qr_scans s
      where s.qr_id = $1
        and not s.is_bot
        and s.scanned_at >= (now() at time zone 'UTC')::date
      group by 1, 2, 3
    )
  `;

  const [dayRows, countryRows, deviceRows] = await Promise.all([
    // `to_char`, not a date: node-postgres parses a DATE into a JS Date at
    // *local* midnight, so `toISOString()` on it shifts the label back a day
    // for anyone east of UTC. Formatting in Postgres keeps the day the rollup
    // stored and the day the chart prints the same day.
    query<{ day: string; scans: string }>(
      `${COMBINED}
       select to_char(g.day, 'YYYY-MM-DD') as day, coalesce(sum(c.scans), 0) as scans
       from generate_series(
              (now() at time zone 'UTC')::date - make_interval(days => ${window} - 1),
              (now() at time zone 'UTC')::date,
              interval '1 day'
            ) as g(day)
       left join combined c on c.day = g.day::date
       group by g.day
       order by g.day`,
      [id]
    ),
    query<{ label: string | null; scans: string }>(
      `${COMBINED}
       select country as label, sum(scans) as scans
       from combined group by country order by sum(scans) desc limit 10`,
      [id]
    ),
    query<{ label: string | null; scans: string }>(
      `${COMBINED}
       select device_type as label, sum(scans) as scans
       from combined group by device_type order by sum(scans) desc limit 10`,
      [id]
    ),
  ]);

  const dayPoints = dayRows.map((r) => ({
    day: r.day,
    scans: Number(r.scans),
  }));

  // "Unknown" rather than a blank row: geo is a deliberate stub on hosts that
  // do not supply a country header, and a nameless slice reads as a bug.
  const toSlices = (rows: { label: string | null; scans: string }[]): Slice[] =>
    rows
      .map((r) => ({ label: r.label ?? "unknown", scans: Number(r.scans) }))
      .map((slice) => ({
        ...slice,
        label: slice.label === "unknown" ? "Unknown" : slice.label,
      }));

  return {
    days: dayPoints,
    countries: toSlices(countryRows),
    devices: toSlices(deviceRows),
    total: dayPoints.reduce((sum, point) => sum + point.scans, 0),
  };
}

/**
 * Raw scan rows for CSV export, newest first. Never includes the IP hash.
 *
 * Reads `qr_scans` rather than the rollup on purpose: an export is the one
 * place a per-scan row is the point. It is therefore bounded by retention --
 * once raw rows are pruned, only the rolled-up daily counts remain, which the
 * charts show and a CSV of individual scans cannot.
 */
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
