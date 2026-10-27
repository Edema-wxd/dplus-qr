import QRCode from "qrcode";
import { qrMatrix, type QrLevel, type QrMatrix } from "@/lib/qr-render";
import { inksFor, qrArtwork, type ArtworkInks } from "@/lib/qr-artwork";
import { DEFAULT_QR_STYLE, type QrStyle } from "@/lib/qr-style";
import { QrArtworkSvg } from "@/components/QrArtworkSvg";
import type { PresetLogoId } from "@/lib/preset-logos";

/**
 * Generated matrices, kept by the string they encode and the level.
 *
 * A matrix is a pure function of its content and error-correction level, so
 * this can never go stale: a given URL has exactly one grid, for as long as
 * the process lives. What it saves is real: the code list renders one symbol
 * per row on a per-request page, and an account at the top tier's limit would
 * otherwise run a hundred encodes before the page could stream.
 *
 * Bounded, and the bound is the point: this is a module-scope map in a
 * long-lived server process, which is a memory leak unless something stops it
 * growing. Oldest-first eviction, because `Map` iterates in insertion order
 * and the useful entries on any one page are the ones just inserted.
 */
const CACHE_LIMIT = 512;
const cache = new Map<string, QrMatrix>();

export function cachedMatrix(value: string, level: QrLevel): QrMatrix {
  const key = `${level}:${value}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = qrMatrix(value, level);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, built);
  return built;
}

/**
 * Painted with the page's own CSS variables when no style is given, so the
 * landing page's symbols follow its theme and dark mode.
 */
const THEME_INKS: ArtworkInks = {
  dots: "var(--qr-ink)",
  frame: "var(--qr-ink)",
  eye: "var(--qr-ink)",
  ground: "var(--qr-ground)",
};

/**
 * A real QR symbol, drawn by the same code that draws the downloadable
 * artwork.
 *
 * Deliberately not an image and not a decorative approximation: the page's
 * whole argument is that this exact grid is what gets printed, so drawing a
 * fake one would be the one lie the surface cannot afford. Error correction is
 * Q, the level a printed code without a logo wants, and the level every
 * module-count figure on the page is quoted at.
 *
 * On the landing page this runs at build time: that page reads no request API,
 * so Next evaluates it once and ships the markup. The dashboard is the other
 * case: those pages set `instant = false`, so every symbol in a code list is
 * generated per request, one per row. Hence the cache above. Either way
 * nothing here is on a scanner's critical path.
 *
 * With `style`, the symbol is drawn in the code's saved pattern and colours.
 * With `logoUrl`, it is drawn at level H with the logo in the box `logoBox`
 * gives, exactly as the download route draws it.
 */
export function QrSymbol({
  value,
  px,
  className,
  title,
  logoUrl,
  presetLogo,
  style,
}: {
  value: string;
  px: number;
  className?: string;
  title?: string;
  logoUrl?: string | null;
  presetLogo?: PresetLogoId | null;
  style?: QrStyle;
}) {
  // The symbol alone, never its frame: these are list thumbnails and page
  // specimens, where a frame's text would be too small to mean anything.
  const logo = presetLogo ?? Boolean(logoUrl);
  const matrix = cachedMatrix(value, logo ? "H" : "Q");
  const art = qrArtwork(matrix, style ?? DEFAULT_QR_STYLE, style ? inksFor(style) : THEME_INKS, logo);
  return (
    <QrArtworkSvg
      art={art}
      px={px}
      title={title ?? `QR code for ${value}`}
      logoUrl={logoUrl}
      className={className}
    />
  );
}

/** The module count for a value at the level the page quotes. */
export function moduleCount(value: string): number {
  return QRCode.create(value, { errorCorrectionLevel: "Q" }).modules.size;
}
