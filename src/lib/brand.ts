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

/**
 * Two mail domains, and the difference decides whether a reply is lost.
 *
 * `SENDING_DOMAIN` is the subdomain verified in Resend. It is send-only: it
 * publishes SPF/DKIM but no MX, so a message addressed to anything there is
 * rejected and the sender never learns why. Only ever a `From`.
 *
 * `INBOX_DOMAIN` is the apex, whose MX points at the real mailbox provider.
 * Anything a human is invited to write to -- a `Reply-To`, a `mailto:` in the
 * UI, the recipient of an internal alert -- has to live here.
 */
export const SENDING_DOMAIN = "mail.qriateplus.com";
export const INBOX_DOMAIN = "qriateplus.com";

/**
 * Where a user's reply or complaint actually lands, and where `notifyAdmin`
 * delivers. Kept on the apex for the reason above.
 *
 * This is the one mailbox confirmed to exist -- the Resend account is
 * registered to it. Once `support@`, `plans@` and `onboarding@` exist on
 * INBOX_DOMAIN, point `MAIL_GROUPS[...].replyTo` in `email.ts` at them; the
 * senders are already grouped that way.
 */
export const SUPPORT_EMAIL = `hello@${INBOX_DOMAIN}`;

/** Canonical host for printed codes. Never changes once anything is printed. */
export const CODE_HOST = "qriateplus.com";

/** Origin form, for canonical links, sitemaps and encoded QR content. */
export const CODE_ORIGIN = `https://${CODE_HOST}`;

/**
 * The URL a printed symbol encodes. **The one function that decides it.**
 *
 * Built from `CODE_ORIGIN` and never from `QR_BASE_URL`, which is a different
 * thing wearing a similar name: that variable is the *deployment's* own origin,
 * used for links back into the app (the billing page, the Paystack callback),
 * and it legitimately differs per environment -- a preview URL, or a LAN
 * address during a local demo. The host inside a symbol cannot differ per
 * environment, because the symbol gets printed. Deriving artwork from
 * `QR_BASE_URL` would let a demo deploy hand out codes encoding `192.168.x.x`.
 *
 * The dashboard's on-screen symbol, the caption that quotes it and the
 * downloadable SVG/PNG all come through here, so they cannot disagree.
 */
export function codeUrl(shortCode: string): string {
  return `${CODE_ORIGIN}/${shortCode}`;
}

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
 * The date the current legal pages took effect, shown at the top of each one.
 *
 * Changed by hand when a document changes materially, which is also when the
 * Terms require us to email customers 14 days ahead -- so moving this date is
 * deliberately a decision rather than a side effect of a deploy.
 */
export const LEGAL_EFFECTIVE = "25 October 2026";

/**
 * How long a closed or lapsed account's codes and scan data are kept before
 * deletion.
 *
 * Settled at 6 months (Francis, 25 October 2026), replacing the 12 months
 * DECISIONS.md had proposed. Long enough that printed material survives a
 * missed renewal and a late payment restores everything; short enough to state
 * as a real limit under the NDPA. Stated in the Terms and the Privacy Policy,
 * so the sweep that eventually enforces it must read this constant.
 */
export const LAPSE_RETENTION_MONTHS = 6;

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
