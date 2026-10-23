# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: **Nigerian businesses that print things.** Packaging and label buyers,
corporate-gifting clients, event and signage buyers, restaurants and retailers —
the existing De Sign Plus customer base plus anyone who finds the platform. The
situation is always the same: something has already been printed, or is about to
be, and the link on it must be able to change afterwards. The job is "make the
code on my printed material point somewhere else, today, without reprinting."

Secondary: De Sign Plus itself, which prints the material and can set codes up
on a client's behalf.

Scan-side (not a customer, but a user of this host): the person who scans a code
in good faith and may land on a status page. Treated as blameless by design.

## Product Purpose

A paid, self-serve dynamic QR platform on `qriateplus.com`. A client signs up,
subscribes through Paystack in naira, creates QR codes, re-points any code at
any time, and sees scan analytics. The printed code never changes — only its
destination.

Success is a printed code that still resolves years later, and a client who
changes a destination instead of reprinting a run.

## Positioning

- **Naira, Paystack, local.** Global dynamic-QR tools bill in USD on cards that
  many Nigerian businesses cannot or will not use. This bills the way the
  customer already pays.
- **The printer owns the platform.** De Sign Plus designs and prints the
  material the code lives on, so the code and the artwork come from one place.
  No competitor who only sells software can say that.
- **A 30-character code URL.** `qriateplus.com/Ab3kQ9x` is deliberately short so
  the symbol stays sparse enough to scan at 2cm on packaging. This is a
  measurable product property, not a slogan.
- **Reliability as the stated contract.** One rule governs the codebase: when a
  choice trades redirect reliability for a feature, reliability wins.

## Operating Context

- Codes are printed on physical goods — packaging, labels, gifting, signage,
  menus, event collateral — with long and uncontrollable lifespans. Reprinting
  is the cost the product removes.
- Scans happen on phones, often on weak Nigerian mobile networks. Redirect
  latency and payload size are product features.
- Clients are not technical. The dashboard is the whole interface; there is no
  API commitment.
- Billing is monthly or annual through Paystack Subscriptions. Payment state
  comes only from verified webhooks.

## Capabilities and Constraints

Confirmed and built:

- Redirect path `/{code}`: always `302`, `Cache-Control: no-store`, one cached
  lookup, scan recording deferred to `after()`. 300 req/min/IP, and a limited
  request still redirects.
- 7-character base-58 short codes (no `0 O I l`), collisions resolved by unique
  index and retry.
- Status pages for paused, blocked, unavailable and unknown codes, plus an abuse
  report form. Deliberately `noindex`.
- Destination screening: refuses destinations pointing at any host this platform
  has served codes on, so a chained code cannot escape screening.
- Accounts via Neon Managed Better Auth; `qr_users` is a profile table.
- Scan country from `x-vercel-ip-country`. Hashed IPs only (`sha256(ip + daily
  salt)`), never raw.

Confirmed and planned (HANDOVER phases 2–4, not yet built as of 22 Oct 2026):

- Code CRUD, destination history, pause/resume.
- QR downloads: SVG and PNG at 1024 and 2048px, colours, logo with error
  correction H.
- Dashboard with per-code scan totals (today, 7, 30 days); analytics by day,
  country and device; CSV export.
- Paystack checkout, plan limits, grace period, admin tools, legal pages.

Explicitly undecided — must not be stated as fact anywhere:

- Plan **names**, code limits and the annual discount. The entry price is
  settled: **₦4,000 a month** (Francis, 23 Oct 2026), recorded once as
  `PRICE_FROM_NGN` in `src/lib/brand.ts` and quoted nowhere else.
- Free trial and whether codes go live during one.
- Grace period after failed renewal (7 days proposed) and how long lapsed codes
  stay paused before deletion (12 months proposed).
- NDPC registration.

Hard constraints on any new surface in this repo:

- `next build` must pass under an empty environment. No service client at module
  scope.
- Cache Components is on: no `force-dynamic`; `searchParams` only inside a
  `<Suspense>` child; `export const instant = false` for wholly per-request
  pages.
- Any new route name must be added to `RESERVED_CODES` in
  `src/lib/short-code.ts`, or it can be issued as a short code and dead-end a
  printed code.
- The root layout currently sets `robots: noindex` for every page, because the
  status pages are transient states of someone else's printed material. A
  public marketing surface must opt itself back in without un-hiding those.

## Brand Commitments

- **QRiate+** is the product. Wordmark: "QR" capitalised, "iate" lowercase, a
  raised plus. `PRODUCT_NAME` in `src/lib/brand.ts` is the authority; never
  retype it. `PRODUCT_NAME_SPOKEN` ("QRiate Plus") for running text.
- **De Sign Plus** is the parent and is credited, not led with, on this domain.
  `public/brand/logo-b.svg` / `logo-w.svg` are the real parent logos.
- Palette read off the QRiate+ logo, already tokenised in `globals.css`:
  ink `#1A1A1A`, cyan `#5BC5E8`, green `#7DC242` (the raised plus), amber
  `#F5B335`, coral `#F1595C`.
- Typefaces: **Sarlotte** (local, display/headings only) and **Raleway** (body).
- Voice on scan-side pages is calm and non-blaming. The person scanning is never
  at fault.

## Evidence on Hand

- Real: the De Sign Plus parent logos; the brand palette; a working public demo
  at `https://dplus-qr.vercel.app` with live redirects and seeded codes;
  `npm run codes` renders genuinely scannable QR images.
- **The QRiate+ wordmark is in the repo** (supplied 23 Oct 2026), transparent
  and usable: `public/brand/qriate-wordmark.svg` carries the dark letterforms
  for light grounds, and `public/brand/qriate-wordmark-light.svg` is the same
  vector with the neutral letterform fills taken to paper tone and every
  chromatic accent preserved, for dark grounds. The mark is "QRiate" with a
  long Q swash, a cyan four-square QR motif as the tittle of the i, the raised
  plus in green, an amber swash above the R and a coral swash below the Q.
  `PRODUCT_NAME` remains the authority for the plain-text form.
- Francis states that real De Sign Plus print/client photography and real
  nameable clients exist, but **none are in either repo** (`dplus/public` holds
  only `hero-light.jpg`, `hero-dark.jpg`, `corporate.png`, `image.png`;
  catalogue imagery is remote, from Amrod).
- **Absent, and never to be fabricated:** client names, logos, testimonials,
  scan-volume or customer-count numbers, uptime figures, prices, award or press
  claims.

## Product Principles

1. **A printed code outlives every decision around it.** Reliability of the
   redirect beats any feature, and the host inside a code is permanent.
2. **Reprinting is the enemy.** Every claim and feature traces back to removing
   a reprint.
3. **Bill the way Nigeria pays.** Naira and Paystack, not USD cards.
4. **The scanner is blameless.** Anyone who meets a failure state meets an
   explanation and a way forward, not an error.
5. **Say only what is true today, or clearly mark when it arrives.** The product
   is mid-build; undecided facts stay undecided in public copy.

## Accessibility & Inclusion

No formal standard is contractually required, but the audience forces two
things: the scan-side and marketing surfaces must be legible and fast on weak
mobile connections and mid-range Android devices, and the existing dark-mode
support (`prefers-color-scheme`) must hold on every new surface. Motion respects
`prefers-reduced-motion`.
