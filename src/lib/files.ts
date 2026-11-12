import { query, queryOne, withTransaction } from "@/lib/db";
import { access, accessArgs, type AccountScope } from "@/lib/account-scope";
import { DYNAMIC_KINDS, isLinkKind } from "@/lib/qr-types";
import { isUploadThingUrl } from "@/lib/logos";
import { collectFileIds } from "@/lib/page-content";

/**
 * Files shown on hosted pages: PDFs, photos, video, audio.
 *
 * Uploaded through UploadThing and recorded here against the account, the way
 * `logos.ts` records logos. Dashboard-side only; the redirect path never reads
 * a file.
 *
 * **Every query filters by `user_id`.** A file id in a saved page is a guess
 * until the database agrees it belongs to the session.
 */

export type StoredFile = { id: string; url: string; name: string; mime: string };

type FileRow = { id: string; url: string; name: string; mime_type: string };

function toFile(row: FileRow): StoredFile {
  return { id: String(row.id), url: row.url, name: row.name, mime: row.mime_type };
}

/** Thrown by `recordFile` when a file that landed would take the account past its allowance. */
export class StorageFullError extends Error {
  constructor(accountId: string) {
    super(`storage allowance reached for account ${accountId}`);
    this.name = "StorageFullError";
  }
}

/**
 * Idempotent on UploadThing's file key, like `recordLogo`, and like it takes
 * the account id the upload middleware attached, since the completion
 * callback has no session.
 *
 * `quotaBytes` is the account's page-file allowance, worked out by the upload
 * middleware and carried here in its signed metadata. The middleware already
 * refused an upload that would not fit, but several requests can pass it at
 * once before any file lands, so the allowance is checked again here, under a
 * per-account lock, against what is actually stored. A file that does not fit
 * is refused with `StorageFullError`, and the caller deletes it from
 * UploadThing. A file already recorded (a repeated callback) is returned as it
 * is, never refused: it is already counted.
 */
export async function recordFile(
  accountId: string,
  file: { key: string; url: string; name: string; type: string; size: number },
  quotaBytes: number
): Promise<StoredFile> {
  if (!isUploadThingUrl(file.url)) {
    throw new Error("Upload completed with a URL that is not UploadThing's");
  }
  return withTransaction(async (run) => {
    // Transaction-scoped, so it is released at commit and safe through the
    // pooler. Serialises one account's recordings; other accounts never wait.
    await run("select pg_advisory_xact_lock(hashtextextended('qr_files:' || $1, 0))", [accountId]);

    const [existing] = await run<FileRow>(
      `-- scope: proved by the upload middleware (see recordLogo)
       select id, url, name, mime_type from qr_files where file_key = $1 and user_id = $2`,
      [file.key, accountId]
    );
    if (existing) return toFile(existing);

    const [usage] = await run<{ used: string }>(
      `-- scope: proved by the upload middleware (see recordLogo)
       select coalesce(sum(size_bytes), 0) as used from qr_files where user_id = $1`,
      [accountId]
    );
    if (Number(usage.used) + file.size > quotaBytes) throw new StorageFullError(accountId);

    const [row] = await run<FileRow>(
      `-- scope: proved by the upload middleware (see recordLogo)
       insert into qr_files (user_id, file_key, url, name, mime_type, size_bytes)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (file_key) do update set file_key = excluded.file_key
       returning id, url, name, mime_type`,
      [accountId, file.key, file.url, file.name.slice(0, 200), file.type, file.size]
    );
    return toFile(row);
  });
}

/** Bytes of page files the account holds, every one of them, used or not. */
export async function storageUsed(scope: AccountScope): Promise<number> {
  const row = await queryOne<{ used: string }>(
    `select coalesce(sum(size_bytes), 0) as used from qr_files
     where user_id = $1 and ${access(2)}`,
    [scope.accountId, ...accessArgs(scope, "read")]
  );
  return Number(row?.used ?? 0);
}

/** The code kinds that are hosted pages: every dynamic kind that is not a plain link. */
export const PAGE_KINDS: readonly string[] = DYNAMIC_KINDS.filter((kind) => !isLinkKind(kind));

/**
 * Whether the account already has a hosted page (not archived). A plan
 * without `hosted_pages` cannot make new pages, but a page that exists stays
 * editable whatever the plan (`canMakeHostedPages`), and editing a page can
 * mean replacing its photo.
 */
export async function hasPageCodes(scope: AccountScope): Promise<boolean> {
  const row = await queryOne<{ has: boolean }>(
    `select exists (
       select 1 from qr_codes
       where user_id = $1 and archived_at is null and kind = any($2::text[]) and ${access(3)}
     ) as has`,
    [scope.accountId, PAGE_KINDS, ...accessArgs(scope, "read")]
  );
  return row?.has === true;
}

export type ResolveResult = { ok: true; content: unknown } | { ok: false; reason: string };

/**
 * Replace every file reference in submitted content with the account's own
 * record of that file, or refuse the content if any reference is not theirs.
 *
 * Runs before the schema parse, so the parse checks the stored MIME type
 * rather than whatever the client claimed, and the stored page can only ever
 * point at a URL this server recorded from an UploadThing callback.
 */
export async function resolveFiles(scope: AccountScope, content: unknown): Promise<ResolveResult> {
  const ids = [...collectFileIds(content)].filter((id) => /^[1-9]\d{0,18}$/.test(id));
  const all = collectFileIds(content);
  if (ids.length !== all.size) {
    return { ok: false, reason: "That file could not be found. Upload it again." };
  }
  if (ids.length === 0) return { ok: true, content };

  const rows = await query<FileRow>(
    `select id, url, name, mime_type from qr_files
     where user_id = $1 and id = any($2::bigint[]) and ${access(3)}`,
    [scope.accountId, ids, ...accessArgs(scope, "read")]
  );
  const owned = new Map(rows.map((row) => [String(row.id), toFile(row)]));
  if (owned.size !== ids.length) {
    return { ok: false, reason: "That file could not be found. Upload it again." };
  }

  function swap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(record)) out[key] = swap(child);
      if (typeof record.fileId === "string") {
        const stored = owned.get(record.fileId)!;
        out.url = stored.url;
        out.name = stored.name;
        out.mime = stored.mime;
      }
      return out;
    }
    return value;
  }

  return { ok: true, content: swap(content) };
}

export type LibraryFile = StoredFile & {
  sizeBytes: number;
  uploadedAt: Date;
  /** Live codes whose page shows this file, newest code first. */
  usedBy: { codeId: string; name: string; shortCode: string; kind: string }[];
};

type LibraryCode = { id: string; name: string; shortCode: string; kind: string; content: unknown };

/**
 * Pair each file with the codes whose saved page refers to it. Pure, so the
 * matching can be tested without a database: a file is used by a code when
 * the code's content carries its `fileId`, the same reference
 * `resolveFiles` checks on every save.
 */
export function attachUses(
  files: (StoredFile & { sizeBytes: number; uploadedAt: Date })[],
  codes: LibraryCode[]
): LibraryFile[] {
  const uses = new Map<string, LibraryFile["usedBy"]>();
  for (const code of codes) {
    for (const fileId of collectFileIds(code.content)) {
      const list = uses.get(fileId) ?? [];
      list.push({ codeId: code.id, name: code.name, shortCode: code.shortCode, kind: code.kind });
      uses.set(fileId, list);
    }
  }
  return files.map((file) => ({ ...file, usedBy: uses.get(file.id) ?? [] }));
}

/**
 * The Files page: every file the account has uploaded for its pages, and
 * where each one is used. Archived codes are left out, as they are from the
 * dashboard, so a file only an archived code used reads as unused.
 */
export async function listFileLibrary(scope: AccountScope): Promise<LibraryFile[]> {
  const [files, codes] = await Promise.all([
    query<FileRow & { size_bytes: string; created_at: Date }>(
      `select id, url, name, mime_type, size_bytes, created_at from qr_files
       where user_id = $1 and ${access(2)}
       order by created_at desc, id desc`,
      [scope.accountId, ...accessArgs(scope, "read")]
    ),
    query<{ id: string; name: string; short_code: string; kind: string; content: unknown }>(
      `select id, name, short_code, kind, content from qr_codes
       where user_id = $1 and archived_at is null and content is not null and ${access(2)}
       order by created_at desc`,
      [scope.accountId, ...accessArgs(scope, "read")]
    ),
  ]);

  return attachUses(
    files.map((row) => ({
      ...toFile(row),
      sizeBytes: Number(row.size_bytes),
      uploadedAt: row.created_at,
    })),
    codes.map((row) => ({
      id: String(row.id),
      name: row.name,
      shortCode: row.short_code,
      kind: row.kind,
      content: row.content,
    }))
  );
}

/** Shared with the upload form, which names an oversized file before sending it. */
export { formatBytes } from "@/lib/upload-limits";

/** What kind of file it is, in one word, for a list. */
export function fileKind(mime: string): "PDF" | "Image" | "Video" | "Audio" | "File" {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Image";
  if (mime.startsWith("video/")) return "Video";
  if (mime.startsWith("audio/")) return "Audio";
  return "File";
}
