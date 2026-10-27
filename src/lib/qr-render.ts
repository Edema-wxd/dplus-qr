import QRCode from "qrcode";
import type { QrStyle } from "@/lib/qr-style";
import { artworkSvg, inksFor, qrArtwork, type QrMatrix } from "@/lib/qr-artwork";

export { LOGO_FRACTION, QUIET_ZONE, logoBox, type QrMatrix } from "@/lib/qr-artwork";

/**
 * Encoding a code's content into a module matrix, and the downloadable SVG.
 *
 * The drawing itself is `qr-artwork.ts`, which the dashboard specimens and the
 * live design preview use too, so the grid an owner sees is the grid they
 * print: same content, same error-correction level, same shapes, same logo
 * box.
 *
 * Without a logo, codes stay at level Q. With one, they move to H, which can
 * rebuild about 30% of the symbol, and the logo covers at most
 * `LOGO_FRACTION` of the width, roughly 5% of the area, so the margin for
 * dirt, creases and glare is still most of what H buys.
 *
 * The encoded content is always the code URL. A logo, a pattern or a colour
 * changes the artwork and never where a scan goes.
 */

export type QrLevel = "Q" | "H";

export function levelFor(hasLogo: boolean): QrLevel {
  return hasLogo ? "H" : "Q";
}

export function qrMatrix(content: string, level: QrLevel): QrMatrix {
  const qr = QRCode.create(content, { errorCorrectionLevel: level });
  const n = qr.modules.size;
  let bits = "";
  for (let i = 0; i < n * n; i += 1) bits += qr.modules.data[i] ? "1" : "0";
  return { size: n, bits };
}

/**
 * The full artwork as an SVG document, in the code's saved style.
 *
 * `logoHref` is whatever an `<image>` can load. Downloads pass a data URI so
 * the file stands alone once it leaves the dashboard.
 */
export function renderQrSvg(options: {
  content: string;
  style: QrStyle;
  /** Output width and height in pixels. */
  px: number;
  logoHref?: string;
}): string {
  const hasLogo = Boolean(options.logoHref);
  const matrix = qrMatrix(options.content, levelFor(hasLogo));
  const art = qrArtwork(matrix, options.style, inksFor(options.style), hasLogo);
  return artworkSvg(art, options.px, options.logoHref);
}
