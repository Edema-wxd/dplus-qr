> **Read DECISIONS.md first.** The hosting, database and Postgres-10 sections of
> this document describe the setup as understood before the `dplus` repo was
> read. The architecture, redirect design, billing flow, security posture and
> cost model are still the governing design. Where the two disagree,
> DECISIONS.md wins.

# De Sign Plus QR Platform: Infrastructure Guidelines

Oct 19, 2026 · @Francis

## Overview

Anyone can sign up, pay a monthly plan, create dynamic QR codes, change where
they point at any time, and see scan analytics.

**The one rule everything else serves:** a printed code must keep working for
years. Clients will put these codes on packaging, banners and business cards
that cannot be reprinted. Every decision below favours redirect reliability over
features.

**Guiding principles**

- **The redirect path is sacred.** It does one database lookup, answers fast, and
  never waits on analytics, billing or email.
- **Isolate the public risk.** Open signup plus redirects is a phishing magnet,
  so every destination is screened.
- **Plain SQL, no ORM.** Migrations are numbered `.sql` files.
- **Design for a move.** Nothing should tie the platform to one host.

## System architecture

One app handles three kinds of traffic, and only one of them — the redirect — is
on the critical path for printed codes.

*(The original document embedded an architecture diagram here: 3 entry points,
1 server, 4 outside services.)*

**The three request paths**

1. **Scan:** a phone opens `qr.de-signplus.com/{code}`. The redirect host finds
   the destination (cache first, then Postgres), answers with a `302`, then
   records the scan in Redis and Postgres.
2. **Dashboard:** a logged-in client creates and edits codes, downloads QR files
   and reads analytics. Logos upload straight to object storage.
3. **Billing:** Paystack calls the webhook endpoint after each checkout, renewal
   or failure. The endpoint verifies the signature and updates the client's
   subscription, which the redirect host reads to decide whether a code is live.

Cron jobs handle everything slow: rollups, retention, grace expiry, destination
re-checks and backups.

## Domains

| Host | Serves | Why |
| --- | --- | --- |
| `qr.de-signplus.com` | `/{code}` redirects, status pages, login and dashboard | Keeps redirect traffic away from the main brand's reputation |
| `de-signplus.com/qr` | Marketing and pricing, linking across | Main brand |

Set the subdomain up before the first code is printed, because the host inside a
printed code can never change.

## Data layer

Tables are prefixed `qr_`. Redis holds only what can be rebuilt: caches,
counters and rate limits.

**Tables**

| Table | Key columns | Notes |
| --- | --- | --- |
| `qr_users` | `email`, `password_hash`, `role`, `email_verified_at`, `paystack_customer_code` | Client accounts |
| `qr_plans` | `slug`, `name`, `paystack_plan_code`, `amount_kobo`, `interval`, `max_codes`, `history_days`, `features` | Plan limits live here, not in code |
| `qr_subscriptions` | `user_id`, `plan_id`, `paystack_subscription_code`, `email_token`, `status`, `current_period_end`, `grace_until` | One active row per user |
| `qr_codes` | `user_id`, `short_code` (unique), `name`, `destination_url`, `status`, `style`, `logo_key` | `status`: `active`, `paused`, `blocked` |
| `qr_destination_history` | `qr_id`, `old_url`, `new_url`, `changed_by`, `changed_at` | Audit trail for every destination edit |
| `qr_scans` | `qr_id`, `scanned_at`, `country`, `city`, `device_type`, `os`, `browser`, `ip_hash`, `is_bot` | Raw events, kept per plan retention |
| `qr_scan_daily` | `qr_id`, `day`, `scans`, `unique_scans` | Rollup the dashboard reads from |
| `qr_payment_events` | `event_key` (unique), `type`, `payload`, `received_at`, `processed_at` | Webhook log and idempotency guard |
| `qr_abuse_reports` | `qr_id`, `reporter_email`, `reason`, `status` | Fed by the report link on status pages |

**Indexes that matter**

- `qr_codes (short_code)` unique: the only lookup on the redirect path
- `qr_codes (user_id)`: dashboard listing
- `qr_scans (qr_id, scanned_at)`: analytics ranges and retention deletes
- `qr_scan_daily (qr_id, day)` unique: upsert target for the rollup job

**Short codes**

Generate 7 random characters from a base-58 alphabet (no `0`, `O`, `I`, `l`),
which gives over 2 trillion combinations. Insert with the unique constraint and
retry on collision. Never derive codes from ids, which would let people
enumerate other clients' codes.

**Retention and backups**

- A nightly cron rolls raw scans into `qr_scan_daily`, then deletes raw scans
  older than the plan's `history_days`. Daily rollups are kept for the life of
  the account.
- A nightly dump is gzipped and uploaded to S3 under a `backups/` prefix with a
  30-day lifecycle rule. Test a restore once before launch and once a quarter.

## Redirect and scan tracking

The redirect answers with a `302` after one cached lookup, and records the scan
only after the response has gone out. Target: under 100 ms server time for a
cached code.

**The redirect handler**

1. Validate the code format (7 base-58 characters). Anything else returns the
   not-found page without touching the database.
2. Look up `short_code` in an in-process cache (60-second TTL). On a miss, query
   `qr_codes` joined to the owner's subscription status.
3. Decide:
   - `active` and subscription in good standing or in grace → `302` to
     `destination_url`
   - `paused` or subscription lapsed past grace → the "code paused" page
   - `blocked` → the "link disabled for safety" page
4. Send the response with `Cache-Control: no-store`.
5. Use `after()` to record the scan once the response is sent.

**Rules that protect printed codes**

- **Always `302`, never `301`.** Browsers cache a `301` permanently, so a later
  destination change would never reach people who already scanned.
- When a destination is edited, delete that code's cache entry so the change is
  live immediately.
- A lapsed subscription never sends scans to an unrelated page or an ad. The
  paused page names the business and says the link is temporarily unavailable.

**Recording a scan** (inside `after()`)

- Increment Redis counters: `scans:{qr_id}:{yyyy-mm-dd}` and a HyperLogLog
  `uniq:{qr_id}:{yyyy-mm-dd}` keyed on the hashed visitor.
- Insert one row into `qr_scans` with country, city, device type, OS and browser.
- Parse the user agent with `ua-parser-js`.
- Flag bots and link previews (WhatsApp, Facebook, Slack, Telegram, Googlebot
  and similar) as `is_bot = true` so they are stored but excluded from client
  counts.
- If any of this fails, log it and move on. A tracking error must never surface
  to the person scanning.

**Privacy by design**

Store `ip_hash = sha256(ip + daily_salt)`, never the raw IP. The salt rotates
daily, so unique counts work within a day but visitors cannot be tracked across
days.

**Rate limiting**

Use `@upstash/ratelimit` on the redirect host so a scripted flood cannot inflate
a client's numbers or exhaust the hosting limits. (Set to 300/min/IP by
decision 13, and a limited request is still redirected.)

## Authentication and accounts

**Sign-up flow**

1. Client registers with name, email and password (bcrypt, cost 12).
2. Resend sends a verification link (single-use token, 24-hour expiry, stored
   hashed).
3. Until verified, the client can explore the dashboard but cannot create a code.
4. Client picks a plan and pays through Paystack. Codes go live once the
   subscription is active.

**Session and access rules**

- JWT sessions with `role` and `user_id` in the token.
- Route guards on the dashboard (client role) and admin (admin role).
- Every query that reads or changes a code filters by
  `user_id = session.user_id`. Never trust a code id sent from the browser on
  its own.
- Admins can view any account, pause or block any code, and impersonate
  read-only for support.

**Account security**

- Rate-limit login, sign-up and password reset (5 attempts per 15 minutes per
  email and per IP).
- Password reset by emailed single-use token, 1-hour expiry, which also ends
  other sessions.

## Billing

Plans are created once in the Paystack dashboard, and the app treats Paystack
webhooks as the only source of truth for who has paid.

**Plan structure** (prices are a business decision still open)

| Plan | Dynamic codes | Scan history | Logo and colours | Data export |
| --- | --- | --- | --- | --- |
| Starter | e.g. 5 | 30 days | Yes | No |
| Pro | e.g. 50 | 12 months | Yes | CSV |
| Business | e.g. 250 | 24 months | Yes | CSV |

**Payment flow**

1. Client picks a plan. The server calls Paystack's initialize-transaction
   endpoint with the client's email and the `plan` code, then redirects to the
   returned checkout URL.
2. Paystack charges the card and creates the subscription, saving the card
   authorisation for renewals.
3. The app reacts to webhooks, not to the browser returning from checkout. The
   return page only shows "confirming your payment" and polls account status.

**Webhooks** (`/api/paystack/webhook`)

- Verify the `x-paystack-signature` header (HMAC SHA-512 of the raw body with
  the secret key) before anything else. Reject anything that fails.
- Insert the event into `qr_payment_events` keyed on a unique event key; if it
  already exists, return `200` and stop. This makes retries harmless.
- Return `200` quickly, then process.

| Event | Action |
| --- | --- |
| `subscription.create` | Create or update `qr_subscriptions`, store `subscription_code` and `email_token`, set `active` |
| `charge.success` (with a plan) | Extend `current_period_end`, clear any grace period |
| `invoice.payment_failed` | Set `past_due`, set `grace_until` to 7 days ahead, email the client |
| `subscription.not_renew` | Mark as cancelling at period end |
| `subscription.disable` | Set `cancelled`; codes follow the lapse rules below |

**Failed renewals**

Paystack does not retry failed subscription charges, so the app must handle
recovery itself:

- Email the client on failure with a link to update their card.
- Daily cron: when `grace_until` passes, codes switch to the paused page. They
  are never deleted.
- Codes come back the moment a new payment succeeds.
- Codes and their history are kept for at least 12 months after lapse, so a
  returning client's printed codes still work.

**Plan changes**

Paystack has no built-in plan swap, so an upgrade or downgrade disables the
current subscription and starts a new one. On a downgrade below the client's
current code count, the client chooses which codes stay active.

## QR generation and storage

QR images are generated on demand from the short URL and the saved style, never
stored. Only client logos are uploaded.

- Library: the `qrcode` npm package for PNG and SVG.
- The encoded content is always the short URL
  (`https://qr.de-signplus.com/Ab3kQ9x`), never the destination. That is what
  makes the code dynamic.
- Error correction level **H** whenever a logo is placed in the centre; level
  **M** otherwise.
- Downloads: SVG for print, PNG at 1024 px and 2048 px for digital.
- Enforce a minimum contrast between foreground and background colours, and keep
  a 4-module quiet zone, so styled codes still scan on cheap phones.
- Logos: PNG, JPG and SVG under 1 MB, stored under
  `qr-logos/{user_id}/{uuid}.{ext}`. Sanitise SVG uploads or convert them to
  PNG, since an SVG can carry script.

**Scan testing**

Before release, print each style on paper and test it with at least one older
Android phone and one iPhone, at small size (2 cm) and from a distance.

## Security, abuse prevention and compliance

**Destination screening**

- Accept only `https://` and `http://` destinations. Reject `javascript:`,
  `data:`, IP-address hosts and other URL shorteners.
- Check every new or edited destination against Google's Web Risk API. Flagged
  links are refused with a clear message.
- Re-check all active destinations weekly by cron and auto-block any newly
  flagged ones, notifying the owner.
- Payment itself is a strong filter: requiring an active paid plan before a code
  goes live stops most throwaway abuse.

**Kill switch and reporting**

- Admin dashboard: search any code or account, set a code to `blocked`, suspend
  an account. Takes effect within the cache window, or instantly with a purge.
- Every status page carries a "Report this link" form that writes to
  `qr_abuse_reports` and emails the De Sign Plus admin.
- Log every admin action with who, what and when.

**Application security**

- All secrets live only in the host's environment settings, never in the repo.
- CSRF protection comes from the auth library and Server Actions; keep
  state-changing endpoints as POST.
- Validate every input on the server with `zod`.
- Rate-limit code creation (20 per hour per account) on top of plan limits.
- Run `npm audit` before each release and fix advisories deliberately, never
  with `--force` mid-deploy.

**NDPA compliance** (Nigeria Data Protection Act 2023)

- De Sign Plus is the data controller for client accounts and a processor for
  scan data collected on clients' behalf. State both roles in the Terms and
  Privacy Policy.
- Scan data is minimised by design: hashed IPs with a daily salt, country and
  city only, no cookies on the redirect.
- Publish a Privacy Policy and Terms of Service before taking payments,
  including an acceptable-use clause that bans phishing, fraud and illegal
  content.
- Give clients account deletion and a data export of their codes and scan
  history.
- Check whether De Sign Plus must register with the Nigeria Data Protection
  Commission based on the number of data subjects processed.

## Environments, deployment and monitoring

| Environment | Database | Paystack | Purpose |
| --- | --- | --- | --- |
| Local | Neon branch or local Postgres | Test keys | Building and unit tests |
| Staging | Separate Neon database | Test keys, test webhook URL | Checking each release |
| Production | Production Neon database | Live keys | Clients |

**Release checklist**

1. Tests pass locally, including redirect, webhook signature and plan-limit
   tests.
2. Build.
3. Take a fresh database dump.
4. Deploy to staging, run migrations, smoke-test sign-up, payment (test card),
   code creation and a real phone scan.
5. Repeat on production. Migrations must be additive so the old build keeps
   working if you need to roll back.
6. Scan two known production codes to confirm.

**Monitoring**

- External uptime check every minute on `/health`, alerting by email and phone.
- The `/health` route checks the database and Redis and returns `200` or `503`.
- Error tracking, or at minimum a daily cron that emails new error lines.
- Email alerts for: webhook signature failures, webhook processing errors,
  backup failures and abuse reports.
- A weekly admin summary: new sign-ups, active subscriptions, failed renewals,
  total scans.

**Domain safety**

Set the redirect domain and de-signplus.com to auto-renew with a backup payment
card, and enable registrar lock. An expired domain would break every printed
code at once.

## Running costs and scaling triggers

| Service | Launch cost | What makes it grow |
| --- | --- | --- |
| Neon Postgres | Free tier to start | Storage and compute hours |
| Upstash Redis | Free: 500K commands/month | About 4 commands per scan, so roughly 125K scans/month fit the free tier. Then $0.20 per 100K commands |
| Paystack | No monthly fee | Local cards: 1.5% + ₦100 per payment, ₦100 waived under ₦2,500, capped at ₦2,000; international cards 3.9% + ₦100; VAT 7.5% on the fee |
| Resend | Existing plan | Verification, receipts and alert emails |
| S3 | A few cents | Logos and nightly backups |
| MaxMind GeoLite2 | Free with account | Confirm licence for commercial use |
| Google Web Risk API | To confirm | Number of destination checks |

On a ₦10,000 monthly plan paid by local card, the Paystack fee is ₦250 plus VAT,
about ₦269. Price plans with that margin in mind.

**Scaling triggers to watch**

- Upstash nears 500K commands in a month → switch to pay-as-you-go.
- `qr_scans` passes a few million rows and dashboard queries slow down →
  shorten raw retention, read only from `qr_scan_daily`.

## Sources

- [Paystack Subscriptions](https://paystack.com/docs/payments/subscriptions/)
- [Paystack Webhooks](https://docs-v2.paystack.com/docs/payments/webhooks/)
- [Upstash Redis pricing](https://upstash.com/pricing/redis)
