import { query, queryOne, withTransaction } from "@/lib/db";
import { access, accessArgs, writable, type AccountScope } from "@/lib/account-scope";
import { purgeDestination } from "@/lib/codes";
import { checkCustomCode, generateCode } from "@/lib/short-code";
import { CODE_HOST } from "@/lib/brand";
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
import {
  canCreateCode,
  canMakeHostedPages,
  canUploadVideo,
  canUseCustomCodes,
  getEntitlement,
  type Entitlement,
} from "@/lib/entitlement";
import { listPublicPlans } from "@/lib/plans";
import { featureOffer, offerRefusal } from "@/lib/upgrade-offers";
import { readQrStyle, type QrStyle } from "@/lib/qr-style";
import { ownsLiveLogo } from "@/lib/logos";
import { readPresetLogo, type PresetLogoId } from "@/lib/preset-logos";
import { featureRefusal } from "@/lib/refusals";
import { firstFlagged, flaggedReason, pageLinks } from "@/lib/reputation";
import {
  analyticsWindow,
  bucketFor,
  LONGEST_DAILY_WINDOW,
  toBuckets,
  type Bucket,
  type ChartPoint,
} from "@/lib/chart-buckets";

/**
 * Everything the signed-in owner can do to their own codes.
 *
 * Deliberately separate from `src/lib/codes.ts`, which is the redirect path.
 * Nothing here is ever imported by `app/[code]/route.ts`, and
 * `src/__tests__/redirect-isolation.test.ts` is what keeps that true.
 *
 * **Every query filters by the account and proves the session may use it.**
 * Each function takes an `AccountScope` (`src/lib/account-scope.ts`), never a
 * bare user id, and each statement carries `access(n)`: `user_id` is the
 * account, and the same statement checks that the signed-in person is its
 * owner or a live member with a role that allows the action. An id in a URL
 * is a guess until the database has agreed it belongs to the account. There
 * is no "fetch then check" anywhere in this file.
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
  /** A ready-made mark in place of an uploaded logo. The two never coexist. */
  presetLogo: PresetLogoId | null;
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
    presetLogo: readPresetLogo(row.style),
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

export async function listCodes(scope: AccountScope): Promise<OwnedCode[]> {
  const rows = await query<CodeRow>(
    `select
       c.id, c.short_code, c.name, c.kind, c.destination_url, c.content, c.status,
       c.blocked_reason, c.style, c.created_at, c.updated_at,
       l.id as logo_id, l.url as logo_url,
       ${COUNTS}
     from qr_codes c
     ${LOGO_JOIN}
     left join qr_scans s on s.qr_id = c.id
     where c.user_id = $1 and c.archived_at is null and ${access(2)}
     group by c.id, l.id
     order by c.created_at desc`,
    [scope.accountId, ...accessArgs(scope, "read")]
  );
  return rows.map(toOwnedCode);
}

export async function getCode(
  scope: AccountScope,
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
     where c.user_id = $1 and c.id = $2 and c.archived_at is null and ${access(3)}
     group by c.id, l.id`,
    [scope.accountId, id, ...accessArgs(scope, "read")]
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
/**
 * `customCode`, when given, is the owner's chosen short code. It is fixed
 * once the code exists: a printed link can never change, so there is no way
 * to edit it afterwards, only to make another code.
 */
export type CreateInput =
  | {
      kind: LinkKind;
      name: string;
      destinationUrl: string;
      logoId?: string | null;
      customCode?: string | null;
      /** Already checked by the caller with `checkQrStyle`. */
      style?: QrStyle;
      /** A ready-made mark; `logoId` must then be null. */
      presetLogo?: PresetLogoId | null;
    }
  | {
      kind: PageKind;
      name: string;
      content: unknown;
      logoId?: string | null;
      customCode?: string | null;
      /** Already checked by the caller with `checkQrStyle`. */
      style?: QrStyle;
      /** A ready-made mark; `logoId` must then be null. */
      presetLogo?: PresetLogoId | null;
    };

/**
 * Validate what a page type will show: files resolved against the account's
 * own uploads first, then the kind's schema.
 */
async function checkContent(
  scope: AccountScope,
  kind: PageKind,
  raw: unknown
): Promise<{ ok: true; content: PageContent } | { ok: false; reason: string }> {
  const resolved = await resolveFiles(scope, raw);
  if (!resolved.ok) return resolved;
  return parsePageContent(kind, resolved.content);
}

/**
 * Why a video file was refused, naming the cheapest plan that has video
 * uploads as the plan rows say today, never a plan written into copy. Shared
 * with the upload router, which refuses before a file is stored.
 */
export async function videoRefusal(entitlement: Entitlement | null): Promise<string> {
  const offer = featureOffer("video_uploads", entitlement, await listPublicPlans());
  return offerRefusal(offer, "Link a YouTube or Vimeo video instead.");
}

/** The uploaded file on a video page's content, by id, or null. */
function videoFileId(content: unknown): string | null {
  const file = (content as { file?: { fileId?: unknown } } | null)?.file;
  return typeof file?.fileId === "string" ? file.fileId : null;
}

export async function createCode(
  scope: AccountScope,
  input: CreateInput
): Promise<CreateResult> {
  const may = writable(scope);
  if (!may.ok) return may;

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
      scope,
      input.kind,
      (input as { content: unknown }).content
    );
    if (!checked.ok) return checked;
    content = checked.content;
  }

  const entitlement = await getEntitlement(scope.accountId);
  const allowed = canCreateCode(entitlement);
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  if (isPageKind(input.kind)) {
    if (!canMakeHostedPages(entitlement)) {
      return { ok: false, reason: await featureRefusal("hosted_pages", entitlement, "Link codes are included.") };
    }
    if (input.kind === "video" && videoFileId(content) && !canUploadVideo(entitlement)) {
      return { ok: false, reason: await videoRefusal(entitlement) };
    }
  }

  let customCode: string | null = null;
  if (input.customCode) {
    if (!canUseCustomCodes(entitlement)) {
      return { ok: false, reason: await featureRefusal("custom_codes", entitlement) };
    }
    const checked = checkCustomCode(input.customCode);
    if (!checked.ok) return { ok: false, reason: checked.reason };
    customCode = checked.code;
  }

  const logoId = input.logoId ?? null;
  if (logoId && !(await ownsLiveLogo(scope, logoId))) {
    return {
      ok: false,
      reason: "That logo is no longer in your library. Pick another, or upload it again.",
    };
  }

  // Google's lists of unsafe sites, for the destination or every outside link
  // on the page. Before the slot lock, so a slow lookup holds nothing. Only a
  // flagged link refuses; an unavailable check lets the save through.
  const unsafe = await firstFlagged(destination ? [destination] : pageLinks(content));
  if (unsafe) return { ok: false, reason: flaggedReason(unsafe.url, unsafe.threats) };

  const name = input.name.trim();
  const maxCodes = entitlement!.maxCodes;

  try {
    return await withCodeSlots(scope, maxCodes, async (run, free): Promise<CreateResult> => {
      // Counted again under the account's lock: the check above read the count
      // before anything was locked, and two creates at once could both pass it.
      if (free < 1) {
        const refused = canCreateCode({ ...entitlement!, codesUsed: maxCodes });
        return { ok: false as const, reason: refused.ok ? "No codes left on your plan." : refused.reason };
      }

      // A chosen code gets one attempt: if the unique index says it is taken,
      // that is the answer, and generating something else would hand the owner
      // a link they did not ask for. A generated code retries, as it always has.
      // `on conflict do nothing` rather than catching the violation, because a
      // failed statement would abort the transaction holding the lock.
      const attempts = customCode ? 1 : 5;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const shortCode = customCode ?? generateCode();
        const rows = await run<{ id: string }>(
          `-- scope: proved by withCodeSlots, in this transaction
           insert into qr_codes
             (user_id, short_code, name, kind, destination_url, content, logo_id, style)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7::bigint, $8::jsonb)
           on conflict (short_code) do nothing
           returning id`,
          [
            scope.accountId,
            shortCode,
            name,
            input.kind,
            destination ?? pagePath(shortCode),
            content === null ? null : JSON.stringify(content),
            logoId,
            JSON.stringify({
              ...(input.style ?? {}),
              ...(input.presetLogo && !logoId ? { presetLogo: input.presetLogo } : {}),
            }),
          ]
        );
        // A fresh code has no history row: there is no previous destination to
        // record, and inventing one would make the log lie about a change that
        // never happened.
        if (rows[0]) return { ok: true as const, id: String(rows[0].id), shortCode };
        if (customCode) {
          return { ok: false as const, reason: `${CODE_HOST}/${customCode} is already taken. Try another.` };
        }
      }

      return {
        ok: false as const,
        reason: "Could not allocate a short code. Please try again.",
      };
    });
  } catch (error) {
    if (error instanceof AccessLost) return { ok: false, reason: error.message };
    throw error;
  }
}

/** Runs a statement inside the caller's transaction. */
export type TxRun = <R extends Record<string, unknown>>(
  text: string,
  params?: readonly unknown[]
) => Promise<R[]>;

/**
 * Run `work` holding this account's code-slot lock, told how many codes the
 * plan still has room for.
 *
 * Every path that makes dynamic codes goes through here, single and bulk, so
 * two creates at the same moment cannot both read "one slot left" and both
 * take it. The lock is a transaction-scoped advisory lock keyed on the
 * account: it is released by the commit or rollback, so it is safe over
 * PgBouncer in transaction mode (the same reasoning as `withTransaction`)
 * and cannot outlive a crashed request. Codes are counted as the entitlement
 * counts them, archived ones aside.
 */
export async function withCodeSlots<T>(
  scope: AccountScope,
  maxCodes: number,
  work: (run: TxRun, free: number) => Promise<T>
): Promise<T> {
  return withTransaction(async (run) => {
    await run(
      `-- scope: a lock on the account's slots; reads no rows
       select pg_advisory_xact_lock(hashtextextended('qr_codes:' || $1::text, 0))`,
      [scope.accountId]
    );
    // Counted, and the right to write proved, in one statement under the
    // lock: a member removed since the page loaded gets no slots at all.
    const used = await run<{ used: string }>(
      `select count(*) as used from qr_codes
       where user_id = $1 and archived_at is null
       having ${access(2)}`,
      [scope.accountId, ...accessArgs(scope, "write")]
    );
    if (!used[0]) throw new AccessLost();
    return work(run, Math.max(0, maxCodes - Number(used[0].used)));
  });
}

/**
 * The signed-in person can no longer write to the account they were working
 * in (removed from the team, or made a viewer, since the page loaded).
 * Thrown inside `withCodeSlots` so the transaction rolls back.
 */
export class AccessLost extends Error {
  constructor() {
    super("You can no longer make codes in this account. Reload the page.");
  }
}

export async function renameCode(
  scope: AccountScope,
  id: string,
  name: string
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_codes set name = $3, updated_at = now()
     where user_id = $1 and id = $2 and ${access(4)}
     returning id`,
    [scope.accountId, id, name.trim(), ...accessArgs(scope, "write")]
  );
  // The name is never on the redirect path, so no cache purge is needed.
  return row !== null;
}

/**
 * Save a code's design: colours, pattern and corners.
 *
 * Merged into the `style` object rather than replacing it, so a key this form
 * does not own (a frame, say) is not wiped by a design change. The caller has
 * already run `checkQrStyle`; this only writes.
 *
 * No cache purge: `style` is never read by the redirect path, and changing it
 * changes the image, not where a scan goes.
 */
export async function setCodeStyle(
  scope: AccountScope,
  id: string,
  style: QrStyle
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_codes
       set style = style || $3::jsonb,
           updated_at = now()
     where user_id = $1 and id = $2 and ${access(4)}
     returning id`,
    [scope.accountId, id, JSON.stringify(style), ...accessArgs(scope, "write")]
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
  scope: AccountScope,
  id: string,
  destinationUrl: string
): Promise<ChangeResult> {
  // The kind decides how the input is read: an Instagram code takes a handle
  // and must stay on Instagram. A page type has no destination to change --
  // its content is edited instead -- so it is refused rather than re-pointed
  // away from its own page.
  const current = await queryOne<{ kind: string }>(
    `select kind from qr_codes where user_id = $1 and id = $2 and ${access(3)}`,
    [scope.accountId, id, ...accessArgs(scope, "write")]
  );
  if (!current) return { ok: false, reason: "That code could not be found." };
  if (!isLinkKind(current.kind)) {
    return { ok: false, reason: "This code shows a page. Edit its content instead." };
  }
  const screened = linkDestination(current.kind, destinationUrl);
  if (!screened.ok) return { ok: false, reason: screened.reason };
  const unsafe = await firstFlagged([screened.normalised]);
  if (unsafe) return { ok: false, reason: flaggedReason(unsafe.url, unsafe.threats) };

  const row = await queryOne<{ short_code: string }>(
    `with prev as (
       select id, short_code, destination_url
       from qr_codes
       where user_id = $1 and id = $2 and kind = $4 and ${access(5)}
     ), updated as (
       update qr_codes c
         set destination_url = $3, updated_at = now()
       from prev
       where c.id = prev.id
       returning c.short_code
     ), logged as (
       insert into qr_destination_history (qr_id, old_url, new_url, changed_by)
       select prev.id, prev.destination_url, $3, $5 from prev
     )
     select short_code from updated`,
    // changed_by is the person who made the change ($5, the actor), not the
    // account: on a team that is how the history says which member did it.
    [scope.accountId, id, screened.normalised, current.kind, ...accessArgs(scope, "write")]
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
  scope: AccountScope,
  id: string,
  raw: unknown
): Promise<ChangeResult> {
  const current = await queryOne<{ kind: string; content: unknown }>(
    `select kind, content from qr_codes where user_id = $1 and id = $2 and ${access(3)}`,
    [scope.accountId, id, ...accessArgs(scope, "write")]
  );
  if (!current) return { ok: false, reason: "That code could not be found." };
  if (!isPageKind(current.kind)) {
    return { ok: false, reason: "This code is a link. Change where it points instead." };
  }

  const checked = await checkContent(scope, current.kind, raw);
  if (!checked.ok) return checked;
  const unsafe = await firstFlagged(pageLinks(checked.content));
  if (unsafe) return { ok: false, reason: flaggedReason(unsafe.url, unsafe.threats) };

  // Keeping a video already on the page is always allowed (it may be
  // printed); attaching a different one needs a plan with video uploads.
  if (current.kind === "video") {
    const next = videoFileId(checked.content);
    if (next && next !== videoFileId(current.content)) {
      const entitlement = await getEntitlement(scope.accountId);
      if (!canUploadVideo(entitlement)) return { ok: false, reason: await videoRefusal(entitlement) };
    }
  }

  const row = await queryOne<{ id: string }>(
    `update qr_codes set content = $4::jsonb, updated_at = now()
     where user_id = $1 and id = $2 and kind = $3 and ${access(5)}
     returning id`,
    [scope.accountId, id, current.kind, JSON.stringify(checked.content), ...accessArgs(scope, "write")]
  );
  return row ? { ok: true } : { ok: false, reason: "That code could not be found." };
}

export type FeedbackEntry = { rating: number; comment: string | null; createdAt: Date };

/** Answers left on a feedback code, newest first, with the average. */
export async function codeFeedback(
  scope: AccountScope,
  id: string
): Promise<{ entries: FeedbackEntry[]; count: number; average: number | null }> {
  const [rows, summary] = await Promise.all([
    query<{ rating: number; comment: string | null; created_at: Date }>(
      `select f.rating, f.comment, f.created_at
       from qr_feedback f
       join qr_codes c on c.id = f.qr_id
       where c.user_id = $1 and c.id = $2 and ${access(3)}
       order by f.created_at desc
       limit 100`,
      [scope.accountId, id, ...accessArgs(scope, "read")]
    ),
    queryOne<{ count: string; average: string | null }>(
      `select count(*) as count, avg(f.rating) as average
       from qr_feedback f
       join qr_codes c on c.id = f.qr_id
       where c.user_id = $1 and c.id = $2 and ${access(3)}`,
      [scope.accountId, id, ...accessArgs(scope, "read")]
    ),
  ]);
  return {
    entries: rows.map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.created_at })),
    count: Number(summary?.count ?? 0),
    average: summary?.average ? Number(summary.average) : null,
  };
}

/** An answer as the CSV export lists it: where it came from, as a scan records it. */
export type FeedbackExportRow = FeedbackEntry & {
  country: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
};

/**
 * Every answer on a feedback code, newest first, for the CSV export. The
 * panel shows the latest 100; this is the rest. Capped like the scan export.
 * Answers left before migration 025 have no origin, so those fields are null.
 */
export async function feedbackRows(scope: AccountScope, id: string): Promise<FeedbackExportRow[]> {
  const rows = await query<{
    rating: number;
    comment: string | null;
    created_at: Date;
    country: string | null;
    city: string | null;
    device_type: string | null;
    os: string | null;
  }>(
    `select f.rating, f.comment, f.created_at, f.country, f.city, f.device_type, f.os
     from qr_feedback f
     join qr_codes c on c.id = f.qr_id
     where c.user_id = $1 and c.id = $2 and ${access(3)}
     order by f.created_at desc
     limit 10000`,
    [scope.accountId, id, ...accessArgs(scope, "read")]
  );
  return rows.map((r) => ({
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    country: r.country,
    city: r.city,
    device: r.device_type,
    os: r.os,
  }));
}

/**
 * Pause or resume. The owner can never set `blocked`, which is an admin
 * verdict about a destination, not a preference — hence `OwnerStatus`.
 *
 * A blocked code is also refused here: lifting a block is an admin action and
 * must not be reachable from the owner's own dashboard. So is an archived
 * one, for the same reason.
 */
export async function setStatus(
  scope: AccountScope,
  id: string,
  status: OwnerStatus
): Promise<boolean> {
  const row = await queryOne<{ short_code: string }>(
    `update qr_codes set status = $3, updated_at = now()
     where user_id = $1 and id = $2 and status <> 'blocked' and archived_at is null
       and ${access(4)}
     returning short_code`,
    [scope.accountId, id, status, ...accessArgs(scope, "write")]
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
  scope: AccountScope,
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
     where c.user_id = $1 and h.qr_id = $2 and ${access(3)}
     order by h.changed_at desc
     limit 50`,
    [scope.accountId, id, ...accessArgs(scope, "read")]
  );
  return rows.map((r) => ({
    oldUrl: r.old_url,
    newUrl: r.new_url,
    changedAt: r.changed_at,
  }));
}

export { ANALYTICS_WINDOWS, analyticsWindow, type AnalyticsWindow } from "@/lib/chart-buckets";

/** A share of scans by some dimension, biggest first. */
export type Slice = { label: string; scans: number };

/**
 * The paid half of the analytics: operating systems, cities, unique scans and
 * the previous period to compare against. Null when the plan does not include
 * it, and then never queried, so a locked panel cannot leak its numbers.
 */
export type AnalyticsDetail = {
  os: Slice[];
  cities: Slice[];
  /** Summed daily uniques over the window; null when no hash was recorded. */
  unique: number | null;
  /** Scans in the window of the same length immediately before this one. */
  previousTotal: number;
};

export type Analytics = {
  /** How `points` is bucketed: a bar per day, week or month. */
  bucket: Bucket;
  points: ChartPoint[];
  countries: Slice[];
  devices: Slice[];
  total: number;
  /** Scans so far today (UTC), whatever the bucket. */
  today: number;
  detail: AnalyticsDetail | null;
};

/**
 * Scans over time, by country and device for one code, and with `detail` also
 * by operating system and city, with uniques and the previous period.
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
 * present whether or not anything scanned. Long windows are then summed into
 * weeks or months in `toBuckets`, from those same days, so a week's bar is
 * exactly its days added up.
 *
 * Unique visitors per day come from `qr_scan_daily_visitors` (migration 026),
 * one figure per day, never by adding the rollup's per-group counts, which
 * double-counts anyone seen in two groups. A day with no row there (partly
 * pruned before 026 could be back-filled) falls back to that sum.
 *
 * Days are UTC, matching the rollup, so a scan is never counted on one day by
 * the chart and another by the totals.
 */
export async function codeAnalytics(
  scope: AccountScope,
  id: string,
  days: number,
  options: { detail?: boolean } = {}
): Promise<Analytics> {
  const owns = await queryOne<{ id: string }>(
    `select id from qr_codes where user_id = $1 and id = $2 and ${access(3)}`,
    [scope.accountId, id, ...accessArgs(scope, "read")]
  );
  if (!owns) return emptyAnalytics(days);
  return analyticsForCode(id, days, options);
}

function emptyAnalytics(days: number): Analytics {
  return {
    bucket: bucketFor(analyticsWindow(days)),
    points: [],
    countries: [],
    devices: [],
    total: 0,
    today: 0,
    detail: null,
  };
}

/**
 * A code's analytics with no account check, for the two callers that
 * authorise another way: the staff admin (`requireStaff`) and a public
 * share link (`loadSharedCode`, which checks the link, the code and the
 * owner). Everything on the dashboard goes through `codeAnalytics`.
 */
export async function analyticsForCode(
  id: string,
  days: number,
  options: { detail?: boolean } = {}
): Promise<Analytics> {
  const window = analyticsWindow(days);
  const bucket = bucketFor(window);

  const owns = await queryOne<{ id: string; created_day: string }>(
    `-- scope: callers authorise (see above); keyed on the code alone
     select id, to_char((created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as created_day
     from qr_codes where id = $1`,
    [id]
  );
  if (!owns) return emptyAnalytics(days);

  // The rollup plus today, as one set of rows every breakdown groups from.
  const COMBINED = `
    with combined as (
      select d.day, d.country, d.device_type, d.os, d.city, d.scans
      from qr_scan_daily d
      where d.qr_id = $1
        and d.day >= (now() at time zone 'UTC')::date - make_interval(days => ${window} - 1)
        and d.day <  (now() at time zone 'UTC')::date
      union all
      select
        (s.scanned_at at time zone 'UTC')::date,
        coalesce(nullif(s.country, ''), 'unknown'),
        coalesce(nullif(s.device_type, ''), 'unknown'),
        coalesce(nullif(s.os, ''), 'unknown'),
        coalesce(nullif(s.city, ''), 'unknown'),
        count(*)
      from qr_scans s
      where s.qr_id = $1
        and not s.is_bot
        and s.scanned_at >= (now() at time zone 'UTC')::date
      group by 1, 2, 3, 4, 5
    )
  `;

  const slice = (column: string) =>
    query<{ label: string | null; scans: string }>(
      `${COMBINED}
       select ${column} as label, sum(scans) as scans
       from combined group by ${column} order by sum(scans) desc limit 10`,
      [id]
    );

  const detail = options.detail === true;

  const [dayRows, countryRows, deviceRows, osRows, cityRows, previous] = await Promise.all([
    // `to_char`, not a date: node-postgres parses a DATE into a JS Date at
    // *local* midnight, so `toISOString()` on it shifts the label back a day
    // for anyone east of UTC. Formatting in Postgres keeps the day the rollup
    // stored and the day the chart prints the same day.
    query<{ day: string; scans: string; unique_scans: string }>(
      `with rolled as (
         select d.day, sum(d.scans) as scans, sum(d.unique_scans) as summed_unique
         from qr_scan_daily d
         where d.qr_id = $1
           and d.day >= (now() at time zone 'UTC')::date - make_interval(days => ${window} - 1)
           and d.day <  (now() at time zone 'UTC')::date
         group by d.day
       ),
       visitors as (
         select v.day, v.unique_scans
         from qr_scan_daily_visitors v
         where v.qr_id = $1
           and v.day >= (now() at time zone 'UTC')::date - make_interval(days => ${window} - 1)
           and v.day <  (now() at time zone 'UTC')::date
       ),
       today as (
         select count(*) as scans, count(distinct s.ip_hash) as unique_scans
         from qr_scans s
         where s.qr_id = $1
           and not s.is_bot
           and s.scanned_at >= (now() at time zone 'UTC')::date
       )
       select to_char(g.day, 'YYYY-MM-DD') as day,
              case when g.day::date = (now() at time zone 'UTC')::date
                   then t.scans
                   else coalesce(r.scans, 0) end as scans,
              case when g.day::date = (now() at time zone 'UTC')::date
                   then t.unique_scans
                   else coalesce(v.unique_scans, r.summed_unique, 0) end as unique_scans
       from generate_series(
              (now() at time zone 'UTC')::date - make_interval(days => ${window} - 1),
              (now() at time zone 'UTC')::date,
              interval '1 day'
            ) as g(day)
       cross join today t
       left join rolled r on r.day = g.day::date
       left join visitors v on v.day = g.day::date
       order by g.day`,
      [id]
    ),
    slice("country"),
    slice("device_type"),
    detail ? slice("os") : Promise.resolve([]),
    detail ? slice("city") : Promise.resolve([]),
    // The window of the same length just before this one, all completed days,
    // so it reads from the rollup alone.
    detail
      ? queryOne<{ scans: string }>(
          `select coalesce(sum(scans), 0) as scans
           from qr_scan_daily
           where qr_id = $1
             and day >= (now() at time zone 'UTC')::date - make_interval(days => ${window} * 2 - 1)
             and day <  (now() at time zone 'UTC')::date - make_interval(days => ${window} - 1)`,
          [id]
        )
      : Promise.resolve(null),
  ]);

  const daily = dayRows.map((r) => ({
    day: r.day,
    scans: Number(r.scans),
    unique: Number(r.unique_scans),
  }));

  // "Unknown" rather than a blank row: geo is a deliberate stub on hosts that
  // do not supply a country header, and a nameless slice reads as a bug.
  const toSlices = (rows: { label: string | null; scans: string }[]): Slice[] =>
    rows
      .map((r) => ({ label: r.label ?? "unknown", scans: Number(r.scans) }))
      .map((item) => ({
        ...item,
        label: item.label === "unknown" ? "Unknown" : item.label,
      }));

  const total = daily.reduce((sum, d) => sum + d.scans, 0);
  const unique = daily.reduce((sum, d) => sum + d.unique, 0);

  return {
    bucket,
    points: toBuckets(daily, bucket, owns.created_day),
    countries: toSlices(countryRows),
    devices: toSlices(deviceRows),
    total,
    today: daily.at(-1)?.scans ?? 0,
    detail: detail
      ? {
          os: toSlices(osRows),
          cities: toSlices(cityRows),
          // Scans with no uniques at all means the hash is not being
          // recorded, not that nobody came: say "not available", not zero.
          unique: total > 0 && unique === 0 ? null : unique,
          previousTotal: Number(previous?.scans ?? 0),
        }
      : null,
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
  scope: AccountScope,
  id: string,
  days: number
): Promise<
  { scannedAt: Date; country: string | null; device: string | null; os: string | null; browser: string | null }[]
> {
  // Individual scans only ever cover a daily window: raw rows are pruned to
  // the plan's history anyway, and a year of rows is not what this file is for.
  const window = Math.min(analyticsWindow(days), LONGEST_DAILY_WINDOW);

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
       and ${access(3)}
     order by s.scanned_at desc
     limit 10000`,
    [scope.accountId, id, ...accessArgs(scope, "read")]
  );

  return rows.map((r) => ({
    scannedAt: r.scanned_at,
    country: r.country,
    device: r.device_type,
    os: r.os,
    browser: r.browser,
  }));
}

/**
 * Whether a custom code is free right now, for the form's live hint.
 *
 * Advice only. Someone else can take the code between this answer and the
 * save, and the save's unique index is what decides; this just spares the
 * owner a round trip for the common case.
 */
export async function customCodeAvailable(code: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `-- scope: none; whether a short code is taken anywhere
     select id from qr_codes where short_code = $1`,
    [code]
  );
  return row === null;
}
