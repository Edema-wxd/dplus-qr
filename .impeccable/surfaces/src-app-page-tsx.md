---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

## Scope

`src/app/page.tsx` — the public landing page at the root of `qriateplus.com`.
One route, no new routes (so `RESERVED_CODES` is untouched); every secondary
destination is an in-page anchor, plus `/pricing`, `/auth/sign-up`,
`/auth/sign-in` and the De Sign Plus main site.

Visitor mode: **Persuade.** Success is a signed-up account.

## Audience and job

A Nigerian business that prints things — packaging, labels, menus, gifting,
signage, event collateral — that needs the link on the print to change, or is
about to commit to a run and does not want to be trapped. The page shows every
benefit of a dynamic code, lets them re-point a demo code before they have an
account, then converts on keeping it. Funnel (Francis, 6 Nov 2026): try-it demo
in the hero, a sign-up action closing every benefit line, price anchor, FAQ
that answers objections, final call to action.

## Content and proof

Real and verifiable only: features in `PLAN_FEATURES` marked built, the page
types in `qr-types.ts`, the redirect contract, the short host and its module
count, naira billing through Paystack, the 7-day grace period, the
`LAPSE_RETENTION_MONTHS` retention, `PRICE_FROM_NGN`, De Sign Plus as parent
and printer. No testimonials, client names, counts or uptime figures (Francis,
6 Nov 2026: "no new proof, stay honest"). Destination histories, scan counts
and use-case rows are demonstration data and say so on screen. Plan-gated
features are described without naming a plan.

## Direction contract

THESIS: The printed code is the platform number on a departure board — fixed in
its column forever — and the destination is the flap that changes. The page
refuses the category's split hero with a phone mock and the three-card feature
row; every benefit is a row on a board.

OWN-WORLD: A concourse painted in the full brand palette — each benefit group is
a transit line with its own wall colour: cyan `#5BC5E8` (hero, reliability),
green `#7DC242` (change it), amber `#F5B335` (scans), coral `#F1595C` (pages),
ink `#1A1A1A` between them. On each wall hangs a black split-flap board: white
characters in fixed cells with a hairline split, status flaps coloured by
state. Sarlotte sets headlines in ink on the walls; Raleway sets body and the
flap characters. Controls are flap tiles and painted ink/cyan buttons.

STORY: "A QR code locks my link once it's printed" → "on this board the code
stays and the destination flips — I just did it" → "and I can pause it, count
it, turn it into a menu, and it's built not to break" → "from ₦4,000 a month in
naira, so I'll make one."

FIRST VIEWPORT: Cyan wall. Left, Sarlotte at ~5rem: "Print it once. Change it
whenever." with a 44ch lede, the ink "Create your first code" action and three
plain facts. Right, the board: the real 25×25 symbol on a white tile in the
fixed column, the code URL in flaps, four dated destination rows with the
last LIVE in green, and the "type a web address" field on the board itself.

FORM: The Departure Board — challenger `signals-instruments-split-flap-concourse`
fused with the full brand palette, chosen by Francis over the assigned
Painted Signboard. seed:9447475cfc63933e8ee312d29b028e98

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict and DESIGN.md.

## Signature interaction

**The destination flaps; the code never moves.** Submitting a web address in
the hero board retires the live row to WAS and writes a new row whose
characters flip in one by one (~22ms apart, rotateX on the cell, exponential
ease-out). The QR tile and the code-URL flaps are server-rendered children and
cannot re-render. On load the board's rows cascade once with the same flip.
Reduced motion: the characters simply appear.

## Unresolved

- Real De Sign Plus print photography and nameable clients. The page stands
  without them and has no slot that fabricates either.
