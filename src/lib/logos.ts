import sharp from "sharp";
import { query, queryOne } from "@/lib/db";

/**
 * Each account's logo library.
 *
 * A logo is uploaded once, through UploadThing, and recorded here against the
 * account, so the next code the owner makes can reuse it from a picker rather
 * than asking for the file again.
 *
 * Dashboard-side only. Nothing on the redirect path reads a logo, and
 * `src/__tests__/redirect-isolation.test.ts` keeps it that way.
 *
 * **Every query filters by `user_id`**, as in `user-codes.ts`: a logo id from
 * a form is a guess until the database agrees it belongs to the session.
 */

/** Live logos an account may hold. Archived ones do not count. */
export const MAX_LOGOS = 50;

/** The largest file accepted, also stated to UploadThing as "1MB". */
export const MAX_LOGO_BYTES = 1024 * 1024;

/**
 * The types accepted. SVG is excluded on purpose: it can carry script, and a
 * logo is rendered inside the dashboard's own page.
 */
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type Logo = {
  id: string;
  url: string;
  name: string;
  createdAt: Date;
};

type LogoRow = { id: string; url: string; name: string; created_at: Date };

function toLogo(row: LogoRow): Logo {
  return {
    id: String(row.id),
    url: row.url,
    name: row.name,
    createdAt: row.created_at,
  };
}

/** Same guard as `parseCodeId`: a bigint id from a form, or nothing. */
export function parseLogoId(raw: string): string | null {
  return /^[1-9]\d{0,18}$/.test(raw) ? raw : null;
}

/**
 * Whether a URL is one UploadThing serves files from.
 *
 * Checked before the server fetches a logo, so the download route can only
 * ever be made to fetch from UploadThing, never from an address someone
 * slipped into a row. v7 serves from `<app-id>.ufs.sh`; older files from
 * `utfs.io`.
 */
export function isUploadThingUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return url.hostname.endsWith(".ufs.sh") || url.hostname === "utfs.io";
}

export async function listLogos(userId: string): Promise<Logo[]> {
  const rows = await query<LogoRow>(
    `select id, url, name, created_at
     from qr_logos
     where user_id = $1 and archived_at is null
     order by created_at desc
     limit ${MAX_LOGOS}`,
    [userId]
  );
  return rows.map(toLogo);
}

export async function countLogos(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `select count(*) from qr_logos where user_id = $1 and archived_at is null`,
    [userId]
  );
  return Number(row?.count ?? 0);
}

/** True when the logo is the account's own and still in its library. */
export async function ownsLiveLogo(userId: string, logoId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from qr_logos
     where user_id = $1 and id = $2 and archived_at is null`,
    [userId, logoId]
  );
  return row !== null;
}

/**
 * Record a finished upload.
 *
 * Idempotent on UploadThing's file key: if the completion callback is
 * delivered twice, the second lands on the row the first made.
 */
export async function recordLogo(
  userId: string,
  file: { key: string; url: string; name: string; type: string; size: number }
): Promise<Logo> {
  if (!isUploadThingUrl(file.url)) {
    throw new Error("Upload completed with a URL that is not UploadThing's");
  }

  const row = await queryOne<LogoRow>(
    `insert into qr_logos (user_id, file_key, url, name, mime_type, size_bytes)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (file_key) do update set file_key = excluded.file_key
     returning id, url, name, created_at`,
    [userId, file.key, file.url, file.name.slice(0, 200), file.type, file.size]
  );
  return toLogo(row!);
}

/**
 * Take a logo out of the picker.
 *
 * Not a delete. A code already drawn with it still downloads with it, because
 * the owner may reprint that code, and the file is what makes the reprint
 * match. Deleting files nothing references is a later sweep's job.
 */
export async function archiveLogo(userId: string, logoId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_logos set archived_at = now()
     where user_id = $1 and id = $2 and archived_at is null
     returning id`,
    [userId, logoId]
  );
  return row !== null;
}

/**
 * Set or clear a code's logo.
 *
 * The ownership check is inside the statement, so a logo id from another
 * account updates nothing rather than attaching someone else's file. Archived
 * logos are refused too: the picker no longer offers them.
 */
export async function setCodeLogo(
  userId: string,
  codeId: string,
  logoId: string | null
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_codes c
       set logo_id = $3::bigint, updated_at = now()
     where c.user_id = $1 and c.id = $2
       and (
         $3::bigint is null
         or exists (
           select 1 from qr_logos l
           where l.id = $3::bigint and l.user_id = $1 and l.archived_at is null
         )
       )
     returning c.id`,
    [userId, codeId, logoId]
  );
  return row !== null;
}

/** The pixel size a logo is normalised to before it is composited. */
const LOGO_RASTER_PX = 512;

/**
 * Fetch a logo from UploadThing and normalise it for compositing.
 *
 * Every logo, whatever it was uploaded as, comes out as a PNG no larger than
 * `LOGO_RASTER_PX` on its longer side, with EXIF rotation applied. Decoding
 * it here is also the check that the file really is an image: UploadThing
 * accepts a file by its declared type, and a file that sharp cannot read is
 * refused rather than embedded.
 *
 * Bounded in time and size, because this runs inside a request.
 */
export async function loadLogo(url: string): Promise<Buffer> {
  if (!isUploadThingUrl(url)) throw new Error("Logo URL is not UploadThing's");

  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Logo fetch failed: ${response.status}`);

  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_LOGO_BYTES) throw new Error("Logo is larger than allowed");

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_LOGO_BYTES) throw new Error("Logo is larger than allowed");

  return sharp(bytes, { limitInputPixels: 4096 * 4096 })
    .rotate()
    .resize(LOGO_RASTER_PX, LOGO_RASTER_PX, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}
