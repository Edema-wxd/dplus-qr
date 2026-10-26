import { z } from "zod";

/**
 * The colours a code's artwork is drawn in, as stored in `qr_codes.style`.
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
export type QrStyle = {
  /** The modules. */
  dark: string;
  /** The ground, including the quiet zone. */
  light: string;
};

/** What a code is drawn in until its owner says otherwise. */
export const DEFAULT_QR_STYLE: QrStyle = { dark: "#1A1A1A", light: "#FFFFFF" };

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

export const qrStyleSchema = z.object({ dark: hex, light: hex });

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
  if (luminance(style.dark) >= luminance(style.light)) {
    return {
      ok: false,
      reason:
        "The code colour must be darker than the background. Many scanners cannot read a light code on a dark ground.",
    };
  }
  const ratio = contrastRatio(style.dark, style.light);
  if (ratio < MIN_QR_CONTRAST) {
    return {
      ok: false,
      reason: `Those two colours are too close to scan reliably once printed (contrast ${ratio.toFixed(1)}:1, minimum ${MIN_QR_CONTRAST}:1). Darken the code colour or lighten the background.`,
    };
  }
  return { ok: true };
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
  const parsed = qrStyleSchema.safeParse({ dark: source.dark, light: source.light });
  if (!parsed.success || !checkQrStyle(parsed.data).ok) return DEFAULT_QR_STYLE;
  return parsed.data;
}

/** True when a style is the default, so the UI can offer no reset. */
export function isDefaultQrStyle(style: QrStyle): boolean {
  return (
    style.dark === DEFAULT_QR_STYLE.dark && style.light === DEFAULT_QR_STYLE.light
  );
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
