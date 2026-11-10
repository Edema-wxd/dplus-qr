import { query, queryOne } from "@/lib/db";
import { CODE_HOST, codeUrl } from "@/lib/brand";
import { generateCode } from "@/lib/short-code";
import { canBulkCreate, canCreateCode, getEntitlement } from "@/lib/entitlement";
import { ownsLiveLogo } from "@/lib/logos";
import { featureRefusal } from "@/lib/refusals";
import { fitToSlots, type CheckedRow, type GoodRow } from "@/lib/bulk-import";
import { flaggedReason, reputationOfMany } from "@/lib/reputation";
import { AccessLost, withCodeSlots, type TxRun } from "@/lib/user-codes";
import { access, accessArgs, writable, type AccountScope } from "@/lib/account-scope";
import { readQrStyle, type QrStyle } from "@/lib/qr-style";

/**
 * Making a checked batch of codes, and reading a batch back.
 *
 * One transaction under the account's code-slot lock (`withCodeSlots`, the
 * same lock a single create takes), so two batches, or a batch and a single
 * create, cannot together go past the plan's limit. Inside it:
 *
 * - the good rows that fit the free slots are taken in file order, and the
 *   rest reported as over the limit (decided 7 Nov 2026);
 * - every code is inserted in one statement against the unique index, with
 *   `on conflict do nothing`: a generated code that collides comes back
 *   missing and is retried with a fresh one, as a single create retries,
 *   never checked first;
 * - a custom link that comes back missing is taken, and the whole batch is
 *   rolled back with that row named. Substituting another link would print
 *   one the owner did not ask for.
 */

export type BulkResult =
  | { ok: true; importId: string; created: number }
  | { ok: false; reason: string };

/** Thrown inside the transaction so it rolls back; caught and reported below. */
class BatchRefused extends Error {}

const ATTEMPTS = 5;

export async function createBulk(
  scope: AccountScope,
  rows: CheckedRow[],
  options: { source: "csv" | "paste"; logoId: string | null }
): Promise<BulkResult> {
  const may = writable(scope);
  if (!may.ok) return may;
  const entitlement = await getEntitlement(scope.accountId);
  if (!canBulkCreate(entitlement)) {
    return { ok: false, reason: await featureRefusal("bulk_creation", entitlement) };
  }
  const allowed = canCreateCode(entitlement);
  if (!allowed.ok) return { ok: false, reason: allowed.reason };

  if (options.logoId && !(await ownsLiveLogo(scope, options.logoId))) {
    return { ok: false, reason: "That logo is no longer in your library. Pick another, or upload it again." };
  }

  const invalid = rows.filter((r) => !r.ok).length;

  try {
    return await withCodeSlots(scope, entitlement!.maxCodes, async (run, free) => {
      const { create, overLimit } = fitToSlots(rows, free);
      if (create.length === 0) {
        const full = canCreateCode({ ...entitlement!, codesUsed: entitlement!.maxCodes });
        throw new BatchRefused(full.ok ? "There are no codes left on your plan." : full.reason);
      }

      const made = await insertCodes(run, scope.accountId, create, options.logoId);

      const batch = await run<{ id: string }>(
        `-- scope: proved by withCodeSlots, in this transaction
         insert into qr_bulk_imports
           (user_id, source, rows_total, rows_invalid, rows_over_limit, rows_created)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [scope.accountId, options.source, rows.length, invalid, overLimit.length, made.length]
      );
      const importId = batch[0].id;
      await run(
        `-- scope: proved by withCodeSlots, in this transaction
         insert into qr_bulk_import_codes (import_id, qr_id, row_number)
         select $1, t.qr_id, t.row_number
         from unnest($2::bigint[], $3::int[]) as t(qr_id, row_number)`,
        [importId, made.map((m) => m.id), made.map((m) => m.row)]
      );

      return { ok: true as const, importId: String(importId), created: made.length };
    });
  } catch (error) {
    if (error instanceof BatchRefused || error instanceof AccessLost) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}

/** Insert every row, retrying generated codes that collide. */
async function insertCodes(
  run: TxRun,
  accountId: string,
  rows: GoodRow[],
  logoId: string | null
): Promise<{ id: string; row: number }[]> {
  const made: { id: string; row: number }[] = [];
  // Each pending row with the short code it will try next. Generated codes
  // are made distinct within the batch first, so the batch never collides
  // with itself.
  let pending = rows.map((row) => ({ row, shortCode: row.customCode ?? "" }));
  const taken = new Set(rows.flatMap((r) => (r.customCode ? [r.customCode] : [])));
  const fresh = () => {
    for (;;) {
      const code = generateCode();
      if (!taken.has(code)) {
        taken.add(code);
        return code;
      }
    }
  };
  for (const item of pending) if (!item.shortCode) item.shortCode = fresh();

  for (let attempt = 0; attempt < ATTEMPTS && pending.length > 0; attempt += 1) {
    const inserted = await run<{ id: string; short_code: string }>(
      `-- scope: proved by withCodeSlots, in this transaction
       insert into qr_codes (user_id, short_code, name, kind, destination_url, logo_id)
       select $1, t.short_code, t.name, t.kind, t.destination, $6::bigint
       from unnest($2::text[], $3::text[], $4::text[], $5::text[])
         as t(short_code, name, kind, destination)
       on conflict (short_code) do nothing
       returning id, short_code`,
      [
        accountId,
        pending.map((p) => p.shortCode),
        pending.map((p) => p.row.name),
        pending.map((p) => p.row.kind),
        pending.map((p) => p.row.destination),
        logoId,
      ]
    );
    const byCode = new Map(inserted.map((r) => [r.short_code, String(r.id)]));
    const missing: typeof pending = [];
    for (const item of pending) {
      const id = byCode.get(item.shortCode);
      if (id) made.push({ id, row: item.row.row });
      else missing.push(item);
    }

    const takenLink = missing.find((item) => item.row.customCode);
    if (takenLink) {
      throw new BatchRefused(
        `Row ${takenLink.row.row}: ${CODE_HOST}/${takenLink.shortCode} is already taken. Change or remove that link and try again. No codes were made.`
      );
    }
    pending = missing.map((item) => ({ ...item, shortCode: fresh() }));
  }

  if (pending.length > 0) {
    throw new BatchRefused("Could not allocate short codes for every row. Please try again. No codes were made.");
  }
  return made.sort((a, b) => a.row - b.row);
}

export type BatchCode = {
  id: string;
  row: number;
  name: string;
  shortCode: string;
  link: string;
  destination: string;
  kind: string;
  status: string;
  /** For the artwork, read as a single code's download reads them. */
  style: QrStyle;
  logo: { id: string; url: string } | null;
  createdAt: Date;
};

export type Batch = {
  id: string;
  source: "csv" | "paste";
  rowsTotal: number;
  rowsInvalid: number;
  rowsOverLimit: number;
  rowsCreated: number;
  createdAt: Date;
  codes: BatchCode[];
};

/** Parsed like a code id: digits only, so a bad URL is a 404, not a cast error. */
export function parseImportId(raw: string): string | null {
  return /^[1-9][0-9]{0,18}$/.test(raw) ? raw : null;
}

/**
 * One of this account's batches with its codes, in spreadsheet order. Both
 * reads filter by the session's user id: the batch's, and each code's, so a
 * code that has since left the account (it cannot, but the rule is the rule)
 * is not listed. Codes staff archived are left out, as on the codes list.
 */
export async function getBatch(scope: AccountScope, importId: string): Promise<Batch | null> {
  const head = await queryOne<{
    id: string;
    source: "csv" | "paste";
    rows_total: number;
    rows_invalid: number;
    rows_over_limit: number;
    rows_created: number;
    created_at: Date;
  }>(
    `select id, source, rows_total, rows_invalid, rows_over_limit, rows_created, created_at
     from qr_bulk_imports where user_id = $1 and id = $2 and ${access(3)}`,
    [scope.accountId, importId, ...accessArgs(scope, "read")]
  );
  if (!head) return null;

  const codes = await query<{
    id: string;
    row_number: number;
    name: string;
    short_code: string;
    destination_url: string;
    kind: string;
    status: string;
    style: unknown;
    logo_id: string | null;
    logo_url: string | null;
    created_at: Date;
  }>(
    // The logo joined on the owner too, as everywhere a code's logo is read.
    `select c.id, b.row_number, c.name, c.short_code, c.destination_url, c.kind, c.status,
            c.style, l.id as logo_id, l.url as logo_url, c.created_at
     from qr_bulk_import_codes b
     join qr_codes c on c.id = b.qr_id
     left join qr_logos l on l.id = c.logo_id and l.user_id = c.user_id
     where b.import_id = $2 and c.user_id = $1 and c.archived_at is null and ${access(3)}
     order by b.row_number`,
    [scope.accountId, importId, ...accessArgs(scope, "read")]
  );

  return {
    id: String(head.id),
    source: head.source,
    rowsTotal: head.rows_total,
    rowsInvalid: head.rows_invalid,
    rowsOverLimit: head.rows_over_limit,
    rowsCreated: head.rows_created,
    createdAt: head.created_at,
    codes: codes.map((c) => ({
      id: String(c.id),
      row: c.row_number,
      name: c.name,
      shortCode: c.short_code,
      link: codeUrl(c.short_code),
      destination: c.destination_url,
      kind: c.kind,
      status: c.status,
      style: readQrStyle(c.style),
      logo: c.logo_id && c.logo_url ? { id: String(c.logo_id), url: c.logo_url } : null,
      createdAt: c.created_at,
    })),
  };
}

/** This account's recent batches, newest first, for the bulk page. */
export async function listBatches(
  scope: AccountScope,
  limit = 10
): Promise<BatchSummary[]> {
  const rows = await query<BatchRow>(
    `select id, rows_created, rows_total, created_at
     from qr_bulk_imports where user_id = $1 and ${access(3)}
     order by created_at desc limit $2`,
    [scope.accountId, limit, ...accessArgs(scope, "read")]
  );
  return rows.map(toSummary);
}

/** The same list for the staff customer page, which `requireStaff` guards. */
export async function batchesForStaff(accountId: string, limit = 10): Promise<BatchSummary[]> {
  const rows = await query<BatchRow>(
    `-- scope: staff only (requireStaff on the customer page)
     select id, rows_created, rows_total, created_at
     from qr_bulk_imports where user_id = $1
     order by created_at desc limit $2`,
    [accountId, limit]
  );
  return rows.map(toSummary);
}

type BatchSummary = { id: string; rowsCreated: number; rowsTotal: number; createdAt: Date };
type BatchRow = { id: string; rows_created: number; rows_total: number; created_at: Date };

function toSummary(r: BatchRow): BatchSummary {
  return { id: String(r.id), rowsCreated: r.rows_created, rowsTotal: r.rows_total, createdAt: r.created_at };
}

/**
 * Look every good row's destination up on Google's lists of unsafe sites and
 * turn a flagged one into a row with a problem, as a single code would be
 * refused. Run by both the check and the create step, which never trusts the
 * check's answer. An unavailable lookup leaves the row good (decided 8 Nov
 * 2026). Each distinct destination is looked up once.
 */
export async function markUnsafeRows(rows: CheckedRow[]): Promise<CheckedRow[]> {
  const results = await reputationOfMany(rows.flatMap((r) => (r.ok ? [r.destination] : [])));
  return rows.map((row) => {
    if (!row.ok) return row;
    const result = results.get(row.destination);
    if (result?.verdict !== "flagged") return row;
    return {
      row: row.row,
      ok: false,
      name: row.name,
      destination: row.destination,
      reason: flaggedReason(row.destination, result.threats),
    };
  });
}
