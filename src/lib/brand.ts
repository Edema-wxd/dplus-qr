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
