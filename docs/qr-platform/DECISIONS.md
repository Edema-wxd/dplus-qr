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
included, gets the ordinary 404. The proxy never redirects `/admin` to
sign-in, which would reveal the page exists. It was first kept out of the
proxy matcher for that reason, but the proxy is also where a session gets
refreshed, and a Server Component cannot write the refreshed cookie: on
4 Nov 2026 `/admin` failed with "Cookies can only be modified in a Server
Action or Route Handler". So `/admin` is in the matcher for the refresh, and
`proxy.ts` answers a signed-out visitor there itself (see "A signed-out
`/admin` is a real 404", 6 November 2026). Granting the role is SQL, never a
screen:

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

## Detailed analytics and upgrade prompts, 28 October 2026

Modelled on a competitor's stats page (Francis, 28 Oct 2026: detail on
Starter and up, free keeps what it has, light live refresh, Share Stats and
per-table CSV in a second PR).

- **Cities are now recorded**, from Vercel's `x-vercel-ip-city` (the same free
  edge lookup as the country). The privacy policy already listed "country and
  city". Decoded defensively, control characters stripped, capped at 80.
- **OS and city join the daily rollup** (migration `018`), for the reason 012
  added country and device: a breakdown not rolled up is lost when retention
  prunes raw rows. Existing rollup days were rebuilt from raw rows **only where
  the raw count still matched the rolled-up count**, so a day retention had
  partly pruned kept its totals. Tested on a local Postgres: two intact days
  gained their OS and city, a partly pruned day kept its 5 scans.
- `rollupScans` now also deletes, for each code and day it recomputes, any
  rollup row whose key no longer exists, so a re-keyed day cannot count twice.
- **New on Starter and up** (`insights` in `qr_plans.features`, set by 018):
  unique scans (summed daily uniques from the rotating IP hash; shown as "not
  recorded" when `SCAN_IP_SALT` is unset), operating systems, cities, and the
  change against the previous window of the same length. **Free keeps** the
  daily chart, countries and devices. When a plan lacks `insights`,
  `codeAnalytics` never runs those queries, so a locked panel has nothing to
  leak.
- **Chart windows longer than the plan's scan history are locked** (free:
  30 days, so the 90-day view is offered as an upgrade). The data is never
  computed for a locked window.
- Countries show a flag and name; every breakdown shows its share of all scans
  in the window, not just of the top ten. The summary strip adds Today and
  Created.
- **Live refresh:** a code's page re-fetches every 30 seconds while its tab is
  visible, so a test scan appears without a reload. Nothing runs in a
  background tab.
- **Upgrade prompts, free accounts only.** An "Upgrade" button in the header of
  every dashboard page ("Choose a plan" when no plan is active); paid accounts
  never see it. Locked features are shown with one line and a link to plans,
  never hidden. One banner on the codes list when there is a reason (scans
  have arrived, or the account is within one code of its limit), dismissible
  for 30 days. Nothing pops up or blocks work. Copy describes paid plans
  generally rather than quoting figures that staff can change.
- Staff see every panel on the admin code page whatever the customer's plan.

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

## Share stats and per-table CSV, 28 October 2026

The second half of the competitor-inspired analytics work.

**Share stats (Pro and Business, `share_stats`, migration `019`).** An owner
can publish a read-only stats page for one code at `/s/{token}`, for a client
or manager with no account.

- Off by default. One live link per code (partial unique index). "New link"
  revokes the old one, which stops working at once; "Turn off sharing" always
  works, even after a downgrade, so a link can always be taken down.
- The token is 24 random bytes as 32 base64url characters, stored as issued
  so the owner can copy it again. Malformed tokens never reach the database.
- The page shows the code's name, short link and statistics, **never its
  destination**. Checked on every view: the link is live; the code is not
  blocked or archived; the owner is not suspended, archived or erased; and the
  owner's plan still includes `share_stats`. Anything else is the not-found
  page, which says nothing about whether the link existed.
- The visitor is not the customer: no upgrade prompts, no plan talk, no
  exports, and only the windows the owner's plan covers are offered.
- `noindex`, rendered per request. Under Cache Components a `notFound()` in a
  streamed page answers with status 200 and the not-found content (as
  elsewhere in the app); no data is in it, verified against `next start`.
- `s` is reserved; the route test enforces it.

**Per-table CSV (Pro and up, `csv_export`).** Each table on the code page
(scans per day, countries, devices, and on plans with `insights` operating
systems and cities) has its own CSV link, served by the existing export route
with `?table=`. The route applies the page's rules again: a window beyond the
plan's history, or a detailed table without `insights`, is refused with 403.
Every label goes through `csvCell` (moved to `src/lib/csv-export.ts`), since a
city name comes from a request header and could carry a spreadsheet formula.
Shares are of all scans in the window, not just of the rows listed.

## Retention sweep and upload clean-up, 30 October 2026

**The six-month deletion the legal pages promise now has a job**
(`src/lib/retention.ts`, nightly at `/api/cron/cleanup`). Decided with
Francis: scrub the account and its content, send a warning 30 days before,
leave payment records alone.

- An account with any live subscription is never touched; free accounts hold
  an active free plan, so they never lapse.
- "Lapsed since" is the latest change to any of the account's subscriptions.
  That is at or after the real lapse, never before, so the sweep can only ever
  run late. No new column was needed for that guarantee.
- **No erasure without a warning at least 30 days old**, sent after the latest
  lapse (`qr_users.retention_warned_at`, migration `020`). An email that fails
  to send records nothing, so with no mail service nothing can be erased.
- Erasing reuses `eraseAccountData`, the staff "Erase account" code: content
  deleted, profile blanked, each short code kept as an anonymous row so it is
  never reissued, payment rows kept. Each erasure is audited with no actor.
- **The Neon Auth sign-in is not removed by the sweep**: the service only
  removes users for a signed-in admin. Each is counted on the staff overview
  ("sign-ins to remove") for the existing Remove sign-in button.
- At most 20 accounts are acted on per run.

**UploadThing files nothing uses are deleted** (`src/lib/upload-cleanup.ts`,
same nightly route, after retention). Page files no code's content refers to
and logos removed from the library and used by no code, each at least 7 days
old so an unsaved form keeps its upload. Their rows are deleted and their keys
queued in `qr_upload_deletions` (migration `021`) in one transaction; queued
files are then deleted from UploadThing and retried on later runs if it
refuses. Both erase paths (staff and retention) now queue any file they could
not delete. Before, a failed delete after the row was gone left a file nothing
recorded.

**Both sweeps are off until `DELETION_SWEEPS_ENABLED=true`.** Until then a run
reports what it would warn, erase and delete, and changes nothing. Read a dry
run against production before turning it on.

Tested on a local Postgres: an account lapsed and warned was erased, an
unwarned one only warned (and with no mail service, not even that), paying,
free, recent and returning accounts untouched; only orphaned files and
removed-and-unused logos were queued, and failed UploadThing deletes stayed
queued with the error for retry.

## Hosted pages and video uploads by plan, 1 November 2026

Decided with Francis (the Plan Matrix was left empty, so the four features
that cost money or are classic upsells were asked directly):

| Feature | Free | Starter | Pro | Business |
| --- | --- | --- | --- | --- |
| Hosted page types (menu, PDF, profile card and the rest) | No: link codes only | Yes | Yes | Yes |
| Video file uploads | No | No: YouTube/Vimeo links | Yes | Yes |
| Logo in the code | Yes | Yes | Yes | Yes |
| Custom colours | Yes | Yes | Yes | Yes |

`hosted_pages` and `video_uploads` in `qr_plans.features` (migration `022`),
both in the staff plan catalogue. Free's price-table card now says "Link codes
only".

**Only making and uploading are gated; nothing already created breaks.** A
free account's existing hosted pages keep serving and stay editable, and a
video uploaded before this keeps playing and can be kept on every save; only
attaching a *different* uploaded video needs Pro. Checked at creation, on
every content save, and in the UploadThing `pageVideo` middleware, so no file
is stored for a plan that cannot use it. The type picker and the editor show
locked options with the plans that include them rather than hiding them.

Tested on a local Postgres: Free makes link codes and is refused pages;
Starter makes pages and video pages with a link but is refused an uploaded
video; Pro attaches one; a free account's existing video page still serves,
saves with its video, refuses a swapped-in upload, and can switch to a link.

## Pricing page editable from the admin, 1 November 2026

Staff edit the pricing page's words at `/admin/pricing` (Francis, 1 Nov 2026:
all of it editable, kept in sync with the Terms, Pro highlighted). Prices,
limits and features stay with each plan (Admin, Plans).

- Editable: headline, introduction, which plan is highlighted and its badge
  ("Most popular" on Pro by default), a tagline per plan, the card button,
  the "How billing works" heading and points, and up to 12 extra questions.
  The highlight and taglines also show on the in-app billing page.
- **The four billing points are the Terms' own clauses.** Billing and renewal,
  refunds, failed payments and static codes render on `/pricing` and in
  `/terms` from one stored copy (`buildTerms` in `legal.ts`), so editing one
  edits the other and the two cannot disagree. Their defaults are the Terms'
  previous wording, so nothing changed until someone saves. Static codes were
  not mentioned in the Terms before; they now are, in "Plans and payment".
  The admin screen says plainly that these are legal text.
- Stored as one JSON document in `site_content` (migration `023`), validated by
  the same schema on save and on read, **field by field**: a bad field falls
  back to its default alone, and an unreachable database falls back to all
  defaults, so neither page can go blank or disagree. Plain text only and
  length-capped; React escapes it, nothing renders as HTML.
- `/pricing` and `/terms` now render per request (`instant = false`).
- The schema, defaults and merge live in `pricing-content.ts` (pure, safe for
  browser code); reads and writes in `site-content.ts`. Splitting them is what
  keeps the database driver out of the admin form's browser bundle.
- Every save is audited with the before and after.

Tested against `next start` on a local Postgres: defaults highlight Pro; an
edit changed the headline, badge, tagline and FAQ, and the refund point on
both `/pricing` and `/terms` (the old wording gone from the Terms); a garbage
stored row fell back to defaults on both pages with no script rendered.

## Retention schedule in the admin, 4 November 2026

`/admin/retention` lists every lapsed account the retention sweep will reach,
in four groups: due to erase, due a warning, warned with erasure booked, and
coming up. Read-only; each row links to the customer page, where the actions
already are.

- **One source of truth for the rules.** `scheduleEntry` classifies with
  `retentionStep`, the function the nightly run uses, and a test walks every
  day around the due date to check the two agree. The page cannot promise a
  date the sweep will not keep.
- **Its own query, not the sweep's.** `retentionSchedule` uses the sweep's
  eligibility (no live subscription, not erased) without its time window or
  batch limit, so staff see what is coming as well as what is due. The
  sweep's candidate query is unchanged.
- **Dates shown are the ones customers get.** "Due a warning" shows the date
  the email will promise (`promisedDeletion`); "warned" shows the warning date
  plus 30 days or the six-month mark, whichever is later.
- **A sidebar badge counts what the next run warns or erases**, so it clears
  itself once the run has happened. It reads separately from the other
  badges, and a failure there shows no badge rather than breaking the admin.
- Recent erasures come from the `retention.erase` audit rows the sweep already
  writes, including files left queued for the upload clean-up.

## "Powered by QRiate+" on every hosted page, 5 November 2026

Decided with Francis: every hosted page is also an introduction to the
product, since whoever reads it has just scanned a code that works. The
footer now reads "Powered by QRiate+ · Make your own QR code" and links to
sign-up, on every plan (the 26 October decision to keep the footer stands;
white-label remains a possible upsell, not built).

**A sign-up from that link is credited to the page that sent it**
(`src/lib/signup-source.ts`, migration `024`, `qr_signup_sources`). The link
is `/auth/sign-up?from={code}`, the form carries the code as a hidden field,
and a successful sign-up records which code sent it. The staff overview shows
the count for the last 30 days and the pages that brought the most.

- **No cookie.** The plan was a 30-day attribution cookie, but the privacy
  policy promises one cookie, the sign-in session. So the code rides only in
  the link and the form, and only a sign-up made on that same visit counts.
  Someone who leaves and signs up a week later is not credited. A cookie
  would need the policy changed first.
- **Only a hosted page can be credited.** The insert selects the code by
  short code and page kind, so an unknown code, a junk value or a link code
  (which redirects away and has no footer) records nothing. The value is
  cleaned with `normaliseCode` first and never blocks a sign-up.
- **Nothing personal is stored**: the new account's id and the id of a code
  that was already public.
- **The staff section hides itself if the query fails**, so a preview build
  ahead of migration 024 still renders the overview.

Tested on a local Postgres: a page code credited once, a repeat a no-op, a
link code and an unknown code credited nothing, and the overview query
grouped two sign-ups under the page that sent them.

## Documents open inside the page, 5 November 2026

Decided with Francis: a PDF or photo shared through a code is read on the
QRiate+ page, never handed off to the raw file. Before, "Open the PDF" went
straight to the UploadThing URL, which took the reader off this site (no
"Shared by", no report link, no footer), broke the moment the owner replaced
the file, and on Android showed nothing at all, since Chrome there downloads
a PDF rather than displaying it.

- **`/p/{code}/document` is a PDF's permanent address.** It streams whichever
  file the page holds now, so a replaced file reaches every saved or shared
  link at once. Refused like the page itself when the code is paused,
  blocked or unknown (after the 60-second lookup cache, which the
  dashboard's own pause clears). The type is always `application/pdf` with
  `nosniff`, whatever the bytes, and the stored URL is checked against
  UploadThing's hosts before it is fetched. `?download` saves instead of
  opening. Upstream failures answer 502, never a broken PDF.
- **The PDF is drawn in the page with PDF.js** (`PdfViewer.tsx`, pinned to
  `6.4.299`, the newest release more than two weeks old). Pages are drawn
  as they near the screen, at up to twice the CSS width. Canvas only: PDF.js
  6 never evaluates code from a document, and with no annotation layer a
  file cannot put a link or a field on our page. "Open full screen" is the
  browser's own viewer, for selecting text or following a link. If PDF.js
  cannot open the file, the page says so and both buttons still work.
- **Cost:** PDF.js is loaded only on PDF pages, after first paint: about
  1.6MB uncompressed (roughly 450KB over the wire), nothing anywhere else.
- **Photos open in a full-screen viewer over the page** (`ImageGallery.tsx`,
  a native `<dialog>`), with arrows, swipe and Escape. The thumbnails are
  still links to the originals, so without JavaScript they open as before,
  and a modified click still opens a new tab.

Tested: unit tests for the route (streaming, replace, refusals, SSRF guard,
502s) and the filename header; in Chromium at phone width against a local
Postgres, a three-page PDF drew every page with no request to UploadThing
from the browser, in both `next dev` and a production build, and every
viewer gesture behaved, including a swipe that ends beside the photo.

## The Files page, 5 November 2026

`/app/files` lists every file the account has uploaded for its pages (PDFs,
photos, video and audio), newest first, with its type, size, upload date
and the live codes that show it. Logos keep their own library in the picker.

- **A map, not a second editor.** A file is changed by opening the code that
  shows it and pressing Replace, where that already works and keeps the
  printed code the same. Each "Shown by" entry links straight there, so
  there is one way to change a document.
- **"Used" means the same thing the server checks.** A file is shown by a
  code when the code's saved content carries its `fileId`, the reference
  `resolveFiles` checks on every save (`attachUses`, tested). Archived codes
  are left out, as on the dashboard. Every query filters by the session's
  user id.
- Files no code uses are marked, with a note that they may be cleared out a
  week after upload. That is the upload clean-up, which only deletes once
  `DELETION_SWEEPS_ENABLED` is on, hence "may".
- **No reserved name was needed.** The plan said `files` would join
  `RESERVED_CODES`, but the page sits under `/app`, which is already
  reserved; codes only share the top-level namespace, and reserving `files`
  would only have stopped a customer choosing it as a custom code.

Tested against a local Postgres (each upload matched to its codes, an unused
one marked, another account's file excluded) and rendered at phone and
desktop width.

## A signed-out `/admin` is a real 404, 6 November 2026

"Everyone else gets the ordinary 404" was not what a signed-out visitor got.
`admin/loading.tsx` puts the admin page inside a Suspense boundary, so Next
prerendered a shell: the visitor was sent HTTP 200, a skeleton and the
title "Admin · QRiate+", and the 404 from `requireStaff()` only arrived later
in the streamed payload. Status and title both said the page exists.

- **The proxy answers it, because the page cannot.** By the time any admin
  code runs, the shell and its status are on the wire. `proxy.ts` already
  reads the session on `/admin` for the refresh, so when that read finds no
  one signed in it rewrites the request to `/_nowhere/404`: two segments, so
  `[code]` cannot claim it, under a `_` folder, which the App Router never
  routes. Next serves the site's not-found page with a 404, the same bytes as
  any other dead link with two or more segments. Cookies the middleware
  cleared are kept.
- **The target names nothing**, because `next start` echoes a rewrite's
  target to the client in `x-middleware-rewrite`.
- **Signed-in non-admins still get the shell.** The proxy knows whether
  someone is signed in, not their role, and the role is read from the
  database on every request by design. `requireStaff()` still refuses them,
  so nothing is exposed but the shell and the title, and only to people with
  an account.
- `/admin` is a single segment, where an unknown word on this host goes to
  `[code]` and is redirected to `/not-found-code`. A signed-out `/admin` gets
  the two-segment not-found page instead. It reveals nothing about the admin:
  `admin` is a reserved word, and the page names no feature.

Checked with `next start` against the build: signed-out `/admin`,
`/admin/customers` and `/admin/plans/abc` match `/foo/bar` byte for byte,
with a 404 and no mention of the admin, and `/app` still redirects to
sign-in.

## Signed-in non-staff get the real 404 too, 6 November 2026

Extends the entry above, which closed the gap for signed-out visitors and
named the one it left: a signed-in customer still got the 200, the admin's
title and its loading screen, so any account holder could tell the admin
exists. The proxy now answers them the same way.

- `proxy.ts` answers anyone who is not staff by rewriting to `/_nowhere/404`
  (see above), so Next gives the 404 status, the not-found page and its
  title. Checked with `next start` against the build: for a signed-in
  customer, `/admin`, `/admin/customers` and `/admin/codes/1` match
  `/foo/bar`, a path outside the proxy, byte for byte, while a staff account
  gets the real pages. (`next start` also sends `x-middleware-rewrite` on the
  rewritten responses; production on Vercel does not.)
- **Who is staff** comes from Neon Auth's `session_data` cookie, an HS256 JWT
  signed with our `NEON_AUTH_COOKIE_SECRET`, verified in
  `src/lib/session-cookie.ts` with `node:crypto` (fixed algorithm,
  constant-time compare, expiry enforced; `jose` is ESM-only and cannot load
  in the test suite). The middleware has just refreshed it, so it is current.
  Then the role is read from the database, as `requireStaff()` reads it, so
  revoking or banning takes effect on the next request (checked).
- **It can only hide, never lock out.** No session cookie, or a sign-in
  redirect from the middleware: not staff, with no database read. A cookie
  that does not verify, or a database error: the proxy cannot tell, and the
  request goes on to the page, where `requireStaff()` decides as before. The
  cookie's name and format are Neon Auth's, not a published API; if they
  change, the hiding stops and nothing else does. A test checks our verifier
  against a token the library itself minted. Seen in testing: with the
  database stopped, a customer got the page's old answer (the shell, then
  `requireStaff()`'s refusal), not a lockout and not an error.
- Staff keep descriptive tab titles: nobody else ever receives them.
- `requireStaff()` and `staffForAction()` are unchanged and remain the guard.

## Feedback answers export as CSV, 6 November 2026

A feedback code's page now has "Export answers as CSV"
(`/app/{id}/export/feedback`): every answer, newest first, as
`answered_at,rating,country,city,device,os,comment`, capped at 10,000 like
the scan export. The panel itself still shows the latest 100 and says so
when there are more.

- **Answers now record where they came from** (Francis, 6 Nov 2026: "also
  include country, OS, device, and city"). Migration `025` adds nullable
  `country`, `city`, `device_type` and `os` to `qr_feedback`, filled by
  `feedbackOrigin()` from the same headers and User-Agent parse a scan uses.
  This replaces the 26 October rule that an answer kept only rating, comment
  and time. Still no IP and no hashed visitor value. Answers from before 025
  have blank cells. The privacy policy's scan-data section now says what an
  answer keeps.
- **City and OS need `insights` as well as `csv_export`**, the code page's
  own rule for detailed analytics. Without it the file drops those two
  columns, as the days table drops `unique_scans`. Country and device stay.
- **Behind the existing `csv_export` flag**, not a new one. It is the same
  capability, a download of a code's data, so staff move it between plans in
  one place. Without it the button stays clickable and opens the upgrade
  prompt; the route refuses with 403 either way.
- **Any other kind of code is a 404**, the same answer as a code belonging
  to another account, so the route confirms nothing.
- **Comments go through `csvCell`.** They are typed by anonymous scanners
  and are the least trusted text in any export, so a comment beginning `=`
  is defused rather than arriving in the owner's spreadsheet as a formula.
- `csvResponse` moved into `csv-export.ts` so both export routes send the
  same headers (`private, no-store`, attachment).

## Scans record their city again, 6 November 2026

Scans had never recorded a city. `scanContext` kept only the country header,
and `recordScan` rebuilt a `Headers` holding just that, so `readCity` never
saw `x-vercel-ip-city`. On 6 November, 13 of the previous fortnight's 27
scans had a country and none had a city, so every Cities panel and table was
empty. `scanContext` now keeps the raw city header too, decoded in `after()`
by `scanLocation()` (tested), so the redirect still does no extra work
inline. Scans already recorded stay without a city; there is nothing to
backfill it from.

## Page type gaps: social icons, dish photos, AppGallery, Product Info, 6 November 2026

Four gaps in the hosted page types, closed together. No migration: every
change is inside `content` jsonb, and every new field is optional with a
default, so pages saved before today parse and render unchanged.

- **Social pages show each network's icon beside its name**
  (`src/app/p/[code]/SocialIcon.tsx`). Inline line drawings in the manner of
  `TypeIcon`, in `currentColor`, so they follow the page's brand theming. No
  icon package: `lucide-react` is installed but dropped its brand marks. The
  name stays on the button; the icon only helps the eye find the row.
- **A menu dish can have a photo** (`photo`, an optional image, default
  null). The page shows it as a 64px thumbnail beside the dish, loaded lazily,
  since a menu can run to hundreds of dishes on mobile data. The file is a
  `fileId` like every other page file, so `resolveFiles` checks it against
  the account's own uploads on save and the Files page counts it as a use
  (both tested on a nested dish). The editor has **one uploader for the whole
  menu**, not one per dish, because each uploader fetches the upload route's
  config when it mounts. The dish an upload is for is marked in the draft
  (`uploadMark`, which the schema drops), so moving or removing dishes while
  it runs cannot put the photo on the wrong one. Without `UPLOADTHING_TOKEN`
  a dish keeps and can remove a photo it has, and the note says uploads are
  not available, as every other optional image field does.
- **App codes take a Huawei AppGallery link** (`huawei`, on
  `appgallery.huawei.com` only). At least one of App Store, Google Play or
  AppGallery is now required. Huawei phones sold since 2019 have no Google
  Play, so the Play button was a dead end for them. The store choice moved
  out of the page into `appStoreFor` in `src/lib/page-helpers.ts`, pure and
  tested: iPhone first, then a Huawei phone **only when an AppGallery link is
  set**, then Android. Without the link a Huawei phone goes to Google Play,
  as before.
  - **The Huawei rule is conservative and case-sensitive**: `HUAWEI` (the
    model prefix, `HUAWEI VOG-L29`), `HMSCore` (Huawei Mobile Services,
    which Huawei Browser announces), `HarmonyOS`, and `OpenHarmony`.
    `OpenHarmony` was added beyond the original three because HarmonyOS
    NEXT writes only that, and it cannot install Android apps at all. A
    wrong match costs a Play Store user a detour to AppGallery, so a token
    that merely mentions the brand ("HuaweiFanApp") does not count. Newer
    Huawei phones in Chrome report only a model code (`ELS-NX9`); they are
    not detected and fall through to Google Play or the buttons, which is
    the price of not guessing from model codes.
- **"2D Barcode" is now "Product Info"**, "Product details: GTIN, batch,
  expiry". The old label overpromised: the printed code is our short link to
  a product page, not a GS1 barcode or a GS1 Digital Link, so a shop till
  will not read a GTIN from it (the 26 October entry's caveat, now said in
  the picker). The kind stays `barcode`, which migration `015`'s check
  constraint names. The editor says so above the GTIN field: it opens a
  product page and is not a retail barcode, so the pack keeps its own. The
  page itself is unchanged and still prints the GS1 element string for a
  person to read. No other copy said "2D Barcode" or "GS1" (landing,
  pricing and site content checked); a test holds the label to that.

Tested with unit tests (schemas, old content, the nested dish photo through
`resolveFiles` with the database mocked, the store choice for each agent).
Not tried on a real Huawei handset or against UploadThing.

## Static codes get colours and logos, and Bitcoin checksums, 6 November 2026

**Static codes take colours and a logo, the way dynamic codes do.** Both are
on every plan, so nothing is gated. The static form uses the same
`ColourPicker` as the code page (pulled out of `StyleControls.tsx`, which now
renders it too) and the same `LogoPicker`, offered the account's library.
`/app/new` loads that library on the server with `listLogos(user.id)`, as it
already did for dynamic codes.

**Still nothing is stored or sent.** No row, no short code, no round trip
with the content: a Wi-Fi password stays on the page. The only request the
form makes is for the logo image itself, from the account's own library.

- **The same rules.** `checkQrStyle` decides which pairs may be downloaded;
  a failing pair still previews, as on the code page, but both download
  buttons are disabled. With a logo the code is drawn at H in the box
  `logoBox` gives, exactly as a dynamic code. Without one it stays at M, as
  static codes always were: a static code carries up to 1,000 characters of
  its own content, not a 30-character link, and a higher level shrinks every
  module at the same print size.
- **One picture, three outputs.** `src/lib/static-artwork.ts` (pure) decides
  what to draw. The SVG is the dynamic codes' own `renderQrSvg`, given the
  level; the preview is that SVG; the PNG is painted on a canvas from the same
  geometry at a whole number of pixels per module, so edges stay sharp.
  `renderQrSvg` gained an optional `level` and `qrGeometry` now returns the
  module bitmap; neither changes what a dynamic code draws.
- **The canvas is never tainted.** A logo drawn onto a canvas straight from
  UploadThing's origin would block `toBlob`. The form instead fetches it as a
  blob (CORS), reads it into a data URL, and redraws it to a PNG of at most
  512px, the size the server normalises logos to. That data URL is also what
  the SVG embeds, so the file keeps its logo offline. `isUploadThingUrl`
  moved to the pure `upload-host.ts` (re-exported from `logos.ts`) so the
  browser checks the host before fetching.
- **A logo that cannot be used is said, never dropped silently.** If it
  cannot load, the code is drawn and downloads without it, with a notice and
  "Try again" beside the buttons. Downloads wait while it loads, so none
  quietly lacks it. Content too long to carry a logo at H falls back to M
  without it, also with a notice; content too long even for M (1,000
  characters of CJK text, say) is refused inline instead of the preview
  silently never appearing, which it did before.

**Evidence a styled static code with a logo scans.**
`src/__tests__/static-artwork.test.ts` rasterises the SVG with sharp and runs
the real PNG painter onto a pixel buffer, then decodes both with jsQR, for
Wi-Fi, vCard and Bitcoin payloads in brand colours with a busy logo. The
canvas path was also checked in Chrome on macOS through a throwaway harness
(not committed): a logo served from a second origin with CORS, a control
showing that drawing it directly taints the canvas, then the real
fetch-to-data-URL path, with each PNG decoded in the page by jsQR and by the
browser's own `BarcodeDetector`, and the saved files decoded again in Node.
Not checked: a phone camera scan of a printed copy, the form in a signed-in
browser session, or that UploadThing's live file host sends the CORS headers
the fetch needs. If it does not, every static logo takes the fallback above,
visibly, until the fetch goes through a same-origin route.

**Bitcoin addresses are checked, checksum and all**
(`src/lib/bitcoin-address.ts`). It used to match the shape only, so one
wrong character in a printed code sent every payment to an address nobody
holds.

- Legacy (`1…`) and P2SH (`3…`): Base58Check, version byte 0x00 or 0x05, and
  the first four bytes of double SHA-256.
- `bc1…`: BIP 173 bech32 for witness v0 with a 20- or 32-byte program, BIP
  350 bech32m for v1 to v16, mixed case refused. An all-capitals address is
  accepted and written lowercase.
- Mainnet only. A testnet address gets its own message, as do mixed case, a
  checksum that does not match ("a character is wrong, missing or extra; copy
  it again from the wallet") and a string that is not an address at all.
- **SHA-256 is a small pure-TS implementation** (`src/lib/sha256.ts`), not a
  dependency. The check must run synchronously as the person types, which
  rules out Web Crypto's async `digest`, and nothing hashing was already a
  direct dependency. `@noble/hashes` 2.x is ESM-only, which this repo's
  CommonJS ts-jest would need reconfiguring for, and 1.x is the superseded
  line; forty lines tested against `node:crypto` and the FIPS examples cost
  less than either. It is not constant-time and need not be: it hashes a
  public address.
- Tested against every vector in BIP 173 and BIP 350 (copied verbatim),
  including BIP 173's v1+ addresses, which BIP 350 made invalid; real
  mainnet P2PKH, P2SH, P2WPKH and Taproot addresses; real testnet ones; and
  every single-character substitution of a legacy, a P2SH, a bech32 and a
  bech32m address.

## A paused database gets a second chance to wake, 7 November 2026

Twice in a week, in the small hours, connecting to Postgres took longer than
the pool's 5-second `connectionTimeoutMillis`: the pricing and terms pages
fell back to their default copy (2 Nov, 02:01) and the nightly grace job
missed its run (1 Nov, 04:31), both with "Connection terminated due to
connection timeout". Neon pauses the database when nobody has used it for a
while, and the first connection afterwards waits while it wakes; at night
nothing has kept it awake. (Vercel's Hobby plan keeps runtime logs for an
hour, so the two incidents themselves could not be read further.)

- **`connect()` in `src/lib/db.ts` tries once more** when connecting fails,
  for `query()`, `queryOne()` and `withTransaction()`. By the time the first
  attempt gives up the database has usually woken, and the second connects at
  once.
- **Only connecting is retried, never a statement.** A failed connection means
  nothing reached the database, so the retry cannot run anything twice. A
  statement that fails is thrown as before, and its client is handed back
  marked broken so the pool does not reuse it (what `pool.query()` did).
- **The redirect does not retry.** Its lookup passes `{ failFast: true }`,
  keeping the rule that a scanner gets the status page after one wait, never
  two. Its scan recording, in `after()`, retries like everything else, since
  nobody is waiting on it.
- Reproduced with real `pg` against a local Postgres behind a relay that held
  the first connection unanswered: a dashboard query answered after 6.5s on
  the second attempt where it used to fail at 5s; with two held, it failed at
  10s with the production error; the redirect lookup failed at 5.0s, after
  one attempt; with the database awake, nothing changed.

**What this does not cover: scans after the database has paused.** The
redirect reads Redis first, but a destination stays there for 60 seconds, so
the first scan of a quiet code at night still reaches Postgres and, if the
database is asleep and slow to wake, meets the unavailable page. None has
been logged so far. The fix for that is not in code: stop Neon pausing the
production compute (its "scale to zero" setting), which costs compute hours
for every hour it stays awake. That is a plan and budget decision, left open.

## Long-range charts, and the analytics flag retired, 7 November 2026

Built from section 2 of `docs/qr-platform/plans/bulk-creation-and-analytics.md`,
approved by Francis on 7 Nov 2026 as written, with the unique-scans fix below
added.

**A plan's chart reaches as far back as its scan history.** Pro and Business
kept 12 and 24 months of history but saw the same 90-day chart as Starter.
The code page now offers 6, 12 and 24 months as well as 7, 30 and 90 days:
every window within the plan's `history_days`, and the next one up shown
locked, which opens the upgrade prompt (`chartWindows()` in
`src/lib/entitlement.ts`). With the seeded plans: Free 7 and 30 days, 90
locked; Starter up to 90 days, 6 months locked; Pro up to 12 months, 24
locked; Business everything. Staff change it by changing `history_days`.

- **Weeks and months, not hundreds of bars.** Up to 90 days is a bar per day,
  6 and 12 months a bar per week (from Monday), 24 months a bar per month.
  The query still returns every day of the window, and `toBuckets()` in
  `src/lib/chart-buckets.ts` adds them up, so a week's bar is exactly its
  days. A week or month the window only partly covers (the one under way,
  or the first) is drawn lighter and keyed "Part of a week". A long window
  starts at the code's creation, so a code made in October does not open on
  fifty empty weeks; daily windows keep every day, as before.
- **Unique scans per bar on daily charts only.** The visitor hash rotates
  daily, so adding days into a week would count one phone several times.
  The headline "Unique scans" stays the sum of daily uniques, as it always
  was.
- **Long windows load when picked.** The page still computes only the daily
  windows on the server; 6, 12 and 24 months come from
  `/app/{id}/analytics?days=N`, a JSON route that checks the session,
  ownership (another account's code is a 404), the plan's history (403) and
  `insights` for the detailed figures, as the CSV route does. So the
  30-second live refresh never repeats a two-year query. Staff see all six
  windows on the admin code page, computed there. Share-stats pages stay at
  90 days or less for now.
- **CSV follows the chart.** A long window's "scans per" table exports as
  `week_starting,scans` or `month,scans`. The export of individual scans
  stays capped at 90 days.
- **The price table says "12 months of scan history and charts"**, still built
  from the row. "6 months" is a label now too.

**The `analytics` flag is retired.** Migration 013 seeded `analytics: basic`
on Starter and `trends` on Pro and Business for exactly this feature. As a
separate flag it could only contradict `history_days` ("trends" with 30 days
of history, or two years kept and a 90-day chart), so the length of the
chart is `history_days` and the flag is gone from the catalogue and the
admin. The stored values stay on the six plan rows, inert, because
`featuresFromForm` keeps keys the catalogue does not list and deleting them
would rewrite paid plan rows for nothing. `RETIRED_FEATURE_KEYS` in
`src/lib/plan-features.ts` records that the key must never be reused: it
would switch a new feature on for every plan still holding it.

**Unique scans no longer double count** (migration `026`). The chart added
up `qr_scan_daily.unique_scans` across a day's country, device, OS and city
rows, which 012 says is not summable: a visitor seen in two groups on one
day counted twice. The nightly rollup now also writes one distinct count
per code and day to `qr_scan_daily_visitors`, in the same statement, and the
chart reads that. 026 back-filled it from raw rows for every day whose raw
rows were all still there (the same test 018 used); a day retention had
already partly pruned has no row and falls back to the old summed figure,
rather than undercounting from what is left. Erasing an account deletes its
rows there too.

Tested on a local Postgres 16 with 800 days of seeded scans on one code and
20 on another: every window's bars add up to its total; a visitor scanning
twice in two countries on one day is one unique, where the old sum said two;
a fully pruned and a partly pruned day keep their scan totals and fall back
for uniques; the 12-month chart of a 20-day-old code starts at its creation
week; another account's code returns nothing. Checked at 375px and 1280px:
six short range labels fit across a phone, and the page does not scroll
sideways.

## Bulk creation from a spreadsheet, 7 November 2026

Built from section 1 of `docs/qr-platform/plans/bulk-creation-and-analytics.md`.
Francis's answers (7 Nov 2026): Business only, as seeded; when a batch has
more good rows than free code slots, **make the first ones that fit and
report the rest** (the plan had recommended refusing the whole batch); the
zip download comes with bulk plans only; the other defaults as written.

**What a customer does.** `/app/new/bulk`: upload a CSV or paste rows with
`name` and `destination`, and optionally `type` (link, instagram or facebook)
and `link` (a custom short link, on plans with custom links). "Check rows"
writes nothing and shows every problem on its own row, with "Download these
rows to fix" as a CSV built in the browser. Confirming says exactly how many
codes it makes and how many rows it leaves out, then lands on the batch's
page, `/app/imports/{id}`, with every code, an SVG zip, a PNG zip and the
list as CSV.

- **Ways in:** a card on `/app/new` (locked, and explaining on click, on a
  plan without the flag or at the code limit), and "Make many at once" in
  the codes list header for plans that have it. That header button is left
  off other plans rather than shown locked, so the main page does not carry a
  second upgrade button.
- **Same rules as one code.** Every row goes through `linkDestination` and
  `checkCustomCode`. Page types are left out: their content and files cannot
  come from a CSV. Up to 500 rows and 256 KB per batch; a header the parser
  does not know, a missing name or destination column, or too many rows stops
  the whole file. Codes go live at once, as single codes do.
- **Create re-checks everything.** The check step sends the batch text back
  to the page, and the create step parses, screens and counts it again;
  nothing from the preview is trusted. Rate-limited to 10 batches an hour per
  account (`allowBulkImport`, fails open; the code limit is the real ceiling).

**The code limit is now checked under a lock, for single codes too.** It was
read, checked and then inserted with nothing held, so two creates at once
could both take the last slot. `withCodeSlots()` in `src/lib/user-codes.ts`
takes a transaction-scoped advisory lock on the account, recounts its codes
and hands over the number free. `createCode` and `createBulk` both go through
it. Transaction-scoped, so it is released by commit or rollback and is safe
over PgBouncer. Inserts now use `on conflict (short_code) do nothing` instead
of catching the violation, because a failed statement would abort the
transaction holding the lock; the unique index still decides, and a
generated code that comes back missing is retried, never checked first.

**A taken custom link stops the batch.** All of a batch's codes are made in
one transaction. A custom link the index refuses rolls everything back and
names the row; substituting another link would print one the owner did not
ask for.

**Migration `027`:** `qr_bulk_imports` (who, csv or paste, rows total,
invalid, over the limit, created) and `qr_bulk_import_codes` (which codes,
with their spreadsheet row). Counts only: the uploaded file and the rows
that failed are never stored. A join table, so `qr_codes`, which every scan
reads, is not altered. Erasing an account deletes both. Staff see an
account's recent batches on its customer page.

**One renderer for every download.** The single download's drawing moved
into `renderArtwork()` (`src/lib/qr-artwork.ts`), which the zip uses too, so
a code out of a zip is byte for byte the code downloaded on its own (tested).
The zip (`/app/imports/{id}/zip`, `fflate` 0.8.3, pinned) is streamed, names
each file `{name}-{shortCode}` with only `[a-z0-9-]` kept from the name,
includes `codes.csv` (cells through `csvCell`), and fetches every logo before
the first byte, so a logo that will not load is a 503 rather than a zip cut
short. A 500-code PNG zip takes about 30 seconds; the route allows 60.

**Pricing:** `bulk_creation` is now `built: true`, so the price table lists
"Bulk creation from a spreadsheet" on the plans that hold it.

Tested on a local Postgres 16: eight rows with six free slots made six and
reported one over the limit and one invalid, in spreadsheet order; a full
account refused bulk and single creates; two batches of three and a single
create racing for five free slots ended at exactly the limit; a taken custom
link left no codes and no batch behind; erase removed the batches. The
collision retry is unit-tested against a fake transaction, and the form was
checked at 375px.

## Team seats, part 1: the schema and the access check, 7 November 2026

Team seats are built in stages from `docs/qr-platform/plans/team-seats.md`.
Francis's answers (7 Nov 2026): Business only, **5 people including the
owner**; roles **owner, editor and viewer** (admin allowed in the schema,
not offered); when a plan lapses or seats fall below members, **members are
locked out with their memberships kept**; the plan's other recommendations
stand. This entry covers the first two stages, which change nothing a
customer can see: nothing writes the new tables yet.

**An account is still the owner's user id.** Codes, logos, files, share
links and subscriptions stay keyed on `user_id`, which now means "the
account". So the redirect is untouched: `src/__tests__/redirect-lookup.test.ts`
pins that its one query reads only `qr_codes`, `qr_users` and
`qr_subscriptions`, and never a team table, which is also why membership can
change without a cache purge.

**Migration `028`** adds `qr_account_members` (role, joined, removed),
`qr_account_invites` (only a hash of the token is stored),
`qr_account_events` (the team log, ids and roles only) and
`qr_active_accounts` (which account someone is working in, kept in the
database because the privacy policy promises one cookie). It alters nothing
that exists, and sets `team_seats` to 5 on the two Business rows, where 013
had stored `true`. `team_seats` is now a number in the plan catalogue, still
`built: false`, so the admin plan form keeps the count rather than dropping
an unrecognised boolean.

**"Filter by the session's user id" becomes a proof of access.** Every
dashboard function in `user-codes.ts`, `logos.ts`, `files.ts`,
`stat-shares.ts` and `bulk-create.ts` takes an `AccountScope` instead of a
user id, and every statement carries `access(n)` from
`src/lib/account-scope.ts`: the row belongs to the account, and the same
statement checks that the signed-in person is its owner or a live member
whose role allows the action (viewers read, editors and the owner write).
There is still no fetch-then-check: a member removed mid-request gets
nothing from the next statement. For an owner the check is `$1 = $n` and
never reads the members table, so a solo account costs nothing.

- `resolveScope()` (`src/lib/resolve-scope.ts`) is the only way to get a
  scope: the session's own account, unless `qr_active_accounts` names a team
  they are a live member of whose owner is not suspended, archived or
  erased. Anything else falls back home. `scopeFor` builds one, and the
  guard test fails if anything but these two modules and the tests call it.
- Pages, the six routes, the dashboard and bulk actions, the plan meter and
  the upload middleware all resolve a scope. Write actions refuse a viewer
  up front with "Ask the account owner" (the statements refuse anyway).
- **Who changed a destination is now the person**, not the account:
  `changed_by` takes the actor, so a team's history will say which member.
- Unscoped readers are named: `analyticsForCode` (the staff code page and
  public share links, which authorise first) and `loadSharedCode` (the token
  is the credential). Upload callbacks record against the account the
  middleware proved, since UploadThing's callback carries no session.
- `src/__tests__/scope-guard.test.ts` reads those modules function by
  function and fails on any SQL touching a customer table without
  `${access(` or a `-- scope:` note saying why.
- `/billing` still uses the session's own id: only an owner pays for their
  own account.

**Deferred from this stage:** the plan's hidden `accountId` on every form
(refusing a form drawn for one account after a switch in another tab) moves
to the stage that adds the account switcher, since until then nobody can
switch.

Tested on a local Postgres 16 with all migrations and member rows: owner,
editor and viewer see the account's codes; an outsider holding a forged
scope for the account sees nothing, changes nothing and creates nothing;
a viewer reads but cannot rename, create or bulk-create; an editor's
re-point is recorded under the editor; a member removed mid-session gets
nothing on the next statement; the account choice falls back home when the
owner is suspended, the member removed, or the team never joined.

## Team seats, part 2: seat rules, 7 November 2026

Step 3 of `docs/qr-platform/plans/team-seats.md`. Still nothing a customer
sees: nothing writes members or invites until the invite step, and
`team_seats` stays `built: false`.

**A seat is a person, the owner included**, and a pending invite holds one
until it is accepted, revoked or expires. `src/lib/seats.ts` holds the rules:

- `planSeats(features)`: `team_seats` when it is a whole number of 2 or
  more, otherwise 1 (the owner alone). The `true` migration 013 stored
  before 028 made it a count reads as no team, never as a guess.
- `seatsHeldSql(n)`: one SQL fragment counting the owner, live members and
  pending unexpired invites, used by the entitlement, checkout and staff
  assignment so all three count alike. The entitlement now carries `seats`
  and `seatsUsed`.
- `seatRefusal`: **a downgrade never removes anyone**, as it never removes a
  code. Checkout (`planRefusal`) and staff assignment (`assignRefusal`)
  refuse a plan smaller than the team and say how many people to remove
  first. Neither is a new writer of `qr_subscriptions`.
- `seatState`: when a plan ends up with fewer seats than members (staff
  lower `team_seats`, or move the account to a plan without a team), the
  owner and the earliest-joined members up to the seats keep access and the
  rest are locked, not removed (decided 7 Nov 2026). Applied when members
  can sign in, in the lock-out step.
- `canInvite`: the owner only, on an active plan with a team and a seat free.

**In the catalogue and prompts.** `team_seats` is a number from 2 to 50 in
the admin plan form. When it is built the price table will say "Up to N
people, with their own sign-in", read from the row. The upgrade prompt knows
a `team_seats` gate and names the cheapest plan with a team.

Tested on a local Postgres 16: an account with two live members, one
removed, one pending invite, one expired and one revoked counted 4 seats
used of 5; staff assignment to a plan without a team was refused with the
count, then allowed once the team was cleared; checkout onto that plan was
refused before any call to Paystack.

## Team seats, part 3: invites, joining and switching, 7 November 2026

Step 4 of `docs/qr-platform/plans/team-seats.md`. **Built but switched off:**
every page, invite and accept below answers as if it did not exist until
`team_seats` is marked built (`teamSeatsLive()` in `src/lib/team-invite.ts`),
which the launch step does together with the lock-out rules and the privacy
copy. Business plans already carry five seats, so without the switch their
owners could start inviting people before those are in place.

**Inviting** (`/app/team`, owner only). An email address and a role, editor
or viewer. `createInvite` (`src/lib/team.ts`) runs under a lock on the
account's `qr_users` row, so two invites cannot take the last seat, and
refuses the owner's own address, someone already in the team, an address
with an invite waiting, and a full plan. The token is 32 random bytes; only
its SHA-256 is stored, so reading the table cannot get anyone into a team.
The email comes from `onboarding@`, replies to `hello@`, and says who
invited them, as what, the link and the expiry (seven days). **A failed send
keeps nothing:** the invite is revoked at once, logged as unsent, and the
owner is told. Rate-limited to 20 invites a day per account
(`allowInvite`, fails open; the seats are the real ceiling).

**Joining** (`/auth/invite/{token}`, outside the proxy matcher so someone
without an account can open it). A token that matches nothing is the
ordinary not-found page. Signed out, it offers sign-in or sign-up, which
carry the invite as a hidden field (`InviteField`) and come back to it;
`afterAuthPath` builds that return only from a token that passes the format
check, so the field cannot be an open redirect. The invited address is only
ever shown masked (`a•••@e•••.com`). Accepting needs the signed-in person's
**verified** address to **match the invitation** (decided 7 Nov 2026), and
runs under the same account lock: the invite is live, the owner in good
standing on an active plan with a team, the seats still fit (the pending
invite already holds its seat, so accepting moves it rather than taking a
new one). The new member's dashboard then opens on the team. Their own free
account stays theirs.

**Managing.** The owner changes roles and removes people; a member can
leave. Nobody is deleted: membership is stamped `removed_at`, and anything
a member made stays in the account. The team page shows the owner the
people with their addresses, pending invites and a log of changes (stored
as ids and roles, never an address); a member sees who is in the team and
can leave.

**Switching.** "Working in" in the sidebar lists the person's own account
and each team they belong to, and posts to `switchAccountAction`; the
choice is kept in `qr_active_accounts`, and `switchAccount` writes nothing
unless the account is their own or a team they are a live member of.

**Forms drawn for another account.** The plan put a hidden account id on
every dashboard form. Only the create forms (new code, both bulk steps)
carry it: a form about an existing code names that code, and the access
check already refuses a code from the account switched away from, so it
changes nothing. A create form names no code, and would otherwise make one
in whichever account is now active; `pinMismatch` refuses it with "You
switched accounts in another tab".

Tested on a local Postgres 16 with all migrations, real rows and a stand-in
for Resend: with no mail service an invite is refused and nothing is left
pending; the owner's own address, a repeat invite and a non-owner are
refused; two invites racing for the last seat, one wins; accepting as the
wrong address or unverified is refused, as the invited address (any case)
succeeds once, opens the dashboard on the team and shows its codes;
switching into a team you are not in writes nothing; a role change, a
removal (the member sees no codes on their next read and the team leaves
their switcher), leaving, and revoking each work and are logged with no
address. Checked at 375px.

## Team seats, part 4: lock-outs and what members see, 7 November 2026

Step 5 of `docs/qr-platform/plans/team-seats.md`. Still switched off with the
rest of team seats (`teamSeatsLive()`).

**Members are locked out, never removed** (decided 7 Nov 2026). A team is
usable by a member only while `MEMBER_USABLE_SQL` (`src/lib/seats.ts`)
holds: the owner is not suspended, archived or erased; the account has an
active plan, or one still in its grace period, that includes a team; and the
member is within the seats, the owner taking one and the rest going to
members in the order they joined (`seatState`'s rule, now in SQL). One
fragment, used by `resolveScope` and by the switcher, so the switcher never
offers a team that would send someone home.

- When it fails, `resolveAccess()` (`src/lib/resolve-scope.ts`) gives the
  person their own account and says why (`lapsed`, `no-team`, `seats`, or
  `unavailable` for an owner taken down, which a member is not told in so
  many words). Their membership and their choice of team are kept, so the
  moment the owner pays, is restored or frees a seat they are back in, with
  no deploy and nothing to redo.
- **A notice above every dashboard page** explains the lock-out, naming the
  owner, with "Stay in my own account and stop showing this".
- **The owner sees a seat shortfall** on the team page: how many people are
  over the seats, each marked "no seat, locked out", and that nobody has been
  removed.

**Viewers see, download and export; they do not change.** The new-code and
bulk pages show "You can view this account but not change it. Ask {owner}"
in place of the forms; a code's page shows its destination read-only in
place of the edit controls and drops the share-link panel; the codes list
drops the new-code buttons. The server refuses regardless (`writable`,
`access(n)`).

**Only the owner is sold a plan.** In a team, the upgrade prompt says
"{owner} manages the plan for this account. Ask them" and offers no way to
plans, which would be the member's own account's; the header's Upgrade
button and the free-plan banners are not shown to members; `/billing`,
which is always the person's own account, says the team's billing is the
owner's.

**The invitation page's title** is now set only for a real invitation. A
guessed or dead link gets the site's default title, as a page that does not
exist does (it had carried "Join a team" on the not-found answer).

Tested on a local Postgres 16 with three members joined a day apart:
Business with 5 seats lets all three in; lowering seats to 3 locks out the
last to join only; removing the first gives the locked member their seat
back at once; past due but in grace keeps everyone in, grace over locks all
three out, and paying again lets all three back; suspending or archiving the
owner locks everyone out, and unarchiving restores them; moving to a plan
without a team locks everyone out; the owner keeps their own account
throughout, and locked members see none of the team's codes and lose it
from their switcher. Checked the member dialog, notice and read-only note at
375px.

## Team seats, part 5: staff admin and erasure, 7 November 2026

Step 6 of `docs/qr-platform/plans/team-seats.md`. Still switched off for
customers with the rest of team seats; the staff pages show team data
whenever there is any.

**Staff see teams.** A customer's page has a Team section (each member with
address, role, join date and whether they are over the seats; pending
invitations; the last 20 entries of the team's log) and a Member-of section
for the teams that account belongs to. The customer list shows "Team of N".
`teamForStaff` in `src/lib/team.ts` reads it.

**Staff take people out, never put them in.** "Remove" and "Cancel invite"
on the customer page go through `teamAction` (`staffForAction`, zod) and
each writes one `qr_admin_audit` row, `team.member.remove` or
`team.invite.revoke`, with the ids and the role, never an address. The
team's own log records it as done by staff, with no staff name; the owner's
team page reads "QRiate+ support removed …". To cut someone off from
everything, staff still suspend them or ban their sign-in; suspending a
person does not take them out of other teams.

**Erasure covers teams** (`eraseAccountData`, used by staff and by the
retention sweep, so both behave alike), in the same transaction and before
the email is blanked:

- **An erased owner's team is deleted outright:** members, invitations, the
  team log, and anyone's choice to work in it. The members keep their own
  accounts, untouched. The confirm screen says how many people lose access
  (`erasePrecheck().teamMembers`), and the audit row records the number.
- **An erased member leaves no trace in other teams:** their memberships,
  invitations addressed to them, and their own choice of team are deleted;
  their id is cleared from other teams' logs, as inviter, remover, actor and
  subject, while the entries stay so those owners keep their record.
  Anything they made in a team belongs to that team's account and stays;
  destination history already forgot who made each change.

Tested on a local Postgres 16 with two teams sharing a member: the precheck
counted each team; erasing the shared member removed both memberships, the
invitation addressed to them and their choice of team, cleared their id
from both logs while keeping the entries, and left the team's code and its
history intact; erasing an owner deleted their team's members, invitation,
log and the other member's choice of it, and left that member's own account
and another team's invitation to them alone; staff removal and revocation
each worked once and refused a repeat, logged as by staff with no name.

## Team seats launch: the legal copy and the switch, 7 November 2026

Step 7 of `docs/qr-platform/plans/team-seats.md`, and the end of it.

**The switch.** `team_seats` is now `built: true` in `PLAN_FEATURES`, which
is what `teamSeatsLive()` reads: the team page, invitations, accepting,
switching and everything in the earlier team entries are reachable, and the
price table lists "Up to N people, with their own sign-in" on any plan whose
`team_seats` is 2 or more (5 on Business, from migration 028). Staff change
the number from `/admin/plans`. The catalogue now lists team seats and bulk
creation before support, so a plan's price table ends with its support line.

**The legal copy** (`src/lib/legal.ts`, asserted in `legal.test.ts`):

- **Terms, "Teams":** the owner alone invites, removes, changes roles and
  changes the plan; **the owner is responsible for what the people they
  invite do in the account**; what is made in the account belongs to it; each
  person keeps their own account; a lapse or a seat shortfall locks people
  out until it is fixed, and removes nobody.
- **Privacy, "Teams":** an invitee's address is used to send the invitation
  and kept while it can be accepted (`INVITE_DAYS`) and for
  `INVITE_KEEP_DAYS` (30) after it settles; the owner sees a member's name,
  email, role and join date, and changes are recorded against them; other
  members see name and role only; team data belongs to the owner; erasure
  removes memberships, invitations and the person's name from team history.
  The email and retention sections say the same.
- These are drafts like the rest of the legal pages, and go into the
  lawyer's review that is still due before live payments (Legal pages,
  25 October 2026).

**Invitation addresses are deleted on schedule.** `pruneInvites()` runs in
the nightly scan job (`/api/cron/scans`, after the scan work, and never
allowed to fail it) and deletes any invitation accepted, cancelled or
expired more than 30 days ago. An invitation holds the address of someone
who may never have used the service, so the privacy page states the limit
and the job keeps it. Unlike the retention sweeps, this one is not behind
`DELETION_SWEEPS_ENABLED`: it removes nothing a customer made.

Tested: all 984 tests pass with the switch on, including the price-table
line read from the plan's count and the legal clauses quoting their
constants; on a local Postgres 16, `pruneInvites` deleted exactly the
invitations settled more than 30 days ago (accepted, cancelled and expired
alike), kept live and recently settled ones, and deleted nothing on a second
run.

## Admin page titles no longer name the admin, 7 November 2026

Reverses "Staff keep descriptive tab titles: nobody else ever receives
them" in the entry above. Someone else can receive them. When the proxy
cannot tell who is staff (a session cookie that does not verify, the
database not answering), it passes the request on to the page, and the page
sends its prerendered shell with a 200 before `requireStaff()` refuses. The
title is in that shell. That entry's own database-down test saw a customer
get it.

- Every admin page's `metadata` title drops "· Admin": "Customers", "Plans",
  "Code" and so on. The overview, titled "Admin", becomes "Overview". With
  the root template they read "Customers · QRiate+".
- In that fallback a customer can still tell that some page answered with a
  200, but nothing in it names the admin.
- What staff lose is "Admin" in their tab titles. The sidebar still says
  where they are.


## Destination reputation: Google Web Risk, 8 November 2026

`checkReputation` was a stub that always answered `unavailable`. It is now a
Google Web Risk lookup (`src/lib/reputation.ts`), **dormant until
`WEB_RISK_API_KEY` is set**: without the key every answer is `unavailable`
and nothing behaves differently from before.

**Why Web Risk** (Francis, 8 Nov 2026). Google's free Safe Browsing API is
for non-commercial use only, and points commercial users to Web Risk. The
free phishing feeds were looked at first and do not fit a paid product:
OpenPhish's community feed is non-commercial only, PhishTank has taken no
new registrations since 2020, and abuse.ch URLhaus is free under "fair use"
with commercial use possibly needing a paid Spamhaus plan. Web Risk's
Lookup API is licensed for commercial use and free for the first 100,000
lookups a month ($0.50 per 1,000 after), which covers this volume. It needs
a Google Cloud project with billing on, the Web Risk API enabled, and a key
restricted to it, set as `WEB_RISK_API_KEY` in Vercel.

**What is checked** (decided 8 Nov 2026): a link code's destination and
every outside link on a hosted page (`pageLinks`, which skips the account's
own uploaded files), for MALWARE, SOCIAL_ENGINEERING and UNWANTED_SOFTWARE.

- **On save, a flagged link is refused**, naming the site and the threat:
  making a code, re-pointing one, saving a hosted page, and both bulk steps
  (a flagged row becomes a row with a problem). The lookup runs before the
  code-slot lock, so a slow answer holds nothing.
- **An unavailable answer lets the save through** (decided 8 Nov 2026): no
  key, a timeout (3 seconds), an error or a refusal from Google never stops
  a customer working. The weekly re-check catches what slipped past.
- **The weekly re-check blocks** (decided 8 Nov 2026, as INFRASTRUCTURE.md
  planned). `/api/cron/reputation`, Mondays at 04:50 UTC, looks up every
  code that is live or paused, not archived and not on an erased account,
  each distinct link once. A code with a flagged link is blocked with a
  reason naming the site, written to `qr_admin_audit` as a system change
  (`actor_id` null, `code.block.reputation`), its owner emailed from
  `support@` with which link, why, and to reply if it was wrong, and staff
  sent one summary. Only `flagged` blocks; a code already blocked is left
  alone. Staff lift a wrong block from the code's admin page, and the
  re-screen button there now gives a real answer.
- **Never on the redirect path**: scanning a code never waits on Google.
  `reputation.ts` is apart from `screening.ts`, which the page editor runs in
  the browser, because it holds the key; a failed lookup is logged by status
  only, since the request URL carries the key.

**Legal copy:** the privacy page names Google (Web Risk) as a processor that
receives links only; the acceptable-use page describes the save-time refusal
and the weekly automatic block. Both are part of the lawyer's review.

Tested on a local Postgres 16 with Google's answers faked: a flagged link
was refused on a new code, a re-point and a hosted page, and a clean one
saved; the weekly re-check blocked a live link code and a paused hosted page
whose one bad link sat among good ones, left a clean code and an
already-blocked one alone, looked each of five distinct links up once,
wrote one system audit row per block, emailed the owner and staff, and
blocked nothing new on a second run. Without the key, nothing is looked up.

## Monitoring: error alerts, the weekly summary, and the outside check, 8 November 2026

Phase 4's last monitoring item, in three parts. The one hard limit shaped
it: **the site cannot be what notices the site is down.** Vercel's crons run
at most daily here and stop with the deployment, so the two-minute outage
alert in HANDOVER.md needs a checker outside Vercel. That is an account to
open, not code, and is listed under Still open. The other two parts are in
the app.

**Error alerts** (`src/lib/error-alerts.ts`). Every uncaught server error
is counted and emailed to staff (`notifyAdmin`, so `support@` to
`hello@qriateplus.com`). It is fed from:

- `onRequestError` in `src/instrumentation.ts`: pages, Route Handlers and
  Server Actions;
- `src/proxy.ts`, which reports its own failures and throws on as before,
  because Next hands only an edge proxy's errors to `onRequestError`, and
  this proxy runs on Node (found by testing: a proxy failure under
  `next start` reached no hook). The hook skips `routeType: "proxy"` so a
  failure is never reported twice;
- the jobs that catch their own failures and would otherwise reach only a
  log: every cron route, the Paystack webhook's processing, and a Paystack
  event the webhook defers for a person (`alertOnce`);
- the redirect's failed lookup, inside `after()`, so the scanner is answered
  first and the alert never delays a scan.

The rules, chosen while building (change them in `error-alerts.ts`):

- **Production only**: `VERCEL_ENV=production`, or `NODE_ENV=production` off
  Vercel. Previews share the production database but run unmerged code;
  their errors are their author's to read. Never during `next build`.
- **One email per kind of error per hour.** The kind is where it happened
  plus the error's name and first line, with numbers and quoted values taken
  out, so the same failure on a thousand scans is one email.
- **At most ten alert emails an hour in all**, so a bad deploy cannot bury
  the support inbox.
- **Every error is counted per day** in Redis (`err:count:<day>`, kept 16
  days) for the weekly summary, emailed or not.
- **Nothing personal in the email**: email addresses, IPv4 and IPv6
  addresses and long tokens are blanked, and the request's query string is
  dropped, since invite and share links carry their token there. The digest
  and commit are included so the full stack can be found in the Vercel logs.
- **Never throws.** Any Redis failure answers "send": a duplicate alert
  costs less than a missed one. Without Redis the throttle is per instance.

**Weekly summary** (`src/lib/weekly-summary.ts`, `/api/cron/summary`,
Mondays at 05:30 UTC). After the nightly rollup and the 04:50 safety check,
so Sunday's scans and this morning's blocks are in it. Figures only, never
a customer's name or address, since it goes to a shared inbox:

- the last seven whole UTC days against the seven before: sign-ups, new
  codes, scans (from `qr_scan_daily`), plus codes in service now;
- money now, read as the admin overview reads it: monthly recurring,
  paying accounts and how many will not renew, overdue and the amount at
  risk;
- safety: abuse reports received, codes blocked by staff, codes blocked by
  the Web Risk check over the seven days to the run (or that the check is
  off);
- server errors counted that week (or that Redis is absent, rather than a
  reassuring zero);
- what is waiting on staff, from `attentionCounts()`, the overview's own
  "Needs attention" numbers.

**The outside check, to set up.** Recommended: Better Stack, whose free
plan checks every 3 minutes with 10 monitors and email alerts (from its docs
and comparisons; confirm on the pricing page before relying on it). The free
UptimeRobot plan checks every 5 minutes. A scheduled GitHub Actions job was
ruled out: its schedule can run many minutes late, and on a private
repository a check every few minutes uses more than the free Actions
minutes. Two monitors:

1. `GET https://qriateplus.com/health`, alert on anything but 2xx. It
   answers 503 when the database is down or the schema is behind the code.
   Timeout 15 seconds: a database waking from a pause can take two
   5-second connection attempts.
2. `GET https://qriateplus.com/Ab3kQ9x` (the demo code) with redirect
   following off, expecting 302. It is answered before any database lookup,
   so it shows the redirect route is deployed and serving even when the
   first monitor is red for a database reason.

Alerts to `hello@qriateplus.com` and a phone. A 3-minute check alerts in
3 to 6 minutes, not the 2 minutes HANDOVER.md asks for; meeting that needs a
paid plan with 30-second or 1-minute checks, which is listed as a decision.

Tested: unit tests for the scrubbing, the throttle (with and without Redis,
across instances, the hourly cap), the environments that stay silent, the
hook, the proxy's report and the summary's wording. Against a production
build with the database unreachable and mail sent to a fake Resend: two
failed summary runs gave one alert; a route error and two proxy errors on
different paths gave one alert each, the query string absent; scans of a
code fell to the unavailable page as before. The summary's query was run on
a local Postgres 16 with rows either side of each boundary: a sign-up at
23:00 on Sunday counted and one at 01:00 on Monday did not, Monday's scans
waited for next week, and a safety block at 04:50 that morning counted while
last Monday's did not.

## Still open

Reviewed 8 November 2026 against `main`.

Not built yet: nothing from the plan.

Business decisions:

- Free trial, and whether codes go live during one
- Whether De Sign Plus must register with the Nigeria Data Protection Commission
- A Nigerian lawyer's review of the three legal pages, drafts since 25 October
  and now including the team seats and reputation-check clauses, before live
  payments are taken
- Whether to pay for 30-second or 1-minute uptime checks. The free outside
  checks run every 3 to 5 minutes, so an outage alerts in 3 to 6 minutes,
  not the 2 HANDOVER.md asks for (8 November monitoring entry).
- Whether to stop Neon pausing the production compute. The connection retry
  of 7 November covers the dashboard and the nightly jobs but not a scanner:
  the first scan of a quiet code while the database is asleep can still reach
  the unavailable page (see that entry). Keeping it awake costs compute hours.

To set up outside the app:

- The outside uptime monitor: an account with Better Stack (or similar) and
  the two monitors in the 8 November monitoring entry. Until it exists,
  nothing alerts when the site is down, since the site cannot report its own
  outage.

Built but switched off:

- The destination reputation check: needs a Google Cloud project with billing
  on, the Web Risk API enabled and a key restricted to it, set as
  `WEB_RISK_API_KEY` in Vercel (8 November entry).
- The retention and upload sweeps run only with `DELETION_SWEEPS_ENABLED=true`.
  When to turn them on in production is open; read a dry run against
  production first (see the 30 October entry).

Closed since this list was first written:

- Neon project and `DATABASE_URL`: provisioned, and the app is live on it.
- `qr.de-signplus.com` DNS: superseded. Printed codes use `qriateplus.com`
  (22 October).
- MaxMind GeoLite2 licence: not needed. Country and city come from Vercel's
  `x-vercel-ip-country` and `x-vercel-ip-city` headers.
- `npm run scans:rollup` failing with `42P10`: fixed. The script calls the
  shared `rollupScans()` instead of carrying its own SQL.
- Tiered analytics: built 7 November. Chart length follows `history_days`,
  and the `analytics` flag is retired (see that entry).
- Bulk creation: built 7 November (see that entry).
- Destination reputation check: built 8 November on Google Web Risk, dormant
  until its key is set (see that entry).
- Error alerts and the weekly admin summary email: built 8 November (see
  that entry). The outside uptime monitor is above, to set up.
- Team seats: built and launched 7 November (see those entries). Its terms
  and privacy clauses are drafts and are part of the lawyer's review above.
