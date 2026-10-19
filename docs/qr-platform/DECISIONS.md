# Decisions

Decided 19 October 2026 with Francis, at the start of the build. Where this file
disagrees with HANDOVER.md or INFRASTRUCTURE.md, **this file wins** — those two
were written before anyone read the current `dplus` repo, and several of their
stated facts were already out of date.

## Why these supersede the handover

The handover describes a `dplus` repo running Next 15 against a local
PostgreSQL 10.23 on cPanel, with a `users` table and a `nodemailer` peer
conflict. What the repo actually contains:

| Handover says | Reality in `dplus`, Oct 2026 |
| --- | --- |
| Next.js `^15.5.9` | `^16.3.4` |
| Local PostgreSQL 10.23, outbound 5432 blocked | `@neondatabase/serverless` over HTTPS |
| Extend the `users` table with a `role` | No `users` table; auth reads `admin_users`, which has no role column |
| Pin `nodemailer` to `^7` | Pinned to `^8.0.11` by a commit explicitly fixing compatibility |
| Logos to S3 via presigned URLs | UploadThing is the working upload path |
| Numbered migrations in `db/migrations/` | Hand-written `docs/*-schema.sql` plus `apply-*-schema.ts` scripts |

Consequently **every Postgres 10 restriction in those documents is void**, and
the nodemailer instruction is not just unnecessary but a regression.

## The decisions

| # | Question | Decision |
| --- | --- | --- |
| 1 | Where the code lives | Standalone `dplus-qr` repo and app, not inside `dplus` |
| 2 | Database | New Neon project, modern Postgres. All PG10 rules dropped |
| 3 | Hosting | Deferred. Nothing host-specific; cron logic behind protected endpoints |
| 4 | Client accounts | Own `qr_users` table and auth. `dplus`'s `admin_users` untouched |
| 5 | Dashboard home | **`qr.de-signplus.com`** hosts redirects *and* login and dashboard. `de-signplus.com/qr` is a marketing page that links across |
| 6 | Redirect isolation | Route-group isolation in one deploy, enforced by a test |
| 7 | Schema tooling | Numbered `.sql` files plus a `tsx` runner. No ORM |
| 8 | Next.js version | 16, matching `dplus` |
| 9 | Destination cache | In-process Map → Redis → Postgres, so the hosting choice stays open |
| 10 | Geo and reputation | Both deferred behind stub interfaces. No licence commitment yet |
| 11 | Reserved codes | Blocklisted in the generator, covering routes and brand-sensitive words |
| 12 | Short code | 7 characters, base-58 without `0 O I l` — confirmed |
| 13 | Redirect rate limit | **300/min/IP**, and a limited request is still redirected; only the scan record is dropped |
| 14 | Status page styling | Tailwind plus the De Sign Plus tokens, Sarlotte and logos |
| 15 | Email | Resend, reusing the verified De Sign Plus domain |
| 16 | Product name | **Still open.** Placeholder lives in `src/lib/brand.ts` |

### Decision 5 changes the shape of the project

An earlier answer put the dashboard in the `dplus` repo; decision 5 reversed it.
The consequence is that this repo is the whole platform, not just a redirect
service, and `dplus` needs almost no changes — just a `/qr` page linking here.

It also means short codes share a URL namespace with application routes, which
is why decision 11 exists and why `RESERVED_CODES` must be extended whenever a
route is added.

## Still open

Business decisions, none of which block the current phase:

- Product name (decision 16)
- Plan names, naira prices, code limits, annual discount
- Free trial, and whether codes go live during one
- Grace period after a failed renewal (7 days proposed)
- How long lapsed codes stay paused before deletion (12 months proposed)
- MaxMind GeoLite2 commercial-use licence, and Google Web Risk pricing
- Whether De Sign Plus must register with the Nigeria Data Protection Commission

Infrastructure, needed before this can run end to end:

- Neon project and `DATABASE_URL`
- Upstash credentials: reuse `dplus`'s, or a separate instance
- `qr.de-signplus.com` DNS, required before the first code is printed
