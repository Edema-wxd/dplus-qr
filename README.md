# dplus-qr

Dynamic QR codes for [De Sign Plus](https://de-signplus.com). Serves
`qr.de-signplus.com`: the code redirects, the status pages people land on when a
code is paused or disabled, and (from Phase 1) client accounts and the dashboard.

A printed code points at this host and never changes. Only its destination does.

## Setup

```bash
npm install
neon deploy                    # provisions Postgres, Auth and the bucket, and
                               # writes their env vars into .env.local
# then add NEON_AUTH_COOKIE_SECRET yourself: openssl rand -base64 32
npm run db:migrate
npm run seed:codes             # prints scannable test codes in the terminal
npm run dev
```

Neon services are declared in `neon.ts`. `neon config plan` shows a dry-run diff
before `neon deploy` applies it.

`npm test` and `npm run build` need no database or network — the build is
verified to pass under an empty environment, because Next evaluates route
modules while collecting configuration and a build has no business holding
secrets.

The demo runs at **https://dplus-qr.vercel.app**. To scan the current codes with
a phone:

```bash
npm run codes -- --base https://dplus-qr.vercel.app
```

## How a scan works

1. A phone opens `/{code}` on this host.
2. The format is checked — anything not 7 base-58 characters is rejected without
   touching the database.
3. The destination is read from the in-process cache, then Redis, then Postgres.
4. A `302` with `Cache-Control: no-store` goes out, or a status page if the code
   is paused, blocked, or its owner's subscription has lapsed past grace.
5. **After** the response is sent, `after()` records the scan: Redis counters, a
   `qr_scans` row, parsed device, bot flag, hashed IP.

Nothing in step 5 can delay or break step 4.

## Layout

| Path | What |
| --- | --- |
| `src/app/[code]/route.ts` | The redirect. The one path that must never break |
| `src/app/(status)/` | Paused, blocked, not-found and report pages |
| `src/app/health/` | Uptime check: 200 while the database answers |
| `src/app/(app)/` | Sign-up, sign-in and the protected account page |
| `src/app/api/auth/` | Same-origin proxy to Neon Managed Better Auth |
| `src/proxy.ts` | Route protection (Next 16's replacement for middleware) |
| `neon.ts` | Neon services as code: Postgres, Auth, the `assets` bucket |
| `src/lib/` | Everything the redirect path is allowed to import |
| `db/migrations/` | Numbered, additive SQL. The schema's source of truth |
| `scripts/` | Migration runner, seed, code viewer, Vercel env sync |
| `docs/qr-platform/` | Design documents. `DECISIONS.md` is authoritative |

## Documentation

- [DECISIONS.md](docs/qr-platform/DECISIONS.md) — what was decided and why,
  including where the original handover is out of date
- [HANDOVER.md](docs/qr-platform/HANDOVER.md) — phases and acceptance criteria
- [INFRASTRUCTURE.md](docs/qr-platform/INFRASTRUCTURE.md) — architecture, data
  model, billing, security, costs
- [CLAUDE.md](CLAUDE.md) — rules for working in this repo
