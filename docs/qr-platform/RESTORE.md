# Backups and restoring

How the database is backed up, how to set it up, and how to get data back.
The decisions behind it are in DECISIONS.md (8 November 2026, backups).

## What exists

There are two layers, because they cover different time spans.

| Layer | Reaches back | Covers | Where it lives |
|---|---|---|---|
| Neon instant restore | 6 hours (Free plan) | Everything, to the second, auth included | Neon |
| Nightly copy | 30 days, one copy per night | Every table in `public` and `neon_auth` | GitHub Actions artifacts, encrypted |

The nightly job (`.github/workflows/backup.yml`, 01:17 UTC) does four things,
and keeps a copy only if all of them succeed:

1. Dumps production with `pg_dump`.
2. Restores the dump into a scratch Postgres. The copy is refused if the
   restore errors (except for an extension a plain Postgres lacks), or if any
   table is missing or short of rows.
3. Encrypts it with `age` to a public key. Only the matching private key,
   which never goes to GitHub, can open it.
4. Uploads it as an artifact kept 30 days, and logs the run in `qr_backups`.

The app reads `qr_backups`. At 05:10 UTC each day `/api/cron/backups` emails
staff if no good backup has landed in 30 hours, or if last night's run
failed. The admin overview shows "backup overdue" under Needs attention,
and the Monday summary has a line on backups.

## Setting it up (once)

1. **Make the key pair**, on your own computer, not a server:

   ```bash
   brew install age            # or: apt install age
   age-keygen -o qriateplus-backup-key.txt
   ```

   It prints `Public key: age1...`. The file holds the private key
   (`AGE-SECRET-KEY-1...`).

2. **Keep the private key in two safe places**, for example a password
   manager and a printed copy in the office. Without it no backup can ever be
   read. Do not put it in the repository, in Vercel, or in GitHub.

3. **In GitHub, open Settings, then Secrets and variables, then Actions:**
   - Variables tab: add `BACKUP_AGE_RECIPIENT` with the `age1...` public key.
   - Secrets tab: add `BACKUP_DATABASE_URL` with the production **direct**
     connection string, the value of `DATABASE_URL_UNPOOLED` from
     `neon env pull`. Strip the surrounding quotes. The pooled URL will not
     work, and the job refuses it.

4. **Run it once by hand:** open Actions, then "Nightly database backup",
   then "Run workflow". It takes a few minutes. Afterwards the admin
   overview's "backup job not set up" item disappears.

When credentials are rotated (CLAUDE.md, "Rotating credentials"), update
`BACKUP_DATABASE_URL` too, or the next night's backup fails and staff are
told.

## Which restore to use

- **Something went wrong in the last few hours** (a bad deploy, a mistaken
  bulk change): use **Neon instant restore**. In the Neon console, open the
  project, then Branches, then the production branch, then Restore, and pick
  a time just before the damage. Neon keeps the pre-restore state as a backup
  branch, so this can be undone. It brings back sign-ins too.
- **Older than 6 hours, or Neon itself is the problem:** use a **nightly
  copy**, below.

## Restoring from a nightly copy

Always restore somewhere scratch first and look, before touching production.

1. **Download the copy.** In GitHub, open Actions, then "Nightly database
   backup", then the night you want, and download its artifact. It is a zip
   holding one `qriateplus-db-<date>.dump.age`. Or, with the GitHub CLI:

   ```bash
   gh run list --workflow backup.yml
   gh run download <run-id>
   ```

2. **Decrypt it:**

   ```bash
   unzip qriateplus-db-*.zip
   age --decrypt -i qriateplus-backup-key.txt -o backup.dump qriateplus-db-*.dump.age
   ```

   `backup.dump` now holds customers' personal data in the clear. Keep it on
   your own machine and delete it when you are done (step 5).

3. **Restore it into a scratch database and look:**

   ```bash
   docker run -d --name restore -p 5433:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
   pg_restore --no-owner --no-privileges -d postgres://postgres@127.0.0.1:5433/postgres backup.dump
   psql postgres://postgres@127.0.0.1:5433/postgres -c "select count(*) from qr_codes"
   ```

   Use a Postgres at least as new as production's (the job's log says which
   version it found). An error about an extension is expected; anything else
   is not.

4. **Bring back what was lost.**
   - *Some rows* (a deleted code, an overwritten destination): copy them
     across with `psql` from the scratch database to production. Write it as
     a reviewed SQL script, and run it in a transaction against the direct
     URL.
   - *The whole database* (production is gone): create a new Neon project or
     branch with `neon deploy` (it sets up auth and the bucket from
     `neon.ts`), then restore the app's tables:

     ```bash
     pg_restore --no-owner --no-privileges --schema=public -d "$NEW_DATABASE_URL_UNPOOLED" backup.dump
     ```

     Sign-ins live in `neon_auth`, which the managed auth service owns and
     creates for itself. Restore its rows into the tables it made, data only:

     ```bash
     pg_restore --data-only --no-owner --schema=neon_auth -d "$NEW_DATABASE_URL_UNPOOLED" backup.dump
     ```

     This step has not been tried against a live Neon Auth: do it on a test
     branch first and check that an existing account can sign in. If the
     service's tables have changed shape, customers may need to reset their
     passwords; their codes and data are unaffected, because those are in
     `public`. Then `neon env pull`, `npm run env:sync`, register the origin
     with `neon neon-auth domain add`, and redeploy.

5. **Clean up:** `docker rm -f restore`, and delete `backup.dump` and the zip.

## If the private key is lost

Every existing copy is unreadable. Make a new key pair, replace
`BACKUP_AGE_RECIPIENT`, and run the job by hand. The old copies age out on
their own within 30 days.

## Notes

- **Erasure.** A deleted or erased account stays in the nightly copies until
  they expire, 30 days at most. The privacy page says so. Do not restore an
  erased account's data back into production.
- **Storage.** Artifacts count against the GitHub account's Actions storage
  (500 MB on a free account). 30 copies of today's database are well inside
  it; the Monday summary shows each copy's size, so growth will be seen
  before it matters.
