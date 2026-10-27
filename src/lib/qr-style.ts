import { z } from "zod";

/**
 * How a code's artwork is drawn, as stored in `qr_codes.style`: colours, the
 * shape of its dots, and the shape and colour of its three corner squares.
 *
 * Pure on purpose: the download route, the dashboard specimen and the client
 * form that previews a change all import this, and the client form runs the
 * same contrast check the server enforces, so the two cannot disagree about
 * which pair is allowed.
 *
 * Styling changes the image and nothing else. The encoded content is always
 * the code URL, so no style can affect where a scan goes, and nothing here is
 * ever on the redirect path.
 */
/** The shape of each data module. */
export const QR_PATTERNS = ["square", "dots", "rounded", "extra-rounded", "classy", "classy-rounded"] as const;
export type QrPattern = (typeof QR_PATTERNS)[number];

/**
 * The outer ring of each corner (finder) square. `auto` follows the pattern,
 * so picking a pattern alone gives corners that match it.
 */
export const CORNER_FRAMES = ["auto", "square", "rounded", "circle"] as const;
export type CornerFrame = (typeof CORNER_FRAMES)[number];

/** The solid centre of each corner square. `auto` follows the pattern. */
export const CORNER_DOTS = ["auto", "square", "dot"] as const;
export type CornerDot = (typeof CORNER_DOTS)[number];

export type QrStyle = {
  /** The data modules. */
  dark: string;
  /** The ground, including the quiet zone. Also the colour contrast is judged against. */
  light: string;
  pattern: QrPattern;
  cornerFrame: CornerFrame;
  cornerDot: CornerDot;
  /** The corner rings; null draws them in `dark`. */
  cornerFrameColor: string | null;
  /** The corner centres; null draws them in `dark`. */
  cornerDotColor: string | null;
  /**
   * Leave the ground out of downloads, for artwork laid over a design. The
   * contrast check still judges against `light`, which is then the surface
   * the owner promises to print on; the form says so.
   */
  transparent: boolean;
};

/** What a code is drawn in until its owner says otherwise. */
export const DEFAULT_QR_STYLE: QrStyle = {
  dark: "#1A1A1A",
  light: "#FFFFFF",
  pattern: "square",
  cornerFrame: "auto",
  cornerDot: "auto",
  cornerFrameColor: null,
  cornerDotColor: null,
  transparent: false,
};

/**
 * The lowest contrast ratio a saved pair may have.
 *
 * A printed code meets bad light, glossy stock and old phone cameras, none of
 * which the owner sees when choosing colours on a bright screen. 4.5:1 is the
 * WCAG figure for body text, and well clear of the point where scanners start
 * failing; a brand colour that cannot reach it on white is better used for the
 * frame around a code than for the code itself.
 */
export const MIN_QR_CONTRAST = 4.5;

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour, like #1A1A1A.")
  .transform((value) => value.toUpperCase());

/**
 * A style as posted or stored. Every key past the two colours is optional and
 * defaults, so a row saved before patterns existed, which holds only `dark`
 * and `light`, reads as exactly the artwork it always drew.
 */
export const qrStyleSchema = z.object({
  dark: hex,
  light: hex,
  pattern: z.enum(QR_PATTERNS).default("square"),
  cornerFrame: z.enum(CORNER_FRAMES).default("auto"),
  cornerDot: z.enum(CORNER_DOTS).default("auto"),
  cornerFrameColor: hex.nullable().default(null),
  cornerDotColor: hex.nullable().default(null),
  transparent: z.boolean().default(false),
});

/** WCAG relative luminance of a `#RRGGBB` colour. */
function luminance(colour: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(colour.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio between two `#RRGGBB` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type StyleCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a pair will scan once printed.
 *
 * Dark-on-light is required, not just contrast. An inverted code (light
 * modules on a dark ground) has the same ratio, but a share of scanner apps,
 * older Android ones especially, only look for dark finder patterns and never
 * read it at all.
 */
export function checkQrStyle(style: QrStyle): StyleCheck {
  // Every colour a scanner has to tell from the ground is held to the same
  // rule. The corner squares matter most of all: they are how a scanner
  // finds the code in the first place.
  const inks: { colour: string; name: string }[] = [
    { colour: style.dark, name: "The code colour" },
    ...(style.cornerFrameColor ? [{ colour: style.cornerFrameColor, name: "The corner frame colour" }] : []),
    ...(style.cornerDotColor ? [{ colour: style.cornerDotColor, name: "The corner dot colour" }] : []),
  ];
  for (const ink of inks) {
    if (luminance(ink.colour) >= luminance(style.light)) {
      return {
        ok: false,
        reason: `${ink.name} must be darker than the background. Many scanners cannot read a light code on a dark ground.`,
      };
    }
    const ratio = contrastRatio(ink.colour, style.light);
    if (ratio < MIN_QR_CONTRAST) {
      return {
        ok: false,
        reason: `${ink.name} is too close to the background to scan reliably once printed (contrast ${ratio.toFixed(1)}:1, minimum ${MIN_QR_CONTRAST}:1). Darken it or lighten the background.`,
      };
    }
  }
  return { ok: true };
}

/** The weakest contrast among the style's inks, for the form to quote. */
export function weakestContrast(style: QrStyle): number {
  return Math.min(
    ...[style.dark, style.cornerFrameColor, style.cornerDotColor]
      .filter((colour): colour is string => colour !== null)
      .map((colour) => contrastRatio(colour, style.light))
  );
}

/**
 * Read a stored `style` value into colours that are safe to draw.
 *
 * Tolerant by design. The column is `jsonb` with a `{}` default, so most rows
 * hold nothing, and a row written before this check existed (or edited by
 * hand) could hold anything. Whatever is there, the result is a pair that
 * passes `checkQrStyle`: a bad row yields the default artwork, never an
 * unscannable download.
 */
export function readQrStyle(stored: unknown): QrStyle {
  const source =
    stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const colours = qrStyleSchema.safeParse({ dark: source.dark, light: source.light });
  if (!colours.success || !checkQrStyle(colours.data).ok) return DEFAULT_QR_STYLE;

  // The colours stand; each further key is kept only if it is valid on its
  // own and the whole still scans. A bad corner colour costs the corner
  // colour, not the owner's chosen code colour.
  let style: QrStyle = colours.data;
  for (const key of ["pattern", "cornerFrame", "cornerDot", "cornerFrameColor", "cornerDotColor", "transparent"] as const) {
    if (!(key in source)) continue;
    const next = qrStyleSchema.safeParse({ ...style, [key]: source[key] });
    if (next.success && checkQrStyle(next.data).ok) style = next.data;
  }
  return style;
}

/** True when a style is the default, so the UI can offer no reset. */
export function isDefaultQrStyle(style: QrStyle): boolean {
  return sameQrStyle(style, DEFAULT_QR_STYLE);
}

export function sameQrStyle(a: QrStyle, b: QrStyle): boolean {
  return (Object.keys(DEFAULT_QR_STYLE) as (keyof QrStyle)[]).every((key) => a[key] === b[key]);
}

/**
 * The CSS custom properties `QrSymbol` paints with, for a given style.
 *
 * The symbol fills its modules with `var(--qr-ink)` and its ground with
 * `var(--qr-ground)`, so setting these on any wrapper recolours every symbol
 * inside it without the symbol knowing about styles at all. That keeps the
 * landing page's symbol untouched and lets a client wrapper preview a change
 * on a symbol that was rendered on the server.
 */
export function qrStyleVars(
  style: QrStyle
): Record<"--qr-ink" | "--qr-ground" | "--qr-ground-solid", string> {
  // `--qr-ground-solid` is what a logo box paints with. It is separate because
  // the dashboard's default `--qr-ground` is transparent, and a transparent
  // box would leave the modules under the logo showing through it.
  return {
    "--qr-ink": style.dark,
    "--qr-ground": style.light,
    "--qr-ground-solid": style.light,
  };
}

/**
 * The colours a hosted page's primary buttons take from its code, or null to
 * keep the site's own.
 *
 * The fill is the code's dark colour. The text on it is white or black,
 * whichever contrasts more, so a button stays legible whatever the owner
 * picked. A code on the default style returns null rather than its near-black,
 * because the site's own foreground also flips for dark mode and a fixed
 * near-black would not.
 */
export function pageBrand(style: QrStyle): { fill: string; ink: string } | null {
  if (isDefaultQrStyle(style)) return null;
  const ink =
    contrastRatio(style.dark, "#FFFFFF") >= contrastRatio(style.dark, "#000000")
      ? "#FFFFFF"
      : "#000000";
  return { fill: style.dark, ink };
}
