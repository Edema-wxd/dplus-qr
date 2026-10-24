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
| 15 | Email | Resend for everything — app mail over the API, Neon Auth mail over Resend SMTP. Senders grouped by subject: `onboarding@`, `plans@`, `support@` on `mail.qriateplus.com` (send-only, no MX); every reply-to and inbox on the apex. Confirmed 23 Oct 2026 |
| 16 | Product name | **QRiate+** (wordmark: QR capitalised, raised plus). Decided 22 Oct 2026 |
| 17 | Plans and prices | Starter ₦4,000, Pro ₦10,000, Business ₦25,000 monthly; 10/50/250 codes; 90 days/12 months/24 months history. Annual is ten months for twelve. Confirmed 24 Oct 2026 |
| 18 | Grace period | 7 days, as a `qr_plans.grace_days` column rather than a constant. Free plans get 0 |

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

**Resend carries auth mail again, as SMTP rather than as a dependency.** The
custom SMTP that Phase 1 needs is Resend's: `smtp.resend.com:587`, username
`resend`, password the Resend API key, set with `neon neon-auth config
email-provider update --type standard`. One Resend account therefore sends
everything — verification, password reset and OTP from the managed service, and
admin alerts, abuse reports and billing email from this app over the API — but
the app code still imports no mailer on the login path.

**Senders are grouped by subject.** `onboarding@` carries auth and getting
started (and is the sender on Neon Auth's SMTP), `plans@` carries billing,
`support@` carries complaints and abuse reports. `MAIL_GROUPS` in
`src/lib/email.ts` is the only place an address appears, and `sendEmail`
requires a group, so a call site cannot invent a sender. There is no
`EMAIL_FROM` env var for the same reason. The split buys per-address
reputation: a bounced invoice run cannot drag verification mail down with it,
and a user can mute billing without muting a password reset.

**`mail.qriateplus.com` sends but does not receive.** It publishes SPF and DKIM
for Resend and no MX, so mail addressed there is rejected and the sender is
never told. Every `Reply-To`, every `mailto:` in the UI and every internal
alert recipient therefore sits on the apex `qriateplus.com`, which has MX.
`SENDING_DOMAIN` and `INBOX_DOMAIN` in `src/lib/brand.ts` name the two and a
test fails if a reply-to crosses over.

Outstanding: dedicated inboxes. All three groups currently reply to
`hello@qriateplus.com`, the one mailbox confirmed to exist. Once `support@`,
`plans@` and `onboarding@` exist on the apex, repoint
`MAIL_GROUPS[...].replyTo`; the senders are already grouped that way.

**Plans and prices are settled** (decision 17), seeded by migration 013 as six
rows -- three tiers, monthly and annual. The annual price is stored as its own
row rather than computed from a discount, because a discount in code would be a
second place for the price to live and the two would drift. Starter monthly
matches `PRICE_FROM_NGN` in `src/lib/brand.ts`, which is the single anchor the
landing page may show.

`paystack_plan_code` stays null until `npm run plans:sync` mints the plans in
Paystack and writes the codes back. `listPurchasablePlans()` requires that
column, so the paid tiers are invisible to checkout until then -- the safe way
round, since a plan with no code cannot be charged.

Settled: the sending domain. The Resend account is registered to
`hello@qriateplus.com`, and `mail.qriateplus.com` was verified there on 23 Oct
2026. The apex itself is not verified and does not need to be — it is the
inbox side, not the sending side.

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

**The logo file is now in the repo** (23 October 2026). `QRP_Logo_Full_Colour`
was supplied as a transparent vector and sits at
`public/brand/qriate-wordmark.svg`. Because the letterforms are near-black and
the landing page puts the mark on a dark ground as well as a light one, a second
file, `public/brand/qriate-wordmark-light.svg`, is derived from it: every
near-neutral fill is taken to paper tone and every chromatic fill — the cyan QR
motif, the green plus, the amber and coral swashes — is preserved. A CSS filter
could not do this, since inverting the letterforms would also invert the brand
colours. Both are used by the landing page; the earlier text wordmark is
retired.

**Still required, and mine to hand over rather than do:** the Cloudflare DNS
record. Vercel offers a Domain Connect flow that applies it in your account.
Note that Vercel's recommended record carries `disableProxy: true`, which
conflicts with keeping the orange cloud on — see the handover notes.

## Free plan and the dashboard, 23 October 2026

The client dashboard is built: `/app` lists codes, `/app/{id}` manages one, and
`/account` is now settings. Phase 2's create / rename / re-point / pause /
resume, QR downloads and the scan analytics all exist.

**A free plan now exists and is granted on sign-up** (migration `010`,
`ensureFreeSubscription()` in `src/lib/profile.ts`). This was forced: `decide()`
treats "no subscription" as not entitled, and real accounts had no
`qr_subscriptions` row, so every code a user made through the dashboard would
have scanned to the paused page.

This is **the one place outside the Paystack webhook that writes
`qr_subscriptions.status`**, which migration 004 reserves for webhooks. It is
narrow on purpose:

- it can only ever select the `free` plan (`amount_kobo = 0`, no
  `paystack_plan_code`);
- `where not exists (select 1 from qr_subscriptions where user_id = $1)` means
  it grants only to an account with no subscription row of any status, so it
  can never resurrect a cancelled Paystack subscription nor contend with the
  partial unique index.

**Phase 3 must remove it.** When checkout exists, free accounts either migrate
to a paid plan or lapse through the normal grace path.

`max_codes = 5` and `history_days = 30` are placeholders for decisions still
open below. Both are a single `UPDATE` on the `free` row, never a deploy.

**The rollup and the retention sweep now exist** (23 Oct 2026, migration `012`
plus `src/lib/rollup.ts`).

`qr_scan_daily` was created at a grain of `(qr_id, day)` with no country and no
device, so it could answer only "how many scans that day". Migration `012` adds
`country` and `device_type` and moves the key to
`(qr_id, day, country, device_type)`. Safe to re-key rather than supersede: the
table had never been written to, because nothing in the repo rolled anything up.

Why this had to come before pruning: retention deletes raw `qr_scans` rows once
they are older than the owner's plan allows, and the breakdowns the dashboard
shows can only be rebuilt from those rows. Pruning without a dimensional rollup
would have destroyed every answer except the daily total, permanently.

- `rollupScans()` recomputes a recent window rather than incrementing, so it is
  idempotent — verified by running it three times and watching the totals stay
  put. It deliberately does **not** delete rollup rows whose raw rows are gone;
  that is exactly what preserves history past retention.
- `pruneScans()` carries three guards: a hard two-day floor whatever a plan
  says, a requirement that the day is already rolled up, and a fallback to the
  **longest** active retention when an account has no plan row. All three were
  tested inside a transaction that was rolled back.
- `codeAnalytics()` now reads the rollup for completed days and raw `qr_scans`
  only for today, and adds the two. Verified end to end: 9 scans read the same
  before and after a rollup, and still read 9 with both device types after every
  raw row for that code was deleted.
- Scheduled nightly at 02:20 UTC by `vercel.json` against `/api/cron/scans`,
  which answers **404** — not 401 — without the correct `CRON_SECRET`, so a
  prober learns nothing. `npm run scans:rollup` runs the same work by hand.
- Days are UTC everywhere. `qr_scan_daily.day` is a `date`, and node-postgres
  parses a `date` into a JS `Date` at *local* midnight, so the chart formats its
  labels with `to_char` in Postgres instead; without that the x-axis is a day
  out for anyone east of UTC.

**`CRON_SECRET` is a new required-at-use variable.** Without it the cron route
404s and nothing is ever pruned, which is the safe failure: raw rows simply
accumulate. It must be set in Vercel before the schedule means anything.

**A destination change reaches the redirect in up to 60 seconds, not instantly.**
Measured: exactly 60s. `purgeDestination()` clears only the calling bundle's
in-process cache, and with no Redis configured the redirect path's own copy
waits out its TTL. That meets the phase 2 criterion ("within 60 seconds") but
only just; configuring Upstash makes the purge immediate. The dashboard copy
says "within a minute" rather than claiming it is instant.

## Still open

Business decisions, none of which block the current phase:

- Free trial, and whether codes go live during one
- How long lapsed codes stay paused before deletion (12 months proposed)
- Team seats and bulk creation, listed as Business extras but not yet built
- MaxMind GeoLite2 commercial-use licence, and Google Web Risk pricing
- Whether De Sign Plus must register with the Nigeria Data Protection Commission

Infrastructure, needed before this can run end to end:

- Neon project and `DATABASE_URL`
- Upstash credentials: reuse `dplus`'s, or a separate instance
- `qr.de-signplus.com` DNS, required before the first code is printed
