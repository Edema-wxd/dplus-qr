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

- Raw SQL through the Neon pool. No ORM.
- Every change is a new numbered file in `db/migrations/`, additive only. Never
  edit a migration that has run; the runner's checksum check will stop you.
- Every query touching client data filters by the session's user id.
- `qr_codes.user_id` is `on delete restrict` on purpose. Accounts are suspended
  and codes are paused; neither is deleted.

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
env, so the runner checks for `DATABASE_URL` and says so.

## Working process

- Plan each phase and wait for approval before writing code.
- Branch per phase (`qr/phase-1-foundation`), PR for review. Never push to
  `main`.
- Tests alongside code. A phase is done when its acceptance criteria pass.

## Status

Scaffold and redirect spike complete. Phase 1 (auth, verification, dashboard)
not started. See DECISIONS.md for what is still open.
