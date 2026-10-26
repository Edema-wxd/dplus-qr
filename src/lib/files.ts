import { query, queryOne } from "@/lib/db";
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

/** Idempotent on UploadThing's file key, like `recordLogo`. */
export async function recordFile(
  userId: string,
  file: { key: string; url: string; name: string; type: string; size: number }
): Promise<StoredFile> {
  if (!isUploadThingUrl(file.url)) {
    throw new Error("Upload completed with a URL that is not UploadThing's");
  }
  const row = await queryOne<FileRow>(
    `insert into qr_files (user_id, file_key, url, name, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (file_key) do update set file_key = excluded.file_key
     returning id, url, name, mime_type`,
    [userId, file.key, file.url, file.name.slice(0, 200), file.type, file.size]
  );
  return toFile(row!);
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
export async function resolveFiles(userId: string, content: unknown): Promise<ResolveResult> {
  const ids = [...collectFileIds(content)].filter((id) => /^[1-9]\d{0,18}$/.test(id));
  const all = collectFileIds(content);
  if (ids.length !== all.size) {
    return { ok: false, reason: "That file could not be found. Upload it again." };
  }
  if (ids.length === 0) return { ok: true, content };

  const rows = await query<FileRow>(
    `select id, url, name, mime_type from qr_files
     where user_id = $1 and id = any($2::bigint[])`,
    [userId, ids]
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
