# Staging

A copy of the service with its own database, for checking a change before it
reaches customers. The decisions behind it are in DECISIONS.md (12 November
2026, staging).

## What it is

- **Vercel's Preview environment is staging.** Every PR preview, and a
  standing `staging` git branch served at `staging.qriateplus.com`, run on a
  separate Neon branch called `staging`, never on the production database.
  (Vercel custom environments need a paid plan; this works on the current
  one.)
- **The staging database starts empty**: production's schema, no customer
  data. Test accounts are made by signing up on staging and running the
  seed. No real name or email ever sits in staging.
- **Previews apply migrations to staging**, so a PR is tried with its own
  schema change. They do so only when the database itself is marked staging
  (a database setting, `qr.environment = 'staging'`). A preview pointed at
  production by mistake finds no mark and only reports, as before.
- **No payments yet.** Checkout on staging says payments are switched off;
  the seed puts a test account on the top plan instead.
- **It cannot reach customers**: no mail key (app mail is logged, not sent),
  no cron secret (no scheduled job runs), no error alerts (production only),
  and a strip on every page saying it is staging. Crawlers are kept out by
  `robots.txt` and an `X-Robots-Tag: noindex` header.
- **Artwork made on staging does not scan.** A printed code always encodes
  `qriateplus.com` (CLAUDE.md), which does not know staging's codes. Test a
  scan by opening `staging.qriateplus.com/<code>` on the phone instead.

## Setting it up (once)

1. **Make the Neon branch.** In the Neon console, open the project, then
   Branches, then "New branch". Name it `staging`, with the production branch
   as parent. (It starts as a copy; step 3 empties it.)

2. **Write `.env.staging`** in the repository folder. It is git-ignored, like
   `.env.local`. From the console's Connect dialog for the `staging` branch:

   ```bash
   DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require     # pooled
   DATABASE_URL_UNPOOLED=postgresql://.../neondb?sslmode=require      # direct
   NEON_BRANCH=staging
   NEON_AUTH_BASE_URL=...        # the staging branch's Auth page
   NEON_AUTH_JWKS_URL=...        # the staging branch's Auth page
   NEON_AUTH_COOKIE_SECRET=...   # new: openssl rand -base64 32
   SCAN_IP_SALT=...              # new: openssl rand -base64 32
   QR_BASE_URL=https://staging.qriateplus.com
   ```

   Use new secrets, not production's. The staging script and the env sync
   both refuse a file that points at the production database.

3. **Mark it, then empty it:**

   ```bash
   npm run staging -- mark          # sets qr.environment = 'staging' on it
   npm run staging -- reset --yes   # drops every table, rebuilds from db/migrations,
                                    # and removes every account from Neon Auth
   npm run staging -- status
   ```

4. **Point Vercel's previews at it:**

   ```bash
   npm run env:sync -- --file .env.staging --target preview
   ```

   `npm run env:sync` on its own now sends `.env.local` to production only,
   and refuses to send it to preview.

5. **Give staging its address.** Create a `staging` branch in GitHub from
   `main`. In Vercel, open the project, then Settings, then Domains, add
   `staging.qriateplus.com`, and connect it to the Git branch `staging`.

6. **Let sign-in work there.** On the staging branch's Neon Auth, register
   the origin (`neon neon-auth domain add https://staging.qriateplus.com`,
   choosing the `staging` branch; see `neon neon-auth domain add --help`), and
   check its email provider. Verification links need custom SMTP, as in
   production (CLAUDE.md, Auth).

7. **Make your test account:** sign up at `https://staging.qriateplus.com`,
   open `/app` once, then:

   ```bash
   npm run staging -- seed --email you@example.com
   ```

   That account becomes staff, on the top plan for a year, with an active, a
   paused and a blocked code, whose links it prints.

## Using it

- **A PR** gets a preview on the staging database, with its migrations
  applied. Preview URLs are not registered with Neon Auth, so pages that need
  sign-in are tried at the staging address instead.
- **To try a change at `staging.qriateplus.com`**, point the `staging`
  branch at it: `git push --force origin <your-branch>:staging`. When done,
  point it back at `main` the same way.
- **Before a release** (INFRASTRUCTURE.md, release checklist): deploy the
  change to staging, sign up, make a code, open its staging link on a phone,
  and check `/health` there.

## When staging drifts

Staging collects every PR's migrations, merged or not. If a preview fails
with "These applied migrations have been edited since they ran", or staging
holds a table from an abandoned PR, rebuild it:

```bash
npm run staging -- reset --yes
npm run staging -- seed --email you@example.com   # after signing up again
```

The mark survives a reset. It does not survive recreating the branch from
production in the Neon console: mark it again, or previews only report.

## Shared with production, for now

- **UploadThing**: previews use the same `UPLOADTHING_TOKEN`, so files
  uploaded on staging land in production's UploadThing app, and production's
  upload sweep would delete them once it is switched on. Give staging its own
  UploadThing app before relying on staging uploads.
- **Object storage**: previews have their own `AWS_*` values in Vercel; check
  they name a bucket that is not production's before generating artwork there.
