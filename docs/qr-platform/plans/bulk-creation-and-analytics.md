# Plan: Bulk creation and analytics levels

**Status: proposed, not approved.** Drafted 6 November 2026 from a review of
the code as it stood that day. Per CLAUDE.md, nothing here is built until
Francis has answered the decisions at the end and approved the plan.

**Migration number:** this plan says `025`, which `025_feedback_context`
(PR #34) has since taken. Use the next free number when building, and update
`LATEST_MIGRATION` in `src/lib/schema-version.ts`.

---

Based on CLAUDE.md, DECISIONS.md and the code each plan touches. Four findings shape both plans:

- **Pro and Business cannot see the history they pay for.** `ANALYTICS_WINDOWS` is `[7, 30, 90]` and `analyticsWindow()` collapses anything else to 30. So Pro (365 days) and Business (730 days) see the same 90-day chart as Starter. Meanwhile `qr_scan_daily` is never pruned (only erase deletes from it), so the data for long views already exists.
- **The seed data already says what the `analytics` flag was meant to mean.** Migration 013 sets `analytics: basic` on Starter and `trends` on Pro and Business. That is exactly the split `history_days` (90 / 365 / 730) already makes.
- **Unknown flags survive admin edits.** `featuresFromForm` in `plan-admin.ts` merges the form over the existing flags, so a key removed from the catalogue stays stored but inert.
- **The current code limit check can race.** `createCode` reads `codesUsed`, checks it, then inserts, with no lock. Two creates at once can both pass at `max - 1`. Bulk creation makes this much worse unless the two share a lock.

Side issues worth fixing (not blocking):
- `canUseCustomCodes`, `canMakeHostedPages`, `canShareStats` and `VIDEO_REASON` hard-code plan names ("Pro and Business", "Starter and up"), which breaks the copy rule.
- `codeAnalytics` sums `unique_scans` across dimension rows within a day. Migration 012's column comment says that column is not summable. It slightly overcounts.
- `plan-tiers.test.ts:90` asserts that no price-table line mentions "bulk". It must change when bulk ships.

---

## 1. Bulk creation

**Recommended shape:** a two-step Server Action (check, then create) under `/app/new/bulk`. Link codes only in v1. It runs inline, with no background job. Capacity is all-or-nothing, with one transaction behind a per-account advisory lock.

### Input format and limits
- Accept a CSV upload or text pasted into a box (the paste box matters on phones). Both go through one parser.
- **Columns:** `name` and `destination` are required. Two are optional:
  - `type`: `url` (default), `instagram` or `facebook`.
  - `link`: a custom short code, allowed only when `canUseCustomCodes` passes.
- Headers are matched case-insensitively. An unknown column is a file-level error.
- **Limits:** file up to 256 KB (well under the 1 MB Server Action body limit). Rows up to the smaller of the free slots and a hard cap of 500, since staff can raise `max_codes`. `name` 1–80 characters, `destination` up to 2048 (same as `nameSchema` and `destinationSchema`).
- **Parser:** a small RFC 4180 parser in `src/lib/bulk-import.ts` (quoted fields, doubled quotes, CRLF, UTF-8 BOM from Excel). Blank rows are skipped. Rows are numbered as the spreadsheet shows them (header is row 1).
- **Page types:** left out of v1. They need per-kind JSON content and uploaded `fileId`s, which a CSV cannot carry.

### Per-row screening and the error report
- Every row goes through `linkDestination(kind, raw)`, which uses `screenUrl`. That gives the same refusals as a single create: blocked schemes, userinfo, bare IPs, other shorteners, our own hosts.
- `link` goes through `checkCustomCode`. A duplicate `link` inside the same file is a row error.
- `checkReputation` is still a stub. When Web Risk lands, the bulk path must call it once per distinct destination.
- **Check step** (`checkBulkAction`): parses and validates, writes nothing, and returns `{ rows: [{ row, name, destination, ok, reason? }], valid, invalid, slotsLeft }`.
- The preview table shows each problem inline on its row (errors stay inline, per CLAUDE.md). It also offers "Download rows with problems" as a CSV built in the browser, with every cell passed through `csvCell` because the cells are the user's own untrusted input.
- **Create step** (`createBulkAction`) re-parses and re-validates everything on the server and never trusts the preview. Rows that failed are left out, and the confirm button says so ("Create 47 codes, skip 3").

### Interaction with `max_codes`
- **Capacity is all-or-nothing.** If the valid rows exceed the free slots, nothing is created. The page shows the `codesOffer` prompt and the exact number of rows to remove. It never quietly creates the first k rows.
- **Enforced inside the transaction:** take `pg_advisory_xact_lock(hashtextextended('qr_codes:' || $user, 0))`, recount codes `where archived_at is null`, and refuse if used plus new exceeds the limit.
- Move single `createCode` onto the same lock with a shared `withCodeSlots(userId, n, fn)` helper in `user-codes.ts`. Otherwise a single create and a bulk create at the same moment can still overshoot.
- Transaction-scoped advisory locks are safe over PgBouncer in transaction mode, the same reasoning `withTransaction` already documents.

### Short codes at volume
- One multi-row `insert into qr_codes (...) select * from unnest($1::uuid[], $2::text[], ...) on conflict (short_code) do nothing returning id, short_code`. This keeps the rule: the unique index decides, and nothing is checked first.
- Generated codes are de-duplicated in JS first. Rows that do not come back get fresh codes and are retried, up to 5 rounds (the same budget as `createCode`).
- A custom `link` that does not come back means it is taken. Roll back the whole transaction and report "row 12: qriateplus.com/x is already taken". Never substitute another link.
- A plain insert cannot be used: a unique violation would abort the transaction, so `on conflict do nothing` is required.
- The logo is checked once with `ownsLiveLogo` and applies to every row. Colours stay at the default; owners restyle each code afterwards.

### Inline or job
- **Inline.** 500 rows of pure validation plus one `unnest` insert takes well under 2 seconds. Fluid compute allows about 300 s by default. A queue would add a table, a cron and polling for no gain.
- Add `allowBulkImport(userId)` in `ratelimit.ts` (10 an hour, fails open like the others; the code limit is the real ceiling).

### Downloading every QR image (zip)
- **Shared renderer first.** Pull the body of `src/app/(app)/app/[id]/qr/route.ts` out into `src/lib/qr-artwork.ts` as `renderArtwork(code, format, size, logoCache)`. The single download and the zip then produce identical bytes. Each distinct logo is loaded once per request.
- **Route:** `src/app/(app)/app/codes.zip/route.ts`, with `?import={id}` or all codes, `format=svg|png`, size 1024 only. It re-checks the session, filters by `user_id`, and applies `canBulkCreate`.
- The zip is streamed. Entries are named `{slug(name)}-{shortCode}.{ext}`, where slug keeps only `[a-z0-9-]` and is capped at 40 characters (so no `/` or `..` can get in). It includes a `codes.csv` list (name, short link, destination, created) passed through `csvCell`.
- PNGs go through sharp, roughly 15 s for 250 codes with logos. Set `maxDuration = 60` on the route and cap a zip at 500 entries.
- **Zip library:** none is installed yet. Add `fflate` at an exact version, following the PDF.js precedent of the newest release more than two weeks old. It has no dependencies and streams. A hand-written store-only zip (about 120 lines) is the alternative.

### Server-side gating and the UI
- `canBulkCreate(entitlement)` in `entitlement.ts` returns `{ok, reason}`. The reason never names a plan.
- Add the `bulk_creation` gate and its copy to `upgrade-offers.ts`, so `featureOffer("bulk_creation", …)` finds the cheapest plan from the rows.
- **Ways in:**
  - a "Make many at once" link on `/app` next to `NewCodeButton`;
  - a card on `/app/new` (`page.tsx` / `TypeSection`).
  - On a locked plan both render as `LockedButton` with that offer. At the code limit they use `codesOffer` instead.
- `/app/new/bulk/page.tsx` (`instant = false`) shows the locked explanation instead of the form on a plan without the flag, following the hosted-pages pattern. Both actions and the zip route refuse anyway.
- No `RESERVED_CODES` change is needed: everything sits under `/app`, as with the Files page.
- On success, `flash("bulk-created")` (add it to `FLASH_MESSAGES`) and redirect to `/app/imports/[id]`. That page lists the batch and offers the SVG zip, the PNG zip and the CSV list.

### Audit and migration (additive only)
- `db/migrations/025_bulk_imports.sql`:
  - `qr_bulk_imports(id bigserial, user_id uuid references qr_users on delete restrict, source text check in ('csv','paste'), rows_total, rows_created, created_at)`;
  - `qr_bulk_import_codes(import_id references qr_bulk_imports, qr_id references qr_codes, primary key(import_id, qr_id))`;
  - an index on `(user_id, created_at desc)`.
- A join table rather than a new column on `qr_codes`, so the table every scan reads is never altered. Store counts only, never the uploaded file or the error rows.
- `eraseAccountData` in `moderation.ts` must delete the account's rows from both new tables.
- Staff: the customer page shows recent imports. Optional follow-up: a "block every code in this import" action, audited through `recordChange()`.

### Catalogue and copy
- In `PLAN_FEATURES`, set `bulk_creation` to `built: true` with the label "Bulk creation from a spreadsheet" and real help text. `advertisedFeatures` then lists it on whichever plans hold the flag. No copy names a plan.

### Tests
- `src/__tests__/bulk-import.test.ts`:
  - **Parser:** quotes, commas inside quotes, CRLF, BOM, blank rows, header aliases, oversized file, too many rows.
  - **Row checks:** `javascript:`, a shortener, our own host, userinfo, an Instagram handle, name length, `link` on a plan without custom codes, duplicate `link` in the file, reserved and impersonation links.
  - **Capacity:** exactly filling the slots passes; one over refuses the whole batch.
  - **Report:** row numbers match the spreadsheet.
- `plan-gates.test.ts`: `canBulkCreate`. `upgrade-offers.test.ts`: the bulk offer picks the cheapest flagged plan.
- `plan-tiers.test.ts` / `admin.test.ts`: update the "no bulk" assertion.
- **Zip:** unzip the output with fflate and check entry names are clean, the list CSV defuses `=` and the bytes match the single download.
- `redirect-isolation.test.ts` stays green.
- **Local Postgres, as in DECISIONS:**
  - two imports at once cannot exceed `max_codes`;
  - a forced short-code collision is retried;
  - a taken custom link rolls everything back;
  - erase removes the import rows.

### Acceptance criteria
1. On a plan without the flag, every way in is a working `LockedButton`. Both actions and the zip route refuse.
2. A 250-row CSV with 3 bad rows shows those 3 inline with reasons, then creates exactly 247 codes, all screened.
3. Valid rows over the free slots create nothing and show the codes upgrade prompt.
4. Simultaneous imports never push `codes_used` past `max_codes`.
5. The SVG and PNG zips match the single downloads byte for byte.
6. `env -i … next build`, lint and tests all pass.

### Order of work
1. Migration 025.
2. `withCodeSlots`, with `createCode` moved onto it.
3. Parser and validator in `bulk-import.ts`, plus tests.
4. `canBulkCreate` and the offer.
5. The two actions and the rate limit.
6. The `/app/new/bulk` UI and the ways in.
7. `qr-artwork.ts` extraction, then the zip route and `fflate`.
8. `/app/imports/[id]`.
9. Erase handling and the staff view.
10. Catalogue flag set to built, and a DECISIONS entry.

---

## 2. Analytics levels

**Recommendation: retire `analytics`, and build the long-range view it stood for under `history_days`.**

- **Why not keep it as a separate flag:** it would double-gate the same chart. Staff could create combinations that make no sense: "trends" with 30 days of history (nothing to show), or "basic" with 730 days (paying for history you cannot see).
- **Why not merge it into `insights`:** `insights` is on Starter and up. Merging would give Starter "trends", against the seed. It also mixes up two separate things: which breakdowns you see and how far back you can look.
- `historyOffer` already finds the cheapest plan with `historyDays >= days`, so the upgrade path exists.
- Result:
  - Starter: 7, 30 and 90 days, with 6 months shown locked.
  - Pro: adds 6 and 12 months.
  - Business: adds 24 months.

### Steps

1. **Retire the flag** (`src/lib/plan-features.ts`, `src/lib/plans.ts`).
   - Delete the `analytics` entry and the `analytics?:` type field.
   - Add `export const RETIRED_FEATURE_KEYS = ["analytics"] as const`, with a comment saying the key must never be reused, because six plan rows still store it.
   - **No migration.** The stored keys stay inert, `featuresFromForm` keeps them, and the admin table stops showing the column. Removing them would be a data deletion for no benefit.
   - Update the comment at `admin.test.ts:147`.

2. **Windows and buckets** (`src/lib/user-codes.ts`).
   - `ANALYTICS_WINDOWS = [7, 30, 90, 180, 365, 730]`, still the interpolation allowlist.
   - `bucketFor(window)` returns `day` for 90 or less, `week` for 180 and 365, `month` for 730, from a fixed allowlist and never from input.
   - Generalise `codeAnalytics`: `generate_series` over `date_trunc(bucket, …)` starts. Points become `{ start, scans, unique: number | null, partial }`.
   - Unique scans are shown only for daily buckets; daily uniques cannot be added into weeks or months honestly.
   - The series starts at the later of the window start and the code's `created_at`, aligned to the bucket. Otherwise a code made in October shows 50 empty weeks, and the rollup only began on 23 October 2026.
   - Completed days come from `qr_scan_daily`, today from raw `qr_scans`, as now. Raw `scanRows` export keeps its own clamp at 90 days or less.

3. **Which windows are offered** (`src/lib/entitlement.ts`).
   - `chartWindows(entitlement)`: every window up to `historyDays`, plus the next one up as a locked hint. Locked windows stay visible without six buttons for Free.

4. **Load long windows only when picked.**
   - New `src/app/(app)/app/[id]/analytics/route.ts`, `GET ?days=N`, returns JSON. It applies the export route's checks: session, `parseCodeId`, ownership, `window <= chartDaysAllowed`, and `detail` only with `canSeeInsights`.
   - `[id]/page.tsx` keeps computing 90 days or less on the server. That keeps `LiveRefresh`'s 30-second `router.refresh()` from re-running 6 windows' worth of queries (up to about 40 per tick).
   - The admin code page can compute all six on the server.
   - `/s/[token]` stays at 90 days or less in v1, by an explicit filter.

5. **UI** (`Analytics.tsx`).
   - Window labels from `historyLabel` ("6 months", "12 months", "24 months").
   - Fetch on select, with a loading state.
   - Bucket bars, with a partial bucket drawn lighter and labelled "so far".
   - x-axis labels are bucket starts. The screen-reader table switches to "Week starting" or "Month".

6. **Upgrade offer and CSV.**
   - `historyOffer` in `upgrade-offers.ts` titles the offer "12 months of scans" using `historyLabel`, not "365 days".
   - `tableCsv` in `csv-export.ts` writes `week_starting,scans` or `month,scans` for long windows.
   - The export route accepts the new windows for `?table=` only.

7. **Pricing copy.** Nothing to remove, since `analytics` was never advertised. In `featureLines` (`plan-tiers.ts`), change `"{historyLabel} of scan history"` to `"{historyLabel} of scan history and charts"`. It is still built from the row, never from a plan name.

8. **Docs.** Add a new dated DECISIONS entry (append, never edit old ones) and update "Still open".

### Tests
- No catalogue key appears in `RETIRED_FEATURE_KEYS`. `advertisedFeatures` and `describeFeature` ignore a stored `analytics`. `featuresFromForm` keeps it.
- `analyticsWindow` accepts only the six windows. `bucketFor` mapping. `chartWindows` for 30, 90, 365, 730 and Infinity.
- `historyOffer(365)`: correct title, cheapest plan with 365 days or more, no hard-coded names.
- Route handler: 401 signed out, 404 for another account's code, 403 beyond the plan's history, `detail` null without insights.
- **Local Postgres:**
  - weekly and monthly sums equal the daily totals across 400 seeded days;
  - a 3-week-old code starts at its creation week;
  - a day that is partly pruned keeps its rollup totals.

### Acceptance criteria
- Pro sees 6 and 12 months and is offered 24 months locked. Starter is offered 6 months locked. Free is unchanged.
- No long-window query runs on page load or on live refresh.
- `analytics` no longer appears in the admin, and the stored keys survive a plan save.

---

## Decisions Francis needs to make before building

1. **Which plans get bulk creation?** Recommend: keep the seed (Business only), with staff able to move it.
2. **Page types in bulk v1?** Recommend: no. Link, Instagram and Facebook codes only; page types later.
3. **Too many rows for the free slots: partial or refuse?** Recommend: refuse the whole batch. Invalid rows are skipped only after the user sees the preview.
4. **Hard cap per batch?** Recommend: 500, or the free slots if fewer.
5. **Custom links allowed in the CSV?** Recommend: yes, when the plan has custom links. A taken link stops the batch and names the row.
6. **"Download all" zip: bulk plans only, or every paid plan?** Recommend: bulk plans only in v1, and revisit.
7. **Should bulk-made codes go live straight away?** Recommend: yes, screened exactly like single codes. Add a staff action to block a whole import.
8. **Retire `analytics` and let `history_days` decide chart length (Pro 12 months, Business 24)?** Recommend: yes.
9. **Strip the stored `analytics` keys from the six plan rows?** Recommend: no. Leave them inert and never reuse the key.
10. **A Pro-only account-wide trends page later?** Recommend: not now. If it happens, it gets a new flag key, never `analytics`.

### Critical Files for Implementation
- src/lib/user-codes.ts
- src/lib/entitlement.ts
- src/lib/plan-features.ts
- src/app/(app)/app/[id]/Analytics.tsx
- src/app/(app)/app/[id]/qr/route.ts (its renderer moves to the new `src/lib/qr-artwork.ts`)