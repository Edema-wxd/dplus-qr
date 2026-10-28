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
| 19 | Legal page routes | Flat: `/terms`, `/privacy`, `/acceptable-use`, all three in `RESERVED_CODES`. Decided 25 Oct 2026 |
| 20 | Refunds | **None.** Payments are charged in advance and not refundable; cancelling runs to the end of the paid period, so nobody pays for time they cannot use. Decided 25 Oct 2026 |
| 21 | Retention after lapse | **6 months**, then codes and scan data are deleted. Decided 25 Oct 2026, replacing the 12 months previously proposed |

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
only just. (Configuring Upstash does *not* make it immediate on its own; see
"Redis is live", 26 October 2026.) The dashboard copy says "within a minute"
rather than claiming it is instant.

## Legal pages, 25 October 2026

Three documents at `/terms`, `/privacy` and `/acceptable-use`, written from the
running code rather than from a template, and rendered from `src/lib/legal.ts`
so the copy sits beside the constants it quotes.

**Flat routes, not `/legal/*`.** `privacy` and `terms` were already in
`RESERVED_CODES`, the links are shorter in a footer, and Paystack's merchant
review cites `/terms` directly. `legal`, `aup`, `cookies` and `refunds` were
reserved at the same time, so a later rename cannot be shadowed by a code.
`acceptable-use` could never collide anyway — a generated code has no hyphen —
but it is listed with the others to keep the set truthful.

**Refunds: none, and cancelling runs to the end of the paid period.** This is
what `cancelAtPeriodEnd()` already does, so the page describes the code rather
than promising a flow nobody has built. A money-back window would need a manual
Paystack refund path that does not exist.

**Retention after lapse or closure: 6 months** (`LAPSE_RETENTION_MONTHS` in
`brand.ts`), down from the 12 months this document proposed. Long enough that
printed material survives a missed payment and a late return restores
everything; short enough to state as a real limit under the NDPA. **No sweep
enforces it yet** — the constant and the promise exist, the deletion job does
not. That is now the gap, and it is a written commitment, so it is a Phase 3
obligation rather than a nice-to-have.

**Entity details are deliberately absent.** No registered name, RC number or
address appears on any page yet (Francis, 25 Oct 2026: leave them out for now).
The documents name De Sign Plus and QRiate+ and give `hello@qriateplus.com` as
the contact. They need the registration details before launch, for NDPA
transparency and for Paystack's merchant checks.

**What the pages commit the code to**, each asserted by
`src/__tests__/legal.test.ts` so the promise cannot quietly drift:

- Both NDPA roles stated in the Terms and the Privacy Policy: controller for
  account data, processor for scan data.
- Raw IPs are never stored or logged; the stored value is
  `sha256(ip + salt + UTC day)`, so a scanner cannot be followed across days.
- The redirect sets no cookies, runs no analytics and loads nothing in the
  scanner's browser. The only cookie on the host is the dashboard session.
- Codes are paused and accounts suspended, never deleted to settle a dispute.
- A CSV export excludes `ip_hash`, as the export route already does.
- Every address printed on a legal page is on the apex, never the send-only
  `mail.` domain — the same rule `email-groups.test.ts` applies to `Reply-To`,
  because a data request sent to a domain with no MX vanishes silently.

**These are drafts, not advice.** A Nigerian lawyer should read all three
before live payments are taken. The NDPC registration question stays open, so
the Privacy Policy names a contact for data requests and claims no
registration.

## Code colours and dashboard totals, 26 October 2026

**Owners can colour their codes** from `/app/{id}`. The pair is stored in
`qr_codes.style` as `{ dark, light }`, and the download route, the on-screen
specimen and the list thumbnails all read it through `readQrStyle()` in
`src/lib/qr-style.ts`. Colour changes the artwork only: the encoded content is
still the code URL, `style` is never read by the redirect path, and nothing is
purged on save.

Two rules decide which pairs may be saved, and both are policy, not taste:

- **Dark on light only.** An inverted code has the same contrast ratio, but a
  share of scanner apps, older Android ones especially, only look for dark
  finder patterns and never read it.
- **Contrast of at least 4.5:1** (`MIN_QR_CONTRAST`). A printed code meets bad
  light and glossy stock the owner never sees on a bright screen. This refuses
  some mid-tone brand colours on white; they belong in a frame around the
  code, not in it. Lowering it is a one-line change, but every code printed
  under a lower floor stays printed.

The form runs the same check as the owner picks, and the Server Action runs it
again. `readQrStyle()` falls back to black on white for any stored value that
fails, so a row edited by hand still downloads a code that scans.

Logos followed the same day; see the next section.

**`/app` now shows account-wide totals** (scans today, 7 and 30 days, live
codes), summed from the same rows as the table so the two cannot disagree, and
**a notice when the plan is not active**, because every code on such an
account is serving the paused page and the owner cannot otherwise tell.

**The empty-environment build passes again.** `/account`, `/app`, `/billing`
and `/billing/confirming` now `await connection()` before the session read.
Without it `next build` tried to prerender them and failed on
`NEON_AUTH_BASE_URL`, because the lazy `auth` throws on first use when the
variable is absent. `instant = false` alone does not stop that prerender.

## Logos, the logo library and list filters, 26 October 2026

**All customer uploads go through UploadThing** (Francis, 26 Oct 2026). This
replaces the Neon `assets` bucket that `src/lib/storage.ts` was built for, and
matches the upload path `dplus` already uses. `storage.ts` stays in the repo
for now because `/health` reports on it, but nothing uploads through it.
`qr_codes.logo_key` from migration 005 was meant for that bucket; it was never
written and is superseded by `logo_id`, not dropped.

**Every upload joins the account's logo library** (migration `014`,
`qr_logos`). A logo uploaded once is offered again in a picker whenever the
owner makes a code or edits one, so a business with one mark uploads it once.
"Remove" in the picker archives the row; it does not delete the file, because a
code already drawn with that logo must still download with it. Deleting files
no code references is left to a later sweep.

- `/api/uploadthing` checks the session in the router's middleware, so the
  account a file is attached to comes from the session, never the browser.
  It sits outside the `proxy.ts` matcher on purpose: UploadThing's completion
  callback comes from their servers, not a signed-in browser.
- PNG, JPEG and WebP only, 1MB, one file. **No SVG**: it can carry script and
  logos render inside the dashboard's own page.
- Each upload is decoded with `sharp` before it is recorded; a file that is
  not really an image is deleted from UploadThing and refused.
- At most 50 live logos per account (`MAX_LOGOS`).
- **UploadThing URLs are public**, though unguessable. Acceptable for a mark
  that is going to be printed on public material anyway, but it is a change
  from the private bucket `storage.ts` describes, and the privacy policy's
  wording should be checked against it before launch.
- The server only ever fetches logos from `*.ufs.sh` or `utfs.io`
  (`isUploadThingUrl`), so a tampered row cannot point the download route at
  an internal address.

**A code with a logo is drawn at error correction H**, with the logo in a box
22% of the symbol's width (about 5% of its area), snapped to whole modules and
never reaching the finder patterns or the format information beside them.
`src/lib/qr-render.ts` draws both the specimen's grid and the download, and
`src/__tests__/qr-render.test.ts` **rasterises the real artwork, logo and
brand colours included, and decodes it** with `jsqr`. That test is the
evidence that a logo still scans; it is not an eyeball check.

Downloads embed the logo as a data URI, so an SVG still has its logo when a
print shop opens it offline. If the logo cannot be fetched the download
answers 503 rather than quietly drawing the code without it.

**`UPLOADTHING_TOKEN`** is a new variable, optional in `env()`. Without it the
upload button is hidden; logos already uploaded keep rendering.

**Uploads fail on protected preview URLs.** UploadThing confirms each upload
by calling back to the origin it started from, and a per-deployment URL behind
Deployment Protection answers with an SSO redirect. Test uploads on the
production domain or locally.

**Migration 014 must run before this deploys.** The dashboard pages now read
`qr_logos` and `qr_codes.logo_id`, so deploying first breaks `/app`. Printed
codes are unaffected either way: the redirect lookup names its columns.

**`/app` has search, a status filter and a sort**, read from the URL as a plain
GET form, so a filtered view survives a reload and needs no JavaScript.
Applied in memory to the rows `listCodes` already returns (at most a plan's
code limit), which keeps the account-wide totals summed from every code while
the table shows the subset.

## Code types and hosted pages, 26 October 2026

**Creating a code starts with a type picker at `/app/new`** (Francis, 26 Oct
2026: "everything now"). The type lives in the URL (`?dynamic=menu`,
`?static=wifi`), so the picker is plain links. "New code" on `/app` is a link
to it, and it stays enabled at the plan limit, because static codes need no
slot. The catalog is `src/lib/qr-types.ts`.

**Dynamic types come in two kinds**, and the redirect path cannot tell them
apart:

- **Link types** (`url`, `instagram`, `facebook`) are a destination URL, as
  every code was before. Instagram and Facebook accept a handle and must stay
  on that network, so an "Instagram" code cannot hide some other site.
- **Page types** (PDF, images, video, profile card, multiple links, social,
  app, MP3, business, menu, feedback, event, coupon, playlist, 2D barcode)
  store their `content` as jsonb and point at **`/p/{short_code}`, a relative
  path**. The scan goes through `/{code}` as usual (302, counted, pausable),
  then to the hosted page. `p` is in `RESERVED_CODES`.

Migration `015` adds `qr_codes.kind` (default `'url'`, so every existing code
is unchanged) and `content`, plus `qr_files` and `qr_feedback`. **It must run
before this deploys**: `/app` now selects both new columns. The redirect
lookup names its columns, so printed codes are unaffected either way.

- `/p/{code}` re-applies the redirect path's own `decide()`, so a paused or
  blocked code's page is not reachable by bookmark. It records no scan; the
  hop through `/{code}` already did.
- Every link inside page content is screened with `screenUrl`, like a
  destination. Every file is referenced by `fileId` and **resolved against the
  account's own `qr_files` rows before parsing**, so a saved page can only show
  a file its owner uploaded, at the URL this server recorded.
- Page files go through four new UploadThing endpoints: images (4MB, no SVG),
  PDF (16MB), video (64MB) and audio (16MB). Without `UPLOADTHING_TOKEN`, the
  types that need a file are shown in the picker but not offered.
- Feedback answers are the second unauthenticated write on this host, after
  abuse reports. They are rate limited to 10 an hour per visitor
  (`allowFeedback`), and only a live code of the feedback kind accepts one. No
  IP or hash is stored with an answer.
- An app code sends an iPhone or an Android phone straight to its own store
  from the server. Anyone else sees both buttons.
- "2D Barcode" is a GS1 product page: GTIN with a verified check digit, batch,
  expiry and serial, shown as the GS1 element string. The symbol is still our
  short link, not a GS1 Digital Link URI, because a printed dynamic code has to
  encode our host.
- A code's type is fixed when it is made. A page type is edited in place
  (`updateCodeContent`), and `changeDestination` refuses it.

**Static types grew to ten**: WhatsApp (`wa.me`, country code required),
vCard 3.0, PayPal (`_xclick` link; PayPal does not take naira, so USD, EUR,
GBP, CAD or AUD) and Bitcoin (BIP 21) join the original six.

## Redis is live, 26 October 2026

A separate Upstash database (`dplus-qr`, us-east-1, eviction on), not the one
`dplus` would use: the redirect cache and its rate limiter should not share
memory or a failure with the marketing site. Set as `UPSTASH_REDIS_REST_URL`
and `UPSTASH_REDIS_REST_TOKEN` in Vercel (production and preview) and
`.env.local`; `/health` reports `redis: ok`. This supersedes "Still no Redis"
above.

us-east-1 because `vercel.json` sets no region, so functions run in Vercel's
default `iad1` (Washington DC). If a region is ever set, move the database
with it, or every cache read pays a cross-region hop.

What it changes:

- A cold or new instance now finds a destination in Redis instead of going to
  Postgres, so scans stop depending on the database for every request.
- The 300/min/IP redirect limiter and the dashboard's rate limits now actually
  limit. Both still fail open if Redis is unreachable.
- **A destination change is still not instant.** `purge()` deletes the Redis
  key and the calling instance's in-process copy, but any other warm instance
  checks its own in-process tier first and can serve the old destination for
  up to its 60-second TTL. Redis shortens the usual delay; it does not remove
  the worst case. The "within a minute" copy stays accurate. Making it
  immediate would mean dropping or shortening the in-process tier on Vercel,
  which trades a Redis hop on every scan for freshness, and is a decision for
  later rather than a side effect of this one.

The Vercel Marketplace Upstash integration was deliberately not used: it
injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which `src/lib/redis.ts` does
not read, so it would have looked configured while `/health` stayed degraded.

## Hosted-page photos are resized, 26 October 2026

Photos on `/p/{code}` were served exactly as uploaded, up to 4MB each, to
phones that are often on metered mobile data. They now go through
`next/image` (`PageImage` in `src/app/p/[code]/views.tsx`): each phone gets a
WebP at the width its layout needs, and everything below the fold loads
lazily. Tapping a gallery thumbnail still opens the original.

- **Scoped to this app's own UploadThing host** (`UPLOADTHING_APP_HOST` in
  `src/lib/upload-host.ts`, read by `next.config.ts`). `*.ufs.sh` would have
  let anyone run any UploadThing customer's files through this deployment's
  optimiser on this account's bill. Verified against `next start`: another
  app's file is refused with 400, ours is accepted, and a width outside
  `deviceSizes`/`imageSizes` is refused.
- WebP only, four device widths and three icon widths, so each picture costs
  as few Vercel image transformations as possible. Resized copies are cached
  for 31 days: a file URL is an UploadThing key and never points at new bytes.
- A URL on any other host renders as a plain `<img>`, because `next/image`
  throws on an unlisted host and one picture must not take a page down.
  **If the UploadThing app changes, update `UPLOADTHING_APP_HOST`**, or photos
  quietly go back to full size.
- Video and audio were already `preload="metadata"` / `"none"`; unchanged.

## Hosted pages carry the customer's brand, 26 October 2026

A hosted page now wears the colour and logo its owner already chose for the
code (Francis, 26 Oct 2026: per code, buttons only, footer kept). The scanner
has just pointed a camera at that artwork, so the page should look like it came
from the same business. No new settings screen; the code's page says the two
are linked.

- **Buttons** fill with the code's colour, with white or black text, whichever
  contrasts more (`pageBrand` in `src/lib/qr-style.ts`; tested to stay at
  4.5:1 or better). The background stays neutral and follows dark mode; a
  full tint would fight dark mode and make long text harder to read.
- **A code on the default black keeps the standard look exactly**, because
  `pageBrand` returns null and the buttons fall back to the site's own
  foreground, which flips in dark mode. A fixed near-black would not.
- In dark mode a branded button gets a faint rim (`--brand-edge` in
  `globals.css`): a brand colour is dark by construction and could otherwise
  sink into a dark page.
- **The logo** sits at the top of the page, contained in a fixed 160×56 box,
  through the same resized-image path as page photos.
- The QRiate+ footer, "Shared by …" and "Report this page" stay on every plan.
  Removing the footer on paid plans (white-label) is a possible upsell, not
  built.

## Custom short codes, 26 October 2026

Owners on Pro and Business can choose a code's link, such as
`qriateplus.com/dplus`, instead of a generated one (Francis, 26 Oct 2026:
fixed at creation, Pro and Business, minimum 4 characters, first come with
the existing block power).

- **Stored in `qr_codes.short_code`, lowercase, under the same unique index**
  as generated codes. Taken is decided by the index at insert, never by
  checking first; the form's live "available" hint is advice only. A chosen
  code gets one insert attempt and a clear "taken" answer, never a silent
  substitute.
- **Format:** lowercase letters, digits and single inner hyphens, 4 to 30
  characters. `normaliseCode` in `src/lib/short-code.ts` is now the format
  check on every path that reads a code from a URL (the redirect, `/p`, its
  files, the paused and report pages). A generated code is matched exactly,
  as base-58 is case-sensitive; anything else is lowercased, so `/DPlus` typed
  off a poster reaches `dplus`. The one miss: a 7-letter custom code typed in
  capitals looks like a generated code and is matched exactly. Scanned, it
  always arrives as printed. Still one lookup, and a malformed path still
  never reaches the database.
- **Fixed once created.** A printed link can never change, so there is no
  edit; the field says so before the owner commits.
- **Every route on this host is reserved.** Before custom codes only
  7-character route names could collide; now any can. `acceptable-use`,
  `not-found-code`, `opengraph-image` and `icon` were added, and
  `src/__tests__/custom-codes.test.ts` walks `src/app` and fails if any
  top-level route is missing from `RESERVED_CODES`. **Adding a route still
  means reserving its name**; the test now enforces it.
- **Impersonation fragments are refused anywhere in a custom code**: sign-in
  and trust words, payment services and banks operating in Nigeria, the
  government bodies most used in scams, and this platform's own names. A
  printed `qriateplus.com/gtbank-login` is a phishing page whatever it points
  at. Misuse that slips past is handled by blocking the code, as for any
  other abuse.
- **Plan gate:** `custom_codes` in `qr_plans.features`, set on the four Pro
  and Business rows by migration `016` (data only), read by
  `canUseCustomCodes`. Safe in either deploy order: without the flag every
  plan simply refuses a custom code. The billing cards list it.
- Shorter links also mean fewer QR modules, so a custom code scans a little
  more easily at small sizes.

## Pricing page, plan meter and the staff admin, 26 October 2026

**`/pricing` is public and reads `qr_plans`** (Francis, 26 Oct 2026). One
price table (`PlanTiers`) serves `/pricing` and `/billing`, folded from the
plan rows by `src/lib/plan-tiers.ts`, so the public page cannot advertise a
price checkout would not take. It shows paid plans whether or not Paystack
has a code for them; the billing page disables the button on one that has
none. The table streams behind Suspense, so the build needs no database.

**Feature flags have a catalogue**, `PLAN_FEATURES` in
`src/lib/plan-features.ts`. Which plan carries which flag is data in
`qr_plans.features`; what a flag does is code, so the set of flags is code.
A flag marked `built: false` (`analytics`, `team_seats`, `bulk_creation`)
can be stored and assigned but is never advertised.

**The staff admin is at `/admin`**, for accounts whose Neon Auth role
includes `admin`, read from `neon_auth."user"` on every request rather than
from the session, and refused to banned accounts. Everyone else, signed out
included, gets the ordinary 404. `/admin` is deliberately not in the proxy
matcher, which would redirect a signed-out visitor to sign-in and so reveal
the page exists. Granting the role is SQL, never a screen:

    update neon_auth."user" set role = 'admin' where email = '...';

It shows revenue (MRR from active paid plans, annual spread over twelve),
overdue accounts, unapplied Paystack events, the plan catalogue and every
customer. Every page view, search and change writes `qr_admin_audit`.

**Staff can edit plans** (Francis, 26 Oct 2026: "dynamically assign them"):
name, limits, grace, sort order, on-sale, and feature flags. Rules, enforced
in `src/lib/plan-admin.ts`:

- Price and interval are editable only until the plan is connected to
  Paystack. Paystack charges its own copy of the price, so changing ours
  afterwards would show one price and charge another. A new price is a new
  plan, and the old one is retired.
- Slugs are fixed once created. Plans are retired, never deleted.
- "Connect to Paystack" on a plan's page adopts a matching Paystack plan or
  creates one, the same rule as `npm run plans:sync`, which still works.

**Staff can assign a plan to an account** without a payment, for comped
accounts and manual invoices. This is the **second exception** to "webhooks
are the only writer of `qr_subscriptions`" (the free-plan grant is the
first), confined the same way: it is refused for an account with a live
Paystack subscription, which is changed in Paystack instead, and it never
assigns a plan smaller than the codes the account holds. An assigned plan has
no end date; it runs until staff change it or the customer pays through
checkout, whose `activate` supersedes it exactly as it supersedes Free.

## Staff moderation: codes, block, suspend, archive, erase, 27 October 2026

Staff can now see and act on every code and account (Francis, 27 Oct 2026:
"view all accounts, all codes and where they point, as well as deleting them,
warning users and monitoring QR codes"). Split in two: this part is the code
list and the moderation actions; warnings and monitoring follow.

**"Deleting" is three actions, each harder to undo than the last**, because a
deleted code row frees its short code for reissue while the old artwork is
still in circulation, and the Terms promise codes are paused and accounts
suspended, never deleted to settle a dispute:

1. **Block a code / suspend an account.** The everyday "take it down".
   Blocked shows the disabled-for-safety page and the owner sees the reason;
   suspended shows the paused page and the owner can still sign in.
2. **Archive.** A code stops serving, answers as an unknown code, leaves the
   owner's dashboard and stops counting against their plan. An archived
   account is suspended and every code archived with the same timestamp, so
   unarchiving brings back exactly those codes, paused, and keeps the
   suspension until staff lift it. Reversible.
3. **Erase.** For erasure requests and junk accounts. Personal data and
   content are deleted or blanked in one transaction (scans and rollup,
   destination history, feedback, files, logos, each code's name,
   destination, content and style, the profile's name, email and Paystack
   code), then the UploadThing files, then the Neon Auth user via
   `auth.admin.removeUser`. The profile and code rows stay as anonymous
   skeletons, so the foreign keys hold and **every short code stays reserved
   by the unique index**. Subscription rows, abuse reports and the audit trail
   are kept. Refused for staff accounts, for yourself, and while Paystack is
   still charging the account. Staff type the account's email to confirm.
   The audit row records counts, never the email.

**No migration deletes or reshapes anything.** Migration `017` adds
`qr_codes.archived_at`, `qr_users.archived_at` and `qr_users.erased_at`
(nullable, no default, so no long lock on the redirect table) and an index for
the staff list. **It must run before this deploys**: the redirect lookup now
selects `archived_at`.

- **The redirect path gains one column**, on the same single indexed lookup.
  `decide()` answers an archived code as `not_found`, after the blocked check
  so a safety block keeps saying so. Archiving also sets `paused`, so a
  cache entry or a build from before 017 still never redirects it.
- **Erased profiles stay erased.** `ensureProfile` skips its update for an
  erased row, because the data is erased before the sign-in account is
  removed and a session open in between would otherwise copy the name and
  email straight back.
- `/admin/codes` lists every code with owner, destination (host set apart, so
  a userinfo look-alike such as `paystack.com@evil.ng` reads as what it is),
  status, 7-day scans, open reports and "changed in 24h", with search and
  filters. `/admin/codes/{id}` adds the scan chart, destination history,
  reports and staff changes. Every action re-checks staff, validates with
  zod, purges the redirect cache and writes `qr_admin_audit`.

**Found while building this:** `screenUrl` accepted a destination with
userinfo (`https://paystack.com@evil.ng/x`), which browsers send to `evil.ng`.
Fixed separately in PR #15, which refuses userinfo outright. Codes saved
before it can be found by searching `@` here and re-screened.

## Migrations apply on production deploys, 27 October 2026

**What happened.** Migration 017 (moderation) was merged and deployed without
being run. The redirect path's single query had gained `c.archived_at`, so it
failed on every scan, and every printed code showed the unavailable page until
`npm run db:migrate` was run by hand. The dashboard failed the same way. It was
the third merge in two days that needed a manual migration before its code
could work, and the first to reach the scan path.

**What changed** (Francis, 27 Oct 2026: automatic migrations on deploy):

- `npm run build` is now `tsx scripts/migrate.ts --deploy && next build`, and
  `vercel.json` pins `buildCommand` so a dashboard override cannot skip it.
  `migrationModeFor` (`src/lib/migration-mode.ts`, tested) decides:
  **apply** on a Vercel production build, **check** (report, write nothing) on
  any other Vercel build, **skip** off Vercel. `env -i ... next build` and a
  local `npm run build` still need no database.
- **Previews never apply.** They share the production database, so applying
  from one would push an unmerged PR's schema into production. A preview whose
  database is unreachable or unconfigured warns and carries on; an edited,
  already-applied migration still fails it, because that is a real defect in
  the change.
- **A failed migration fails the build.** The previous deployment keeps
  serving, and since migrations are additive the old code is fine on whatever
  did apply.
- **Overlapping deploys queue.** A session advisory lock serialises runners;
  two simultaneous production runs were tested: one applied all 17 migrations,
  the other waited and found nothing to do.
- **`lock_timeout = 5s` per migration.** `alter table qr_codes` needs a brief
  exclusive lock on the table every scan reads; an ALTER waiting on a long
  query would queue every scan behind it. Tested: with a read held on
  `qr_codes`, the probe migration gave up at 5s, applied nothing, and exited 1.
- Requires `DATABASE_URL_UNPOOLED` in the Vercel Production environment. If it
  is missing or stale, production builds fail loudly at the migrate step,
  which is the safe failure.

`npm run db:migrate` still works by hand and is still the way to apply a
migration ahead of a deploy.

## Admin reports queue and layout, 28 October 2026

**Abuse reports can be closed** (Francis, 28 Oct 2026: "improve the UX"). A
report is `open` until staff close it: `actioned` when the code was dealt
with, `dismissed` when the report did not hold up. Blocking or archiving a
code, or blocking or archiving every code on an account, marks that code's
open reports `actioned` in the same action, because that is what a report
asks for; staff should not have to close it twice. Closing never deletes a
report. `/admin/reports` is the queue, oldest open report first, and each
close is audited as `report.action` or `report.dismiss`.

**The admin uses the dashboard's sidebar** (a drawer on phones) instead of a
top bar that wrapped badly on a phone, with badges for open reports and
overdue accounts. The overview leads with what needs attention, and every
headline figure links to the accounts behind it. Customers filter by state
and plan tier, a page at a time. The customer page puts suspend, archive,
block and erase together at the bottom, below everything staff read first.

## Still open

Business decisions, none of which block the current phase:

- Free trial, and whether codes go live during one
- Team seats and bulk creation, listed as Business extras but not yet built
- MaxMind GeoLite2 commercial-use licence, and Google Web Risk pricing
- Whether De Sign Plus must register with the Nigeria Data Protection Commission

Infrastructure, needed before this can run end to end:

- Neon project and `DATABASE_URL`
- `qr.de-signplus.com` DNS, required before the first code is printed
