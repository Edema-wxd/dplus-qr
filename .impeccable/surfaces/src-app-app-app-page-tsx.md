---
version: 1
slug: "src-app-app-app-page-tsx"
primary_target: "src/app/(app)/app/page.tsx"
related_targets: ["src/app/(app)/app/[id]/page.tsx"]
---

## Scope

The signed-in dashboard: `/app` (code list) and `/app/[id]` (one code), plus the
`qr` and `export` route handlers under them. `/account` remains settings.

Visitor mode: **Operate.** Success is a job done — a code made, re-pointed,
paused, downloaded, or its scans understood.

## Audience and job

The same Nigerian business that printed the code. They are not technical, they
open this a few times a month, and the job is almost always one of four things:
make a code for something about to be printed, change where an existing code
goes, check whether it is being scanned, or get the artwork to send to a
printer. Everything else is secondary.

## Content and states

Real data only: the user's own codes, their scan counts from `qr_scans`, and
their destination history. Every number is live; nothing on this surface is
illustrative. States that must be designed, not discovered: no codes yet, a
code with zero scans, a paused code, a blocked code (owner cannot lift it), the
plan limit reached, an unverified email, and a destination the screener refuses.

## Direction contract

THESIS: The dashboard is a working table of codes, and the thing that makes it
QRiate+ is that the real symbol is present at every scale — the artwork is never
an icon standing in for a code. It refuses the SaaS default of a card grid of
coloured tiles, and it refuses dressing the table as ledger paper: on a working
screen the world is held to type, palette, density and one move.

OWN-WORLD: The landing page's two materials, reassigned to shell and work area.
An ink bar at `--field` carries the wordmark and navigation; everything below is
`--paper` at full width, because a dense table is read for minutes, not seconds.
Sarlotte sets page headings only; Raleway sets every label, control and cell.
All figures are tabular. Status is colour doing a real job: `--live-ink` active,
`--pending-ink` paused, `--struck-ink` blocked, `--pin-ink` for selection, focus
and the primary action. Controls are plain web components — buttons, inputs,
tabs, a real `<table>` with a real header — never a costume of anything.

STORY: "these are my codes, and that one is scanning" → "this is where it points
and I can change it without reprinting" → "here is the artwork to send to the
printer".

FIRST VIEWPORT: Ink bar across the top: wordmark left, Codes / Settings centre,
plan usage and sign-out right. Below, on paper: an `<h1>` in Sarlotte, the
primary action "New code" aligned to its right, then the table. Columns: the
real QR symbol at 44px, name over short code in mono, destination (truncated,
with its host emphasised), status pill, and three right-aligned tabular scan
figures under a Today / 7d / 30d header group. A row is a link to the code.
Empty state replaces the table with one sentence and the same primary action.

FORM: An ordinary dense product table, chosen deliberately over the category's
card grid. No concept tournament was run: the approved plan fixed the approach
as "extend the landing page's system, adapted for Operate", and at surface scope
inside a settled world this is a composition decision the plan already made.
seed: none (not rolled for this surface)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature move

**The real symbol at every scale.** Every row renders that code's actual QR
symbol, generated from its real short code, not a glyph or a placeholder tile.
On the detail page the same symbol becomes the pinned specimen — identical in
construction to the landing page's hero — with the destination editor and the
history log beside it, so the product's one argument is the same object the
dashboard is built around. It costs nothing at runtime: the symbols are drawn
server-side as inline SVG paths from data already on the page.

## Unresolved

- `max_codes = 5` and `history_days = 30` on the free plan are placeholders for
  decisions still open in DECISIONS.md; both are a single `UPDATE`.
- The `qr_scan_daily` rollup and the retention sweep do not exist, so analytics
  read raw `qr_scans`. Correct now, and phase 4 work later.
- Logo-in-QR is not offered: `style` and `logo_key` exist on `qr_codes` and the
  storage helpers exist, but nothing writes them yet.
