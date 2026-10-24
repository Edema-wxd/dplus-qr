---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

## Scope

`src/app/page.tsx` — the public landing page at the root of `qriateplus.com`.
One route, no new routes (so `RESERVED_CODES` is untouched); every secondary
destination is an in-page anchor and the only outbound links are
`/auth/sign-up` and `/auth/sign-in`.

Visitor mode: **Persuade.** Success is a signed-up account.

## Audience and job

A Nigerian business that prints things — packaging, labels, menus, gifting,
signage, event collateral — and has just realised the link on the print needs
to change, or is about to commit to a run and does not want to be trapped. The
action they came to take is the product's real first step: decide what a code
should point at. The page lets them do that step before they have an account,
then converts on keeping it.

## Content and proof

Real and verifiable only: the 7-character base-58 code, the 30-character code
URL and the module count that follows from it, the redirect contract (302 never
301, `no-store`, one cached lookup, scan recording deferred, a rate-limited
request still redirects), hashed IPs, the calm status pages, naira billing
through Paystack, De Sign Plus as parent and printer.

No invented client names, logos, testimonials, counts or uptime figures.
Destination-history rows and the reprint arithmetic are demonstration data and
carry the word illustrative. The price anchor is a single "from" figure Francis
must supply; until then it renders as an em dash from one constant.

## Direction contract

THESIS: One printed symbol, held rigidly still while everything it points at
moves — the page is the proof that re-pointing costs nothing. It refuses the
category's split hero (copy left, phone mock right, logo row beneath) and
refuses the three-feature card row; the mechanism is the composition, not an
illustration inside it.

OWN-WORLD: Two materials meeting on a hard vertical seam. Left, a paper
specimen panel in near-white `oklch(0.99 0.0025 90)` with ink `#1A1A1A`, the
symbol tacked down with four cyan `#5BC5E8` pins. Right, an ink field at
`oklch(0.18 0.005 226)` carrying hairline-ruled log rows, tabular monospace
destinations, and `#7DC242` reserved for exactly one thing: the live row.
Sarlotte sets every headline; Raleway sets body; amber `#F5B335` and coral
`#F1595C` appear only where something is pending or struck through. No cards, no
gradients, no glass, no kickers. Components are ledger rows, specimen captions,
and ruled strips.

STORY: "A QR code locks my link forever" → "this one doesn't, and here is the
same symbol proving it" → "the arithmetic and the redirect contract are stated,
not claimed" → "so print it once and keep the account."

FIRST VIEWPORT: A two-material split on a 2:3 seam. Left panel, sticky and full
height: the wordmark top-left, then a real 25×25 QR symbol at 330px centred
under four cyan pins, the caption "This symbol never changes again", the code
URL in mono beneath it, then the destination field and the primary action
directly under the symbol so the action sits inside the mechanism. Right field:
Sarlotte at 78px/0.95 — "Print it once. Re-point it forever." — the second
clause in cyan; a 40ch lede; then the ruled destination log, five dated rows,
the last one live in green. The redirect contract runs as a hairline footer
strip. Primary action is unmistakable and above the fold on both columns'
terms.

FORM: The Constant Code — index 1 of my ordered structures, dealt by the roll
alongside The Reprint Quote and The Switchboard, locked by Francis on the
decision page. seed:8b0f0c59c3a1903a

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

**The log advances; the symbol never redraws.** Typing a destination into the
specimen panel's field writes a new live row into the log and retires the
previous one, while the symbol and the hairline rule under it stay provably
identical — no transform, no repaint, no key change. Entrance is one
orchestrated stagger down the log rows at 50ms, exponential ease-out from an
already-visible default; reduced motion keeps the opacity and drops the travel.
The field never claims to register a code: it is labelled a preview and the
action next to it is the account.

## Unresolved

- The price anchor figure for "Plans from ₦—/month" (`PRICE_FROM` in
  `src/lib/brand.ts`). Renders as an em dash until supplied.
- Real De Sign Plus print photography and nameable clients: Francis says both
  exist, neither is in the repo. The page is built to stand without them and
  has no slot that fabricates either.
- ~~A clean QRiate+ wordmark vector.~~ **Supplied 23 Oct 2026.** The real mark
  now ships in the specimen panel, the phone header, the footer and the social
  card, as a pair of transparent vectors (`qriate-wordmark.svg` for light
  grounds, `qriate-wordmark-light.svg` for dark). The typographic stand-in is
  retired.
