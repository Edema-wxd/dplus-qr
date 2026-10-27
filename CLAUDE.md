# dplus-qr

The De Sign Plus dynamic QR platform. Standalone Next.js 16 app serving
`qr.de-signplus.com`: redirects, status pages, client accounts and dashboard.

## Read before any work

1. `docs/qr-platform/DECISIONS.md` — **authoritative.** Supersedes the other two
   wherever they disagree.
2. `docs/qr-platform/HANDOVER.md` — phasing, rules, acceptance criteria.
3. `docs/qr-platform/INFRASTRUCTURE.md` — architecture, data model, billing,
   security.

This is **not** the `dplus` repo. The marketing site lives in
`../dplus` and shares nothing with this app but a brand — no shared database, no
shared auth. Do not edit `../dplus` as part of work here.

## The one rule

A printed code must keep working for years. When a choice trades redirect
reliability for a feature, reliability wins. Everything below follows from that.

## Non-negotiables

**The redirect path** (`src/app/[code]/route.ts`)

- Always `302`, never `301`. A `301` is cached permanently by the browser, so a
  later destination change would never reach anyone who already scanned.
- `Cache-Control: no-store` on every response.
- One cached lookup, then respond. Scan recording goes in `after()` and is
  never awaited inline.
- Import only from `@/lib`. `src/__tests__/redirect-isolation.test.ts` fails the
  suite if dashboard, component or React code enters its module graph.
- A Redis, geo or tracking failure must never break or delay a redirect.

**Short codes**

- 7 characters, base-58 without `0 O I l`.
- **Adding a route means adding its name to `RESERVED_CODES`** in
  `src/lib/short-code.ts`. Codes share a URL namespace with pages on this host,
  so an unreserved route name can be issued as a code and dead-end a printed
  code.
- Collisions are resolved by the unique index and a retry, never by checking
  first — checking races.

**Database**

- Raw SQL through `pg` (`src/lib/db.ts`). No ORM.
- **Two connection strings, and the difference matters.** `DATABASE_URL` is
  pooled (PgBouncer) and is what the app queries through. `DATABASE_URL_UNPOOLED`
  is direct and is required for migrations, `pg_dump`, logical replication and
  anything using session state. Over a pooled connection those fail in ways
  that never mention pooling — a `search_path` that does not outlive its own
  statement, or `prepared statement "s0" already exists`. `scripts/migrate.ts`
  refuses to run against a `-pooler` host.
- Both are Neon-managed: `neon env pull` writes them. Never hand-edit.
- Every change is a new numbered file in `db/migrations/`, additive only. Never
  edit a migration that has run; the runner's checksum check will stop you.
- Every query touching client data filters by the session's user id.
- `qr_codes.user_id` is `on delete restrict` on purpose. Accounts are suspended
  and codes are paused; neither is deleted.

**Auth**

- Accounts are **Neon Managed Better Auth**, not next-auth. They live in the
  `neon_auth` schema of the same branch, so auth state branches with the data.
- **All mail goes through Resend, by two paths.** This app's own messages
  (admin alerts, abuse reports) use the Resend API via `src/lib/email.ts` and
  `RESEND_API_KEY`. Neon Auth's verification, password-reset and OTP mail goes
  through the same Resend account over SMTP — `smtp.resend.com:587`, username
  `resend`, password the API key — configured once per branch with
  `neon neon-auth config email-provider update --type standard`. That
  credential lives in the managed service, not in `.env.local`, so it is not
  in the `env()` contract and login still needs no mailer in this process.
  Verification *links* require this custom SMTP; Neon's shared sender is
  development-only.
- **Senders are grouped by subject, never typed at a call site.** `MAIL_GROUPS`
  in `src/lib/email.ts` owns three identities and `sendEmail` requires one:
  `onboarding@` (auth, verification, reset, OTP, welcome), `plans@` (billing)
  and `support@` (complaints, abuse reports). There is deliberately no
  `EMAIL_FROM` env var — an override would let one deployment send billing mail
  from the onboarding address. Reputation accrues per address, so the split is
  what stops a bounced invoice run dragging down password resets.
- **Two mail domains, and mixing them loses mail.** `mail.qriateplus.com` is
  verified in Resend and publishes SPF/DKIM but **no MX**: it sends, and
  anything addressed to it is rejected with no notice to the sender. So every
  `Reply-To`, every `mailto:` in the UI and every internal alert recipient
  lives on the apex `qriateplus.com`, which has MX. `SENDING_DOMAIN` and
  `INBOX_DOMAIN` in `src/lib/brand.ts` name the two, and
  `src/__tests__/email-groups.test.ts` fails if a `Reply-To` lands on the
  send-only one.
- **A `from` on the bare apex is rejected with 403.** Resend verifies the exact
  domain whose DNS records were added, which is the `mail.` subdomain. A 403
  means app mail logs and carries on while auth mail never arrives.
- `qr_users` is a **profile** table, not the account record. Its `id` equals
  `neon_auth."user".id`. There is no database trigger joining them —
  `ensureProfile()` in `src/lib/profile.ts` is the seam, called on sign-up and
  on every authenticated page load so it also repairs a missed row.
- Deliberately no cross-schema foreign key to `neon_auth."user"`: that table
  belongs to a managed service that may reshape it.
- `proxy.ts` guards pages. A proxy matcher protects pages, not data — check the
  session again inside any Route Handler or Server Action that reads or writes.
- Never give the matcher a catch-all: it would redirect CSS and JS for
  signed-out visitors, so the sign-in page could not load. The redirect path
  `/{code}` must never be in it.
- Production needs custom SMTP and `neon neon-auth domain add <origin>` for
  each deployed origin. Localhost is pre-approved.

**Security**

- Validate all input with `zod` on the server.
- Verify `x-paystack-signature` against the raw body before reading it.
  Webhooks are the only source of truth for payment state.
- Store `sha256(ip + daily_salt)` only, never a raw IP, and never log one.
- Every new env var goes in `.env.example` with a placeholder and a comment.
- Never run `npm audit fix --force`.

## Next.js 16 notes

Read `node_modules/next/dist/docs/` before writing framework code — this version
differs from older training data. What has already bitten this repo:

- `middleware.ts` is deprecated, renamed to `proxy.ts`.
- **Cache Components is enabled** (`next.config.ts`). Therefore:
  - `export const dynamic = "force-dynamic"` is a build error. Data fetching is
    already dynamic by default.
  - A page reading `searchParams` must do it in a child inside `<Suspense>`, or
    the build fails on prerender. The status pages are built this way: static
    shell, streamed detail.
  - A route touching no request API is evaluated at build time — use
    `await connection()` to stop that (see `src/app/health/route.ts`).
  - A page whose whole content is per-request, with no useful static shell to
    stream around (an authenticated account page), sets
    `export const instant = false` instead of wrapping everything in Suspense.

## The build must need no secrets

`next build` collects route configuration, which evaluates route modules. Any
client constructed at module scope therefore runs during the build — and a
build has no reason to hold credentials. This broke the first Vercel deploy:
`createNeonAuth` at module scope called `env()`, which validates the whole
contract, so a route that needed only the auth URL failed on `DATABASE_URL`.

Two rules follow, and `next build` under an empty environment is the test:

- **Construct service clients lazily.** `src/lib/auth/server.ts` builds on first
  use behind a Proxy; the handler route and `proxy.ts` defer to it per request
  rather than destructuring at module scope.
- **Nothing is mandatory in the `env()` schema.** Mark it optional and call
  `required("NAME")` at the point of use, so a module only ever fails on a
  variable it actually asked for.

```bash
env -i PATH="$PATH" HOME="$HOME" npx next build   # must pass
```

## Deploying to Vercel

Project `francis-woods-projects/dplus-qr`, linked to the GitHub repo, so a push
to `main` deploys. Env vars are set in the project (production and preview).

- **Production deploys apply migrations before building.** `npm run build` is
  `tsx scripts/migrate.ts --deploy && next build`, pinned in `vercel.json`. On
  a production build it applies anything pending, so code can never go live
  ahead of its schema: on 27 Oct 2026 migration 017 was merged but not run, the
  redirect's one query named its new column, and every scan fell to the
  unavailable page. A failed migration fails the build, and the previous
  deploy keeps serving. Preview builds **only report**, because previews share
  the production database and must never apply an unmerged PR's schema.
  Locally the step does nothing. It needs `DATABASE_URL_UNPOOLED` in the
  Vercel project's Production environment (`npm run env:sync`). Each
  migration runs with a 5s `lock_timeout`: an `alter table qr_codes` that
  cannot get its lock fails the deploy rather than queueing every scan behind
  it.
- **`.env` values can be quoted, and piping them elsewhere strips nothing.**
  `neon deploy` writes `DATABASE_URL="postgres://…"` with quotes because the
  value contains `?` and `&`. Local loaders strip them; `vercel env add` does
  not, so the stored value kept its quotes and `pg` resolved the host as
  `base`, reporting `ENOTFOUND base`. Strip surrounding quotes before handing a
  value to another tool.
- **Geolocation is free here.** `src/lib/geo.ts` reads `x-vercel-ip-country`,
  which Vercel populates, so scans record a country with no MaxMind licence and
  no 60MB database at startup. On a host that does not supply it the field goes
  back to null, which is why the lookup stays behind that interface.
- Register each deployed origin with Managed Auth, or sign-in fails with
  `invalid domain`: `neon neon-auth domain add https://<origin>`.
- **Deployment Protection does not cover the production domain.** With
  `ssoProtection: all_except_custom_domains`, the per-deployment URLs
  (`dplus-<hash>-<team>.vercel.app`) redirect to `vercel.com/sso-api`, while
  `dplus-qr.vercel.app` is served to anyone. Verify which URL you are testing
  before concluding the app is private: automated access to a per-deployment
  URL needs `x-vercel-protection-bypass`, and `vercel curl` generates that
  token on demand (it does not forward arbitrary curl flags, so use plain curl
  with the header when you need to inspect responses).
- Rotating credentials: `neon api -X POST
  /projects/{id}/branches/{branch}/roles/{role}/reset_password`, then
  `neon env pull`, then `npm run env:sync`, then redeploy.

## Running a local demo

```bash
npx next dev -H 0.0.0.0 -p 3100          # -H so a phone on the WiFi can reach it
npm run codes -- --base http://<lan-ip>:3100   # scannable QR images
```

- **Pick a port nobody else is on.** Two dev servers can both "succeed" on one
  port — one binding IPv4, the other IPv6 — and macOS resolves `localhost` to
  IPv6 first, so `curl localhost:3000` silently hits the other project while
  `127.0.0.1:3000` hits yours. Check with
  `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
- Add each dev origin to `allowedDevOrigins` in `next.config.ts`, or Next blocks
  HMR for it, and register it with Managed Auth
  (`neon neon-auth domain add http://<lan-ip>:<port>`) or sign-in returns
  `invalid domain`.
- **Status-page redirects use a relative `Location`.** Never rebuild them from
  `request.nextUrl.origin`: bound to `0.0.0.0` that emits
  `http://0.0.0.0:3100/paused`, which no phone can follow.

## Commands

```bash
npm run dev                  # localhost:3000
npm test                     # jest, no database needed
npm run build                # must pass before any PR
npm run lint

npm run db:migrate           # apply pending migrations
npm run db:migrate:status    # report only
npm run seed:codes           # test account + codes, prints scannable QRs
```

Scripts read `.env.local` via `tsx --env-file`. A missing file is a silent empty
env, so the runner checks for the connection string and says so.

`tsx` compiles scripts to CJS, so **no top-level `await`** — wrap script bodies
in `async function main()` as the existing scripts do.

Neon infrastructure lives in `neon.ts` (Postgres, Auth, the `assets` bucket):

```bash
neon config plan      # dry-run diff
neon deploy           # apply, and pull env vars into .env.local
neon env pull         # refresh Neon-managed env vars
neon neon-auth status
```

## Working process

- Plan each phase and wait for approval before writing code.
- Branch per phase (`qr/phase-1-foundation`), PR for review. Never push to
  `main`.
- Tests alongside code. A phase is done when its acceptance criteria pass.

## Status

Scaffold and redirect spike complete. Phase 1 (auth, verification, dashboard)
not started. See DECISIONS.md for what is still open.
