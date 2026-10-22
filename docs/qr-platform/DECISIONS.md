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
| 3 | Hosting | **Vercel for the demo** (21 Oct 2026). Still nothing host-specific; cron logic behind protected endpoints |
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
| 16 | Product name | **QRiate+** (wordmark: QR capitalised, raised plus). Decided 22 Oct 2026 |

### Decision 5 changes the shape of the project

An earlier answer put the dashboard in the `dplus` repo; decision 5 reversed it.
The consequence is that this repo is the whole platform, not just a redirect
service, and `dplus` needs almost no changes — just a `/qr` page linking here.

It also means short codes share a URL namespace with application routes, which
is why decision 11 exists and why `RESERVED_CODES` must be extended whenever a
route is added.

## Amendments, 21 October 2026

**Hosting: demo on Vercel.** Decision 3 is partly settled — the first demo runs
on Vercel, with the custom domain deferred. Consequences:

- The in-process cache tier is near-useless between serverless invocations, so
  Redis becomes the cache that actually carries the demo. The three-tier design
  in `src/lib/cache.ts` already degrades correctly, but a demo without Redis
  means every scan reaches Postgres.
- `after()` is natively supported on Vercel, so scan recording needs no change.
- Cron jobs can use `vercel.json` crons rather than protected endpoints plus an
  external scheduler.

**`qr.de-signplus.com` DNS: deferred.** This is safe only while nothing is
printed. A demo deployment serves codes on a `*.vercel.app` URL, and
`QR_BASE_URL` must match it or the generated QR images will point somewhere
that does not resolve.

> **Do not print or distribute any code generated against a `*.vercel.app`
> base URL.** The host inside a printed code can never change, so a demo code
> is a demo code forever. Production codes wait for the real subdomain.

**Auth: Neon Managed Better Auth.** Provisioning Neon's `auth` service replaces
the next-auth plan in decision 4 and in both reference documents. Accounts live
in the `neon_auth` schema of the same branch, so auth state branches with the
data, and the service sends its own verification and password-reset email.

`neon_auth."user"` turned out to carry `id uuid`, `email`, `name`,
`emailVerified`, `role` and `banned` — the same uuid type migration `002` used
for `qr_users.id`, which made the reconciliation clean:

- `qr_users` became a **profile** table keyed by `neon_auth."user".id`. It keeps
  `paystack_customer_code`, a platform-level `suspended_at`, and a denormalised
  `email`/`name` so a paused page can name the business without a cross-schema
  join on the redirect path.
- Dropped: `password_hash`, `email_verified_at`, `role`, and the whole
  `qr_user_tokens` table. Neon Auth owns credentials, verification and reset.
- **No foreign key to `neon_auth."user"`.** That table belongs to a managed
  service that may rename or reshape it, and a cross-schema FK would make our
  migrations hostage to it. `ensureProfile()` is the seam instead.
- Migration `002` was rewritten rather than superseded, because no migration had
  been applied to any database at that point. Everything from `003` on was
  unaffected: the `qr_users(id)` foreign keys still resolve.

**Consequences for the plan:** Phase 1's "sign-up, email verification, login,
password reset, with rate limits" is largely delivered by the managed service
rather than built. Still outstanding for Phase 1: custom SMTP (shared SMTP is
development-only, and verification *links* require custom SMTP), trusted-domain
registration per deployed origin, and rate limiting on the auth routes.

**Resend is no longer an auth dependency.** It stays for admin alerts, abuse
reports and billing email.

**Driver: `pg`, not `@neondatabase/serverless`.** Neon's own guidance for Vercel
is `node-postgres` with Fluid compute plus `attachDatabasePool` from
`@vercel/functions`, which also happens to be the portable choice — the same
driver runs unchanged on a Node server or VPS. The serverless driver was removed.
Migrations use `DATABASE_URL_UNPOOLED`; the runner refuses a `-pooler` host.

## Demo deployment, 21 October 2026

Live at **https://dplus-qr.vercel.app** (Vercel project
`francis-woods-projects/dplus-qr`, linked to the GitHub repo). Same Neon
`production` branch as local, so codes seeded locally resolve on the deployment.

Verified there: all five redirect decisions, scan recording through `after()`,
every status page, and the full auth lifecycle including a signed-out `/account`
being denied and a wrong password refused.

**Geolocation is settled for as long as this runs on Vercel.** Scans record
`country` from `x-vercel-ip-country` — confirmed returning `NG` — so decision 10
needs no MaxMind licence while the demo lives here. The interface stays because
a move to cPanel or a VPS would lose the header.

**The demo is public, deliberately** (decided 22 Oct 2026). Deployment
Protection is set to `all_except_custom_domains`, which protects the
per-deployment URLs (`dplus-<hash>-<team>.vercel.app` → `vercel.com/sso-api`)
but **not** the production domain. `dplus-qr.vercel.app` is served to anyone, so
a phone can scan it today — and sign-up is open to anyone with the link.

Acceptable while the database holds only seed codes and throwaway test
accounts. Revisit before anything real goes in: either switch `ssoProtection`
to cover all deployments, or add password protection.

`npm run codes -- --base https://dplus-qr.vercel.app` prints the current codes
as scannable QR images without changing them.

**Still no Redis.** `/health` reports `redis: degraded` because the Upstash
credentials in `dplus/.env.local` are empty. Every scan therefore reaches
Postgres: on serverless the in-process cache tier rarely survives between
invocations. Fine for a demo, wrong for production.

## Redirect host changed to qriateplus.com, 22 October 2026

**This supersedes `qr.de-signplus.com` everywhere**, including the Locked
Decisions table in HANDOVER.md and the Domains table in INFRASTRUCTURE.md.

| | |
| --- | --- |
| Host inside printed codes | `qriateplus.com` (apex) |
| Code URL | `https://qriateplus.com/Ab3kQ9x` — 30 characters |
| Scope | The whole platform: redirects, sign-up, login, dashboard |
| `de-signplus.com/qr` | Marketing page linking across |
| DNS | Cloudflare, proxied, with existing MX (`mymangomail`) left alone |

Changing this was free only because **nothing has been printed yet**. It is now
the most irreversible decision in the project: every code printed from here on
resolves against this host for as long as the printed material exists.

Why it is better than the subdomain it replaces:

- 30 encoded characters against 34 for `qr.de-signplus.com/Ab3kQ9x`, so fewer
  QR modules and a code that still scans at 2cm on packaging.
- Reputation isolation, which INFRASTRUCTURE.md already named as the reason to
  prefer a separate short domain: abuse of a client's code lands here, not on
  the De Sign Plus brand.

**Code consequences already applied:** `screenUrl()` refuses destinations
pointing at any host this platform has served codes on — current, demo and
retired — because codes printed against a retired host keep resolving, and a
chained code would escape screening on its second hop. `QR_BASE_URL` defaults
to the new host, and `show-codes` warns when asked to render against anything
else.

**Product name: QRiate+**, taken from the supplied wordmark — "QR" capitalised,
"iate" lowercase, a four-square QR motif in cyan and a raised plus in green.
`PRODUCT_NAME` in `src/lib/brand.ts` is the plain-text form, and the landing
page derives the styled wordmark from it rather than retyping it. The palette
read off the logo sits beside the existing De Sign Plus tokens, which is why
the two brands work together. QRiate+ now leads on this domain, with De Sign
Plus credited as the parent.

**The logo file itself is not in the repo.** It was shared as an image in
conversation, which I cannot write to disk. Drop the vector at
`public/brand/qriate-wordmark.svg` and the landing page can use it in place of
the text wordmark.

**Still required, and mine to hand over rather than do:** the Cloudflare DNS
record. Vercel offers a Domain Connect flow that applies it in your account.
Note that Vercel's recommended record carries `disableProxy: true`, which
conflicts with keeping the orange cloud on — see the handover notes.

## Still open

Business decisions, none of which block the current phase:

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
