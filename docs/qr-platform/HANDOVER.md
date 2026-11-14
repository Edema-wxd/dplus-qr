> **Read DECISIONS.md first.** This document was written before anyone read the
> current `dplus` repo. Several of its stated facts (Next version, database,
> `users` table, nodemailer pin, PostgreSQL 10 restrictions) are out of date, and
> decision 5 moved the dashboard onto `qr.de-signplus.com`. Where the two
> disagree, DECISIONS.md wins. The rest of this document — the phasing, the
> redirect rules, the security posture — still stands.

# De Sign Plus QR Platform: Build Handover

Oct 19, 2026 · @Francis

## Project context

De Sign Plus (de-signplus.com) is a design, branding and corporate gifting
business. VARYN Studio built and maintains its Next.js site. The site already
has a product catalogue fed from Amrod, a portfolio and an admin area.

The new feature is a **paid, self-serve dynamic QR code platform**. Anyone can
sign up, pay a monthly or annual plan through Paystack, create QR codes, change
where each code points at any time, and see scan analytics. The printed code
never changes; only its destination does.

**Locked decisions** (as originally written — see DECISIONS.md for amendments)

| Decision | Choice |
| --- | --- |
| Who can use it | Anyone can sign up (public) |
| Business model | Paid subscription plans, no free tier at launch |
| Payments | Paystack Subscriptions, naira |
| Redirect host | `qr.de-signplus.com` |
| Client dashboard | `qr.de-signplus.com` (amended by decision 5) |
| Database | New Neon project (amended by decision 2) |
| Auth | Own `qr_users` table (amended by decision 4) |
| Supporting services | Upstash Redis, Resend, S3 |

**The one rule:** a printed code must keep working for years. When a choice
trades redirect reliability for a feature, reliability wins.

## Rules for Claude Code

These rules come from real breakages on this project. Follow them without
exception, and stop and ask Francis if a task seems to require breaking one.

**Working process**

1. Plan each phase in plan mode and wait for approval before writing code.
2. Work on a branch per phase (`qr/phase-1-foundation`), and open a pull request
   for Francis to review. Never push to `main` directly.
3. Keep changes additive.
4. Write tests alongside code. A phase is done only when its acceptance criteria
   pass.

**Redirect path**

- Redirects always return `302` with `Cache-Control: no-store`. Never `301`.
- The redirect handler does one cached lookup and nothing else before
  responding. Scan recording runs in `after()`.
- A tracking, Redis or geo failure must never break or delay a redirect.
- The encoded QR content is always `https://qr.de-signplus.com/{short_code}`,
  never the destination URL.

**Database**

- Raw SQL through `pg`. Do not add an ORM.
- Every schema change is a numbered, additive migration in `db/migrations/`.
  Never edit a migration after it has run in production.
- Every query touching client data filters by the session's `user_id`.

**Dependencies and runtime**

- Do not run `npm audit fix --force`.
- Any new external image host goes into `next.config` `remotePatterns`.
- Outside services are reached over HTTPS only.

**Security**

- Never commit secrets. Add every new variable to `.env.example` with a
  placeholder and a comment.
- Verify the Paystack `x-paystack-signature` before reading a webhook body.
  Treat webhooks as the only source of truth for payment state.
- Validate all input with `zod` on the server.
- Store hashed IPs only (`sha256(ip + daily_salt)`), never raw IPs.

## Build plan

Four phases, each reviewed and deployed to staging before the next starts. Paid
sign-ups open to the public only after Phase 3, when abuse controls are in place.

*Reconciled with `main` on 14 November 2026. Every build item is done except
the outside uptime monitor. DECISIONS.md is the detailed record and wins
wherever this list and it differ; dates below point to its entries. An item
"to set up" is built but needs an account or a key before it runs in
production. The "Done when" checks have not been re-run as a set: what each
phase still lacks is listed under it.*

### Phase 1: Foundation

- [x] Migration runner script and `schema_migrations` table: `scripts/migrate.ts`
      and migration `001`, with a checksum check on edited migrations. Applied
      automatically by production deploys since 27 Oct 2026
- [x] Migrations for `qr_plans`, `qr_subscriptions`, `qr_codes`,
      `qr_destination_history`, `qr_scans`, `qr_scan_daily`,
      `qr_payment_events`, `qr_abuse_reports`, `qr_users`: migrations
      `002` to `009`
- [x] ~~`client` role in next-auth; middleware guarding the dashboard and
      admin~~ Superseded: accounts are Neon Managed Better Auth, pages are
      guarded by `proxy.ts`, and staff are a Neon Auth role read on every
      request (26 Oct 2026; non-staff get a real 404 since 6 Nov 2026)
- [x] `mail.qriateplus.com` verified in Resend, and Neon Auth's custom SMTP
      pointed at it on the `production` branch — 23 Oct 2026. Inspect with
      `neon neon-auth config email-provider get`; a new branch does not inherit
      it, so re-run the `update` there.
- [x] Sign-up, email verification (Resend), login, password reset, rate limits:
      Neon Auth, with limits that see the visitor in `allowAuth`
      (10 Nov 2026), new accounts' codes held until the email is confirmed
      (11 Nov 2026), and sign-out ending every session (11 Nov 2026)
- [x] Redirect host routing with a `/health` route: `qriateplus.com` since
      22 Oct 2026; `/health` checks the database and the schema version
- [x] Staging app with its own database: previews are staging, on their own
      empty Neon branch (12 Nov 2026, see DECISIONS.md and STAGING.md). To set
      up: its Neon branch and Vercel values

**Done when:** a new user can sign up, verify, log in and reset a password on
staging; `/health` returns `200`; migrations run cleanly on a fresh database.

*Still to check:* sign-up and reset on staging, once staging is set up.
`/health` answers `200` in production, and every migration applies to a
fresh Postgres (12 Nov 2026).

### Phase 2: Core product

- [x] Create, rename, edit destination, pause and resume codes (with history):
      the dashboard, 23 Oct 2026; `qr_destination_history` records each change
- [x] Short code generator (7 characters, base-58, collision retry):
      `src/lib/short-code.ts`, retried against the unique index, with
      `RESERVED_CODES`; custom codes from 26 Oct 2026
- [x] Redirect handler: format check, cache, `302`, paused and blocked pages:
      `src/app/[code]/route.ts`, behind the isolation test
- [x] Scan recording in `after()`: Redis counters, `qr_scans` row, UA parsing,
      bot flag, geo lookup, hashed IP (geo from Vercel's headers, city again
      from 6 Nov 2026)
- [x] QR downloads: SVG and PNG (1024 and 2048 px), colours, logo with error
      correction H — 26 Oct 2026. Logos via UploadThing; see DECISIONS.md.
      Patterns, corners and frames since 10 Nov 2026
- [x] Dashboard: code list, per-code scan totals for today, 7 and 30 days
      (23 and 26 Oct 2026)

**Done when:** a code printed on paper scans on an iPhone and an older Android;
changing its destination takes effect within 60 seconds; a WhatsApp link preview
does not count as a scan; the redirect responds in under 100 ms when cached.

### Phase 3: Billing and safety

- [x] Paystack plans seeded into `qr_plans`; checkout via initialize transaction
      (migration `013`, `npm run plans:sync`, `startCheckout`; see below)
- [x] Webhook endpoint: signature check, idempotency, handling of
      `subscription.create`, `charge.success`, `invoice.payment_failed`,
      `subscription.not_renew`, `subscription.disable` — 24 Oct 2026. Failed
      deliveries are re-delivered and period ends checked since 11 Nov 2026
- [x] Plan rows seeded (migration 013); `npm run plans:sync` attaches the
      Paystack plan codes, which is the one step that needs the live key
- [x] Checkout: `startCheckout` + `/billing`, returning to `/billing/confirming`,
      which waits on the webhook rather than trusting the browser
- [x] Grace expiry cron (`/api/cron/grace`, daily) with the lapse email
- [x] Plan limits enforced on code creation (`canCreateCode`, under a lock
      since 7 Nov 2026). "Codes only go live with an active subscription" is
      met by the free plan granted on sign-up (23 Oct 2026): every account
      has one, and a lapsed paid plan pauses its codes
- [x] Grace period, lapse to paused page, restore on payment; failure emails
      (`grace_days` per plan, `src/lib/grace.ts`, `src/lib/billing-notify.ts`)
- [x] Destination screening (scheme rules, shortener block, Web Risk) and weekly
      re-check cron (8 Nov 2026: Web Risk built; to set up:
      `WEB_RISK_API_KEY`)
- [x] Admin tools: search, block code, suspend account, abuse reports, audit log
      (27 Oct 2026: search, block, suspend, archive, erase and per-target audit
      history; 28 Oct: the abuse-report queue; 10 Nov: staff warnings and the
      watch lists at `/admin/monitor`)
- [x] Privacy Policy, Terms and acceptable-use pages at `/privacy`, `/terms`
      and `/acceptable-use` — 25 Oct 2026. Drafts, not legally reviewed; no
      entity details yet. The 6-month post-lapse deletion they promise is the
      retention sweep (30 Oct 2026), built but off until
      `DELETION_SWEEPS_ENABLED=true`

**Done when:** a full test-card purchase activates an account; a replayed webhook
changes nothing; a simulated failed renewal pauses codes after the grace period
and a new payment restores them; a known test phishing URL is refused.

*Still to check:* the test-card purchase, which needs Paystack test mode on
staging (left off for now, 12 Nov 2026), and the phishing URL refusal, which
needs `WEB_RISK_API_KEY`.

### Phase 4: Analytics and polish

- [x] Nightly rollup into `qr_scan_daily` and retention cleanup per plan
      (migration `012` added the country/device dimensions; `src/lib/rollup.ts`,
      `/api/cron/scans`, `npm run scans:rollup`)
- [x] Analytics charts: scans by day, country, device; CSV export
      (28 Oct 2026; chart length by plan from 7 Nov 2026)
- [x] Nightly backup and a tested restore: restore-tested every night,
      encrypted on GitHub rather than S3 (8 Nov 2026, see DECISIONS.md and
      RESTORE.md). To set up: its key and secrets. Until then each nightly
      run fails at its first step
- [x] Error alerts and weekly admin summary email (8 Nov 2026, see
      DECISIONS.md)
- [ ] Uptime monitor on `/health`: an outside service to set up, see
      DECISIONS.md, 8 November monitoring entry
- [x] Public landing and pricing pages: `/` and `/pricing`, prices read from
      `qr_plans` (pricing page 26 Oct 2026, its copy editable from the admin
      since 1 Nov 2026), and the blog (10 Nov 2026)

**Done when:** dashboards load from rollups only; a backup restore succeeds on
staging; an outage of the redirect host triggers an alert within 2 minutes.

*Still to check:* a backup restored on staging, once both are set up. The
outage alert needs the uptime monitor, and 2 minutes needs a paid check
interval (a decision in DECISIONS.md, Still open).

## Planning workstream

These run in parallel with the build, in planning chats.

| Task | What to produce | Needed by |
| --- | --- | --- |
| Competitor and pricing research | What Nigerian and global dynamic QR tools charge, their plan limits, and a recommended naira price per plan | Phase 3 |
| Plan and pricing sheet | Final plan names, prices (monthly and annual), code limits, history length | Phase 3 |
| Paystack setup checklist | Business verification, creating plans, test and live keys, webhook URLs per environment | Phase 3 |
| Privacy Policy, Terms, acceptable use | Drafts covering NDPA roles (controller for accounts, processor for scan data), banned uses, data deletion | Phase 3 |
| Email copy | Verification, welcome, payment receipt, failed renewal, grace ending, code blocked | Phase 1 to 3 |
| Paused and blocked page copy | Calm, branded wording for lapsed and disabled codes, plus the report form | Phase 2 |
| Landing and pricing page copy | Page content in the De Sign Plus voice, FAQ, how dynamic codes work | Phase 4 |
| Launch plan | Who to offer it to first, launch offer, announcement messages | Phase 4 |

## Reference

- [Paystack Subscriptions](https://paystack.com/docs/payments/subscriptions/)
- [Paystack Webhooks](https://docs-v2.paystack.com/docs/payments/webhooks/)
- [Upstash Redis pricing](https://upstash.com/pricing/redis)
