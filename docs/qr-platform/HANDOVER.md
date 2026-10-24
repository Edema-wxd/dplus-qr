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

### Phase 1: Foundation

- [ ] Migration runner script and `schema_migrations` table
- [ ] Migrations for `qr_plans`, `qr_subscriptions`, `qr_codes`,
      `qr_destination_history`, `qr_scans`, `qr_scan_daily`,
      `qr_payment_events`, `qr_abuse_reports`, `qr_users`
- [ ] `client` role in next-auth; middleware guarding the dashboard and admin
- [x] `mail.qriateplus.com` verified in Resend, and Neon Auth's custom SMTP
      pointed at it on the `production` branch — 23 Oct 2026. Inspect with
      `neon neon-auth config email-provider get`; a new branch does not inherit
      it, so re-run the `update` there.
- [ ] Sign-up, email verification (Resend), login, password reset, rate limits
- [ ] Redirect host routing with a `/health` route
- [ ] Staging app with its own database

**Done when:** a new user can sign up, verify, log in and reset a password on
staging; `/health` returns `200`; migrations run cleanly on a fresh database.

### Phase 2: Core product

- [ ] Create, rename, edit destination, pause and resume codes (with history)
- [ ] Short code generator (7 characters, base-58, collision retry)
- [ ] Redirect handler: format check, cache, `302`, paused and blocked pages
- [ ] Scan recording in `after()`: Redis counters, `qr_scans` row, UA parsing,
      bot flag, geo lookup, hashed IP
- [ ] QR downloads: SVG and PNG (1024 and 2048 px), colours, logo with error
      correction H
- [ ] Dashboard: code list, per-code scan totals for today, 7 and 30 days

**Done when:** a code printed on paper scans on an iPhone and an older Android;
changing its destination takes effect within 60 seconds; a WhatsApp link preview
does not count as a scan; the redirect responds in under 100 ms when cached.

### Phase 3: Billing and safety

- [ ] Paystack plans seeded into `qr_plans`; checkout via initialize transaction
- [x] Webhook endpoint: signature check, idempotency, handling of
      `subscription.create`, `charge.success`, `invoice.payment_failed`,
      `subscription.not_renew`, `subscription.disable` — 24 Oct 2026
- [x] Plan rows seeded (migration 013); `npm run plans:sync` attaches the
      Paystack plan codes, which is the one step that needs the live key
- [x] Checkout: `startCheckout` + `/billing`, returning to `/billing/confirming`,
      which waits on the webhook rather than trusting the browser
- [x] Grace expiry cron (`/api/cron/grace`, daily) with the lapse email
- [ ] Plan limits enforced on code creation; codes only go live with an active
      subscription
- [ ] Grace period, lapse to paused page, restore on payment; failure emails
- [ ] Destination screening (scheme rules, shortener block, Web Risk) and weekly
      re-check cron
- [ ] Admin tools: search, block code, suspend account, abuse reports, audit log
- [ ] Privacy Policy, Terms and acceptable-use pages

**Done when:** a full test-card purchase activates an account; a replayed webhook
changes nothing; a simulated failed renewal pauses codes after the grace period
and a new payment restores them; a known test phishing URL is refused.

### Phase 4: Analytics and polish

- [x] Nightly rollup into `qr_scan_daily` and retention cleanup per plan
      (migration `012` added the country/device dimensions; `src/lib/rollup.ts`,
      `/api/cron/scans`, `npm run scans:rollup`)
- [ ] Analytics charts: scans by day, country, device; CSV export
- [ ] Nightly backup to S3 and a tested restore
- [ ] Uptime monitor on `/health`, error alerts, weekly admin summary email
- [ ] Public landing and pricing pages

**Done when:** dashboards load from rollups only; a backup restore succeeds on
staging; an outage of the redirect host triggers an alert within 2 minutes.

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
