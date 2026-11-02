import { query, withTransaction } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Deleting UploadThing files that nothing uses any more.
 *
 * Two steps, so a file is never lost track of:
 *
 * 1. **Find orphans and queue them**, in one database transaction: page files
 *    (`qr_files`) no code's content refers to, and logos removed from the
 *    library (`qr_logos.archived_at`) that no code is drawn with. Each must be
 *    at least `GRACE_DAYS` old, so a file uploaded into a form that has not
 *    been saved yet is left alone. Their rows are deleted and their keys
 *    queued in `qr_upload_deletions` together.
 * 2. **Delete queued files from UploadThing**, marking each done. A refusal is
 *    recorded and retried on the next run. Erasing an account (staff or the
 *    retention sweep) queues any file it could not delete the same way.
 *
 * Off until `DELETION_SWEEPS_ENABLED=true`, like the retention sweep: a dry
 * run counts what it would remove and changes nothing.
 */

export const GRACE_DAYS = 7;
export const BATCH = 200;

export type UploadCleanupReport = {
  enabled: boolean;
  orphanFiles: number;
  orphanLogos: number;
  deleted: number;
  failed: number;
  stillQueued: number;
};

/** Queue keys for deletion. Used by every path that drops a file's row. */
export async function queueUploadDeletions(keys: string[], reason: string): Promise<void> {
  if (keys.length === 0) return;
  await query(
    `insert into qr_upload_deletions (file_key, reason)
     select unnest($1::text[]), $2
     on conflict (file_key) do nothing`,
    [keys, reason]
  );
}

// A page file is in use while any code of its owner has a `fileId` equal to
// its id anywhere in its content. jsonb_path `$.**` walks every nested value.
const ORPHAN_FILES = `
  select f.id, f.file_key from qr_files f
  where f.created_at < now() - make_interval(days => ${GRACE_DAYS})
    and not exists (
      select 1 from qr_codes c
      where c.user_id = f.user_id
        and c.content is not null
        and jsonb_path_exists(c.content, '$.** ? (@.fileId == $id)', jsonb_build_object('id', f.id::text))
    )
  order by f.id
  limit ${BATCH}
`;

// A logo is in use while it is in the library or any code is drawn with it.
const ORPHAN_LOGOS = `
  select l.id, l.file_key from qr_logos l
  where l.archived_at is not null
    and l.archived_at < now() - make_interval(days => ${GRACE_DAYS})
    and not exists (select 1 from qr_codes c where c.logo_id = l.id)
  order by l.id
  limit ${BATCH}
`;

type Orphan = { id: string; file_key: string };

export async function runUploadCleanup(enabled: boolean): Promise<UploadCleanupReport> {
  const report: UploadCleanupReport = {
    enabled,
    orphanFiles: 0,
    orphanLogos: 0,
    deleted: 0,
    failed: 0,
    stillQueued: 0,
  };

  if (!enabled) {
    const [files, logos, queued] = await Promise.all([
      query<Orphan>(ORPHAN_FILES),
      query<Orphan>(ORPHAN_LOGOS),
      query<{ n: string }>(`select count(*) as n from qr_upload_deletions where deleted_at is null`),
    ]);
    report.orphanFiles = files.length;
    report.orphanLogos = logos.length;
    report.stillQueued = Number(queued[0]?.n ?? 0);
    return report;
  }

  // Step 1: drop orphan rows and queue their keys, all or nothing. The
  // orphan checks run again inside the transaction, so a code saved a moment
  // ago with one of these files is seen.
  const queued = await withTransaction(async (run) => {
    const files = await run<Orphan>(`${ORPHAN_FILES} for update of f skip locked`);
    const logos = await run<Orphan>(`${ORPHAN_LOGOS} for update of l skip locked`);
    const keys = [...files, ...logos].map((row) => row.file_key);
    if (keys.length > 0) {
      await run(
        `insert into qr_upload_deletions (file_key, reason)
         select unnest($1::text[]), 'orphan'
         on conflict (file_key) do nothing`,
        [keys]
      );
    }
    if (files.length > 0) {
      await run(`delete from qr_files where id = any($1::bigint[])`, [files.map((f) => f.id)]);
    }
    if (logos.length > 0) {
      await run(`delete from qr_logos where id = any($1::bigint[])`, [logos.map((l) => l.id)]);
    }
    return { files: files.length, logos: logos.length };
  });
  report.orphanFiles = queued.files;
  report.orphanLogos = queued.logos;

  // Step 2: delete what is queued.
  const pending = await query<{ file_key: string }>(
    `select file_key from qr_upload_deletions
     where deleted_at is null order by queued_at limit ${BATCH}`
  );
  if (pending.length > 0) {
    const keys = pending.map((row) => row.file_key);
    try {
      if (!env().UPLOADTHING_TOKEN) throw new Error("UPLOADTHING_TOKEN is not set");
      const { UTApi } = await import("uploadthing/server");
      await new UTApi().deleteFiles(keys);
      await query(
        `update qr_upload_deletions set deleted_at = now(), attempts = attempts + 1, last_error = null
         where file_key = any($1::text[])`,
        [keys]
      );
      report.deleted = keys.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[uploads] queued deletes failed; will retry", { count: keys.length, error });
      await query(
        `update qr_upload_deletions set attempts = attempts + 1, last_error = $2
         where file_key = any($1::text[])`,
        [keys, message.slice(0, 500)]
      );
      report.failed = keys.length;
    }
  }

  const left = await query<{ n: string }>(
    `select count(*) as n from qr_upload_deletions where deleted_at is null`
  );
  report.stillQueued = Number(left[0]?.n ?? 0);
  return report;
}
