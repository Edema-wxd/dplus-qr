# dplus-qr

Dynamic QR codes for [De Sign Plus](https://de-signplus.com). Serves
`qr.de-signplus.com`: the code redirects, the status pages people land on when a
code is paused or disabled, and (from Phase 1) client accounts and the dashboard.

A printed code points at this host and never changes. Only its destination does.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in DATABASE_URL at minimum
npm run db:migrate
npm run seed:codes             # prints scannable test codes in the terminal
npm run dev
```

`npm test` and `npm run build` need no database or network.

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
| `src/lib/` | Everything the redirect path is allowed to import |
| `db/migrations/` | Numbered, additive SQL. The schema's source of truth |
| `scripts/` | Migration runner and seed |
| `docs/qr-platform/` | Design documents. `DECISIONS.md` is authoritative |

## Documentation

- [DECISIONS.md](docs/qr-platform/DECISIONS.md) — what was decided and why,
  including where the original handover is out of date
- [HANDOVER.md](docs/qr-platform/HANDOVER.md) — phases and acceptance criteria
- [INFRASTRUCTURE.md](docs/qr-platform/INFRASTRUCTURE.md) — architecture, data
  model, billing, security, costs
- [CLAUDE.md](CLAUDE.md) — rules for working in this repo
