---
name: QRiate+
description: Two materials on a hard seam — a paper specimen panel against an ink field — for a dynamic QR platform whose whole argument is that the printed symbol never changes.
colors:
  # --- NEW: landing layer, scoped to .lp, fixed against prefers-color-scheme ---
  paper: "oklch(0.985 0.004 85)"
  paper-ink: "oklch(0.17 0.006 226)"
  paper-soft: "oklch(0.44 0.006 226)"
  paper-rule: "oklch(0.87 0.004 85)"
  field: "oklch(0.165 0.006 226)"
  field-raised: "oklch(0.205 0.006 226)"
  field-ink: "oklch(0.97 0.002 226)"
  field-soft: "oklch(0.74 0.006 226)"
  field-muted: "oklch(0.66 0.006 226)"
  field-rule: "oklch(0.31 0.008 226)"
  pin: "oklch(0.8 0.1 220)"
  live: "oklch(0.8 0.19 133)"
  pending: "oklch(0.83 0.15 81)"
  struck: "oklch(0.72 0.18 23)"
  pin-ink: "oklch(0.58 0.12 220)"
  live-ink: "oklch(0.52 0.16 133)"
  pending-ink: "oklch(0.65 0.14 72)"
  struck-ink: "oklch(0.58 0.2 25)"
  # --- INCUMBENT: De Sign Plus layer, :root, follows prefers-color-scheme ---
  background: "oklch(0.99 0.0025 90)"
  foreground: "oklch(0.18 0.005 226)"
  card: "oklch(1 0 0)"
  muted: "oklch(0.96 0.002 226)"
  muted-foreground: "oklch(0.48 0.005 226)"
  border: "oklch(0.91 0.003 226)"
  coal-grey: "oklch(0.94 0.003 226)"
  dsp-red: "oklch(0.6679 0.183 23.45)"
  dsp-blue: "oklch(0.6 0.1354 212.43)"
  dsp-green: "oklch(0.6 0.2054 133.1)"
  dsp-yellow: "oklch(0.7 0.1502 81.14)"
typography:
  display:
    fontFamily: "Sarlotte, Georgia, serif"
    fontSize: "clamp(2.75rem, 7.5vw, 4.9rem)"
    fontWeight: 400
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Sarlotte, Georgia, serif"
    fontSize: "clamp(2rem, 4.2vw, 3.1rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Sarlotte, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  figure:
    fontFamily: "Sarlotte, Georgia, serif"
    fontSize: "2.6rem"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tabular-nums"
  lede:
    fontFamily: "Raleway, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.625
  body:
    fontFamily: "Raleway, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tabular-nums"
  label:
    fontFamily: "Raleway, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.2em"
rounded:
  hairline: "2px"
  lg: "0.625rem"
  pill: "9999px"
spacing:
  row: "0.875rem"
  gutter-sm: "1.75rem"
  gutter-md: "2.5rem"
  gutter-lg: "3.5rem"
  band: "4rem"
  band-lg: "6rem"
components:
  action-primary:
    backgroundColor: "{colors.pin}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "1rem 1.25rem"
  action-ink:
    backgroundColor: "{colors.field-ink}"
    textColor: "{colors.field}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "0.75rem 1.25rem"
  action-paper:
    backgroundColor: "{colors.paper-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "0.625rem 1rem"
  action-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.field-ink}"
    rounded: "{rounded.lg}"
    padding: "0.75rem 1.25rem"
  input-paper:
    backgroundColor: "#ffffff"
    textColor: "{colors.paper-ink}"
    rounded: "{rounded.lg}"
    padding: "0.625rem 0.875rem"
    height: "44px"
  ledger-row:
    backgroundColor: "transparent"
    textColor: "{colors.field-muted}"
    typography: "{typography.mono}"
    rounded: "0"
    padding: "0.875rem 0"
  ledger-row-live:
    textColor: "{colors.live}"
  pill-live:
    backgroundColor: "transparent"
    textColor: "{colors.live}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
  specimen-caption:
    backgroundColor: "transparent"
    textColor: "{colors.paper-soft}"
    typography: "{typography.label}"
    rounded: "0"
    padding: "0"
---

# Design System: QRiate+

## Overview

**Creative North Star: "The Specimen Sheet and the Ledger"**

QRiate+ ships two materials and nothing between them. On the left is paper: a
near-white specimen panel carrying one real QR symbol, tacked down with four
cyan pins, captioned the way a type foundry captions a cut. On the right is ink:
a near-black field carrying hairline-ruled ledger rows of destinations, dates in
small caps, monospace URLs, one of them live in green. The seam between the two
is hard and vertical, and the argument of the whole product lives in it — the
paper never changes, the ledger always does.

The system is flat, ruled and measured. Depth comes from material and tone, not
from shadow or glass. There are no cards: a three-card feature row was built and
deliberately removed, and its job is done instead by ruled definition lists
whose hairlines carry the structure. Figures are real — the module counts, the
character counts and the symbols themselves are generated by the same library
that produces downloadable artwork — so the type sets them in tabular numerals
at display size and lets them stand as evidence rather than decoration.

This is an **extension** of an incumbent system, not a replacement. The De Sign
Plus oklch tokens, `--radius`, Sarlotte and Raleway were already here and are
unchanged; the status pages and the account/auth pages still use them and still
follow `prefers-color-scheme`. The landing layer (`.lp`) is new, scoped to one
surface, and deliberately **fixed** against the colour scheme: inverting a paper
panel meeting an ink field would not darken the page, it would destroy the
composition.

**Key Characteristics:**

- Two materials, one hard seam; paper for the specimen and the scan side, ink
  for the owner's side
- Ruled, not boxed — hairlines and definition lists instead of cards
- Colour as denotation: green means live, cyan means pinned, amber means
  pending, coral means struck
- Real artefacts only: the QR symbols on screen are genuinely encoded and scan
- One authored motion, from an already-visible default
- Sarlotte for every heading, Raleway for every sentence, monospace for every
  destination

## Colors

An ink/paper pair with four denotative accents lifted from the QRiate+
wordmark, each supplied twice — once tuned for the dark field, once taken down
far enough to hold against near-white paper.

### Primary

- **Pin Cyan** (`{colors.pin}` on ink / `{colors.pin-ink}` on paper): the pins
  that tack the specimen down, the headline's second clause
  ("Re-point it forever"), the primary action block, the focus ring, the text
  selection, and the "Not available" state marker. It is the colour of the thing
  the visitor is allowed to move.

### Secondary

- **Live Green** (`{colors.live}` on ink / `{colors.live-ink}` on paper):
  reserved, and the reservation is the rule. It carries exactly one destination
  row — the live one — its LIVE pill, and the raised plus in the wordmark,
  which now lives inside the supplied vector rather than in CSS and holds its
  green on both grounds. Nothing else on any surface may take it. The paper
  counterpart `{colors.live-ink}` is defined and correct but is currently drawn
  nowhere, since the typographic plus it served has been retired.

### Tertiary

- **Pending Amber** (`{colors.pending}` / `{colors.pending-ink}`): the Paused
  state marker only.
- **Struck Coral** (`{colors.struck}` / `{colors.struck-ink}`): the Blocked
  state marker and form error text only.

### Neutral

- **Specimen Paper** (`{colors.paper}`): the panel ground. Also the face colour
  of the paper-ground primary action.
- **Paper Ink** (`{colors.paper-ink}`): body and display type on paper, the dark
  button ground on paper, and the value of `--qr-ink` (the symbol's modules).
- **Paper Soft** (`{colors.paper-soft}`): captions, labels, secondary sentences
  on paper.
- **Paper Rule** (`{colors.paper-rule}`): every hairline drawn on paper.
- **Ink Field** (`{colors.field}`): the page ground and the text colour of
  light-on-dark buttons.
- **Field Raised** (`{colors.field-raised}`): the one step up from the field,
  available for a raised ink surface.
- **Field Ink** (`{colors.field-ink}`): headlines and the high-contrast button
  ground on the field.
- **Field Soft** (`{colors.field-soft}`) and **Field Muted**
  (`{colors.field-muted}`): the two-step recession for ledes, row notes,
  timestamps and footnotes.
- **Field Rule** (`{colors.field-rule}`): hairlines on ink; row dividers use it
  at 55% opacity so a section boundary outranks a row boundary.

### Incumbent (De Sign Plus layer, used by status, auth and account pages)

- `{colors.background}` / `{colors.foreground}` / `{colors.card}` /
  `{colors.muted}` / `{colors.muted-foreground}` / `{colors.border}` /
  `{colors.coal-grey}`: the scheme-responsive neutrals, with a dark override
  under `prefers-color-scheme: dark`.
- `{colors.dsp-yellow}` / `{colors.dsp-red}` / `{colors.dsp-blue}`: the status
  accent bars — paused, blocked, unavailable — on the scan-side pages.
- `{colors.dsp-green}`: defined and available; not currently drawn on any
  surface.

### Named Rules

**The One Live Row Rule.** Green denotes exactly one thing: the destination that
is currently live, its LIVE pill, and the raised plus in the wordmark. If green
appears twice in one list, the list is lying.

**The Two-Tunings Rule.** Every accent ships twice. On the ink field use the
base token; on paper use the `-ink` counterpart. Never put a field-tuned accent
on paper — it goes faint and stops reading as a signal.

**The Fixed Material Rule.** The `.lp` layer does not respond to
`prefers-color-scheme`. The paper/ink contrast *is* the composition, not a theme
of it. Only the incumbent `:root` layer inverts.

**The Split-Fill Rule.** A brand asset that has to sit on both materials ships
as two files, derived by fill class: near-neutral fills (chroma < 25) are
re-stated for the new ground, chromatic fills are preserved untouched. Never by
`filter`, `invert()` or a blend mode — those move the accents too, and the
wordmark's cyan, green, amber and coral are the same four denotative colours the
rest of the page depends on. Inverting them would make the mark disagree with
its own system.

## Typography

**Display Font:** Sarlotte (local OTF, 400 and 700), headings only
**Body Font:** Raleway (variable, Google), with `ui-sans-serif, system-ui`
**Label/Mono Font:** the platform monospace stack for destinations and code URLs

**Character:** A high-contrast didone display against a humanist sans and a
plain mono. Sarlotte supplies the voice and the authority; Raleway never raises
its own, so the type hierarchy is carried almost entirely by face and size
rather than by weight.

### Hierarchy

- **Display** (Sarlotte 400, `clamp(2.75rem, 7.5vw, 4.9rem)`, 0.95, −0.02em):
  the hero headline only. Set balanced, broken by hand, its second clause in
  cyan.
- **Headline** (Sarlotte 400, `clamp(2rem, 4.2vw, 3.1rem)`, 1.02, −0.015em):
  one per section band, capped at 20–26ch. The closing section runs a wider
  variant (`clamp(2.4rem, 5.4vw, 4rem)`, 0.98, −0.02em).
- **Title** (Sarlotte 400, 1.5–1.75rem, 1): state names and button faces.
  Buttons are set in Sarlotte, which is why they read as labels on a specimen
  sheet rather than as UI chrome. The wordmark is **not** a type role — it is a
  supplied vector (see Components → Wordmark).
- **Figure** (Sarlotte 400, 2.6rem, 1, tabular): measured numbers — module
  counts, the price anchor — carried by `.lp-num`.
- **Lede** (Raleway 400, 17px, 1.625, max 42–46ch): the sentence under a
  headline and the leading term of a definition row.
- **Body** (Raleway 400, 16px, 1.625, max 52–58ch): running copy, with
  `text-wrap: pretty` on every `p` and `dd` so no paragraph ends on a word
  alone. Secondary copy drops to 14px and `{colors.field-muted}`.
- **Mono** (13–15px, tabular): every destination, every code URL. A destination
  is always monospace; it is a machine address and should look like one.
- **Label** (Raleway 400, 11px, uppercase, tracking 0.12em–0.22em): column
  heads, specimen captions, the LIVE pill, timestamps, the contract strip.

### Named Rules

**The Two Voices Rule.** Sarlotte sets headings, numerals and button faces.
Raleway sets every sentence. Nothing is set in a third face except a
destination, which is monospace. No system display face substitutes for
Sarlotte.

**The Tabular Figure Rule.** Any number a reader could compare down a column
carries `.lp-num` (`font-variant-numeric: tabular-nums`, `letter-spacing:
0.01em`). Module counts, character counts, prices, dates.

**The Measured Column Rule.** Every text block declares a `ch` maximum —
roughly 40–46ch for ledes, 52–58ch for body. No paragraph runs the width of the
field.

## Layout

The landing surface is one `min-h-dvh` composition, not a stack of centred
containers. Its first viewport is a 2:3 grid (`minmax(0,2fr) minmax(0,3fr)`)
with two rows: the paper specimen panel occupies column one and spans both
rows, sticky at `top: 0` and `h-dvh` with its own overflow; the headline sits in
column two row one and the destination ledger in column two row two. Below 1024px
the grid collapses to a single column and the order is rewritten — headline
first, specimen second, ledger third — because a visitor who meets a QR symbol
and the word "specimen" before any sentence has not been told what this is. A
sticky compact header (wordmark left, account action right) appears only below
that breakpoint.

Everything after the first viewport is a full-bleed band separated from its
neighbour by a single top hairline. There is no max-width wrapper on the bands;
width is governed per element by `ch` limits and by `max-w-3xl` / `max-w-4xl` on
the measured groups.

**Gutters** step `1.75rem → 2.5rem (≥640px) → 3.5rem (≥1024px)`. **Band depth**
steps `4rem → 6rem (≥1024px)`, and the closing band one notch deeper
(`5rem → 7rem`). **Row rhythm** inside ledgers and lists is `0.875rem` to
`1.5rem` vertical, with a hairline under each row.

Breakpoints are Tailwind's defaults as actually used: `sm` 640px, `md` 768px,
`lg` 1024px. `lg` is the only structural one; `sm` and `md` adjust column counts
and gutters.

`scroll-padding-top: 5rem` on `.lp` clears the sticky phone header for in-page
anchors.

### Named Rules

**The Material Follows the Subject Rule.** A band takes paper when its subject
is the scan side or the printed specimen; it takes ink when its subject is the
code's owner. The page alternates by meaning, never for visual relief, and it
closes on ink so it arrives somewhere.

## Elevation & Depth

This system is flat. No surface has a resting shadow, there is no elevation
scale, and there is no glass, blur-panel or gradient anywhere. Depth is carried
three ways: by **material** (paper against ink is the only real layer change),
by **hairline rules** at `{colors.paper-rule}` and `{colors.field-rule}`, and by
**tonal recession** within each material (`field-ink → field-soft →
field-muted`, `paper-ink → paper-soft`).

Two exceptions, both small and both literal rather than decorative: the four
specimen pins carry a 3px contact shadow so they read as sitting on top of the
paper, and the mobile header uses `backdrop-blur-sm` over a 92%-opaque field so
scrolled content does not collide with it.

### Shadow Vocabulary

- **Pin contact** (`box-shadow: 0 1px 3px rgba(0,0,0,0.35)`): the four pins
  only. It exists to make a pin a physical object, not to lift a panel.

### Named Rules

**The Flat Field Rule.** Surfaces are flat at rest and flat on hover. If
something needs to separate from its neighbour, rule it or change its material.
No box-shadow is a legitimate way to build a container here.

## Shapes

Two radii and nothing between them. Interactive blocks — buttons, inputs, the
account action, the mobile header's link — take the incumbent `--radius`
(0.625rem / 10px), which is the one shape this layer inherited from the De Sign
Plus system. Pills (the LIVE badge, the state markers, the pins) are fully
round. The focus ring rounds at 2px. Everything else — panels, bands, figures,
ledger rows, the specimen itself — has **no radius at all**; its edge is either
the page edge, a hairline, or the material seam.

Borders are hairlines only (1px), never heavier. Row dividers run at 55% of the
rule colour so the section boundary stays visually dominant over the rows inside
it. The QR symbol carries its own 4-module quiet zone inside its viewBox and
draws with `shape-rendering: crispEdges`; its ground is transparent and its ink
is `--qr-ink`, so it inherits whatever material it is placed on.

## Components

### Buttons

- **Shape:** softly rounded rectangle (0.625rem). No shadow, no border on the
  filled variants.
- **Primary (on paper, the account action):** cyan ground, paper-ink text, set
  in Sarlotte at 1.5rem with an 11px uppercase sub-label right-aligned on the
  same baseline. Padding `1rem 1.25rem`. This is the only full-width action on
  the page.
- **Ink action (on field):** `{colors.field-ink}` ground, `{colors.field}` text,
  Sarlotte 1.25rem, padding `0.75rem 1.25rem`.
- **Paper action (the demo's "Point it"):** `{colors.paper-ink}` ground,
  `{colors.paper}` text, Sarlotte 1.125rem, padding `0.625rem 1rem`.
- **Quiet / secondary:** transparent ground, 1px `{colors.field-rule}` border,
  Raleway 14px; hover raises the border to `{colors.field-ink}` over 150ms.
- **Press:** `transform: scale(0.97)` on `:active`, 150ms on
  `cubic-bezier(0.23, 1, 0.32, 1)`. The full-width action uses 0.99 because it
  is wide. There is no hover transform on any button.
- **Focus:** the global ring — 2px solid `{colors.pin}`, 3px offset, 2px radius.

### Inputs / Fields

- **Style:** white ground on the paper panel, 1px `{colors.paper-rule}` border,
  0.625rem radius, 15px Raleway, placeholder in `{colors.paper-soft}`.
- **Focus:** border darkens to `{colors.paper-ink}` over 150ms, plus the global
  cyan ring.
- **Error:** the help line under the field is replaced in place by a
  `role="alert"` message in coral. The field itself does not change colour and
  the layout does not shift.
- **Help text:** 12px, `{colors.paper-soft}`, always present when there is no
  error, so the field is never bare.

### Ledger Rows (signature)

The system's replacement for the card. A row is a CSS grid
(`5.5rem 1fr` on phone, `7rem 1fr auto` from 640px) with a hairline beneath at
55% rule opacity and `0.875rem` vertical padding. Column one is an 11px
uppercase tabular timestamp in `{colors.field-muted}`; column two is the
destination in truncating monospace; column three is either the row's note in
12px or, for the live row, the LIVE pill. The live row's destination is the only
green text on screen.

### Definition Lists

The other card replacement. A column head is an 11px uppercase tracked label
over a full-strength hairline; each entry is a `dt` at 17px in the material's
ink colour and a `dd` at 14px in the muted tone, capped at 44–58ch, with a 55%
hairline between entries. On the contract list the pair goes side by side from
640px on an `18rem 1fr` grid.

### Specimen Panel

A paper block that is sticky and full-height from 1024px. Top line: the dark
wordmark vector at 150px left, an 11px uppercase caption right ("Specimen · 7 characters · base-58").
Centre: the real QR symbol at up to 312px with four 12px cyan pins inset 8px
past its corners, the caption "This symbol never changes again" in 11px
uppercase, and the code URL in monospace beneath. Below a hairline: the
destination field, then the account action. The symbol is rendered on the server
and is structurally unreachable from the client component around it — nothing in
the interaction can key, transform or re-render it.

### Wordmark

Not a type treatment. The mark ships as two supplied vectors with transparent
grounds and an intrinsic ratio of **778:320**, and the component computes height
from width so the ratio cannot drift:

- `/brand/qriate-wordmark.svg` — dark letterforms, for light grounds. The
  specimen panel (150px) and the social card (230px).
- `/brand/qriate-wordmark-light.svg` — derived from the first by taking every
  near-neutral fill (chroma < 25) to `#FBFAF6` while every chromatic fill is
  preserved untouched. The sticky phone header (112px) and the footer (104px at
  85% opacity).

The mark reads "QRiate" with a long swash off the Q, a cyan four-square QR motif
as the tittle of the i, the raised plus in green, an amber swash above the R and
a coral swash below the Q — the same four accents the page uses denotatively,
which is where they come from. Alt text is always `PRODUCT_NAME`.

### Figure + Caption

A specimen figure pairs the real symbol at 132px with its module count set in
Sarlotte at 2.6rem tabular (`25×25`) and the word "modules" in 11px uppercase
beneath. The `figcaption` sits under a hairline: label, then the URL in
monospace, then the encoded character count. Figures are evidence; they are
never cropped, filtered or placed on a tinted ground.

### State Markers

A 4px-tall fully-round bar, 40px wide on desktop (32px inline on phone), in the
paper-safe accent for the state: amber for Paused, coral for Blocked, cyan for
Not available. Always `aria-hidden`; the state is named in text beside it.

### The Pointing Interaction (signature)

Submitting a destination retires the current live row to "Earlier" and writes a
new row labelled "Just now". Only the new row animates: `lp-rise` — 620ms,
`cubic-bezier(0.23, 1, 0.32, 1)`, from `opacity: 0, translateY(10px)` to the
element's own already-visible default. On load the initial rows use the same
animation with a 55ms stagger per row. The entire rule lives inside
`@media (prefers-reduced-motion: no-preference)`, so under reduced motion the
rows simply exist — nothing fades, nothing travels, nothing is hidden waiting
for an animation that will not run.

### Status / Auth Shells (incumbent, unchanged by this layer)

Centred single column, `max-w-md` for status and `max-w-sm` for auth, vertically
centred in the viewport. A 6px-tall rounded accent bar in a `dsp-*` colour leads
the status page, then a Sarlotte 1.875rem heading, body in
`{colors.muted-foreground}`, and a `{colors.border}` hairline above the footer.
Fields are `{colors.card}` on a `{colors.border}` hairline at 0.625rem radius;
the primary button is `{colors.foreground}` ground with `{colors.background}`
text. These pages follow `prefers-color-scheme` and must keep doing so.

## Do's and Don'ts

### Do:

- **Do** scope every new landing-family token and class under `.lp`, and leave
  the `:root` / `prefers-color-scheme` layer alone — status, auth and account
  pages depend on it inverting.
- **Do** use the `-ink` accent variants on paper and the base accents on the ink
  field.
- **Do** reserve green for the single live destination, its LIVE pill, and the
  wordmark's raised plus.
- **Do** build containers from hairlines and material changes: ruled rows,
  definition lists, ruled figure captions.
- **Do** set every comparable number with `.lp-num` and every destination in
  monospace.
- **Do** keep each text block under a declared `ch` maximum (40–46ch for ledes,
  52–58ch for body).
- **Do** animate from an already-visible default, and wrap any new animation in
  `@media (prefers-reduced-motion: no-preference)` as `lp-rise` does.
- **Do** render QR symbols from the real generator at error-correction Q with
  their 4-module quiet zone, using `--qr-ground` / `--qr-ink` so they inherit
  their material.
- **Do** place the wordmark as one of the two supplied vectors — the dark file
  on light grounds, the light file on the ink field — sized by width only, with
  `PRODUCT_NAME` from `src/lib/brand.ts` as its alt text.
- **Do** keep `PRODUCT_NAME` the authority for every **plain-text** form of the
  name: titles, metadata, email, alt text, anywhere a glyph has to survive being
  copied or read aloud. It is no longer the source of the mark itself.
- **Do** derive a second-ground brand asset by splitting its fills — neutrals
  re-stated, chromatics preserved — and shipping it as its own file.

### Don't:

- **Don't** put a card on the landing surface. A three-card feature row was
  built here and removed; rows and ruled lists do that job.
- **Don't** add a box-shadow to build a container, a hover lift, or a
  resting elevation. The only shadow in the system is the 3px pin contact.
- **Don't** use gradients, glass, blur panels (outside the mobile header's
  scroll scrim) or decorative tints.
- **Don't** make the `.lp` layer respond to `prefers-color-scheme`.
- **Don't** produce a light-ground brand asset with `filter: invert()`,
  `brightness()` or a blend mode, and don't re-set the wordmark as type. Both
  destroy the mark's accents.
- **Don't** let an accent appear outside its denotation: amber only on pending,
  coral only on struck/blocked and form errors, cyan only on what can be moved.
- **Don't** draw a fake or decorative QR symbol anywhere. Every symbol shown is
  genuinely encoded and scans.
- **Don't** give the specimen symbol a key, a transform, or any render path
  reachable from the interaction. Its immobility is the product claim.
- **Don't** set body copy in Sarlotte or headings in Raleway, and don't
  substitute a system display face for Sarlotte.
- **Don't** invent prices, client names, logos, testimonials or counts to fill a
  layout. If a figure is undecided it renders as an em dash or as a sentence
  saying so.
