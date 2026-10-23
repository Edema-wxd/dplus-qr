/**
 * Brand strings in one place, so naming is a one-line change rather than a
 * copy hunt.
 *
 * The wordmark is "QRiate" with a raised plus: QR capitalised, the rest
 * lowercase. PRODUCT_NAME is the plain-text form for titles, emails and
 * anywhere a glyph has to survive being copied or read aloud.
 */
export const PRODUCT_NAME = "QRiate+";

/** For running text where the plus would read as punctuation. */
export const PRODUCT_NAME_SPOKEN = "QRiate Plus";

/** The parent business. QRiate+ is a De Sign Plus product. */
export const COMPANY_NAME = "De Sign Plus";
export const MAIN_SITE = "https://de-signplus.com";
export const SUPPORT_EMAIL = "hello@de-signplus.com";

/** Canonical host for printed codes. Never changes once anything is printed. */
export const CODE_HOST = "qriateplus.com";

/** Origin form, for canonical links, sitemaps and encoded QR content. */
export const CODE_ORIGIN = `https://${CODE_HOST}`;

/**
 * The retired subdomain, kept only so the landing page can state the
 * character-count difference that justified moving off it. Never a destination.
 */
export const RETIRED_HOST = "qr.de-signplus.com";

/**
 * The single price anchor the landing page is allowed to show.
 *
 * Confirmed by Francis, 23 October 2026: the cheapest plan starts at ₦4,000 a
 * month. Plan NAMES, code limits and the annual discount are still open (see
 * DECISIONS.md, "Still open"), which is why this is a single "from" anchor and
 * not a tier table — one number nothing else on the site contradicts.
 *
 * Digits only, no separators. Setting it back to `null` makes the landing page
 * fall through to "Pricing confirmed before launch" with no other edit.
 */
export const PRICE_FROM_NGN: number | null = 4000;

/** Formatted for display, or an em dash while the figure is undecided. */
export function priceFrom(): string {
  if (PRICE_FROM_NGN === null) return "\u2014";
  return PRICE_FROM_NGN.toLocaleString("en-NG");
}

/**
 * Wordmark palette, read from the logo. These match the De Sign Plus tokens
 * already in globals.css, which is why the product sits comfortably beside the
 * parent brand.
 */
export const BRAND_COLORS = {
  ink: "#1A1A1A",
  /** The four squares forming the QR motif. */
  cyan: "#5BC5E8",
  /** The raised plus. */
  green: "#7DC242",
  /** Swash above the R. */
  amber: "#F5B335",
  /** Swash below the Q. */
  coral: "#F1595C",
} as const;
