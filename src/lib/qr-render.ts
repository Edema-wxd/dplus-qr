import QRCode from "qrcode";
import type { QrStyle } from "@/lib/qr-style";
import { artworkSvg, composeArtwork, inksFor, qrArtwork, type QrMatrix } from "@/lib/qr-draw";
import type { PresetLogoId } from "@/lib/preset-logos";

export { LOGO_FRACTION, QUIET_ZONE, logoBox, type QrMatrix } from "@/lib/qr-draw";

/**
 * Encoding a code's content into modules, and the artwork as an SVG.
 *
 * The drawing itself is `qr-draw.ts`, which the dashboard specimens and the
 * live design preview use too, so the grid an owner sees is the grid they
 * print: same content, same error-correction level, same shapes, same logo
 * box. Downloads reach this through `renderArtwork` (`qr-artwork.ts`).
 *
 * Without a logo, codes stay at level Q. With one, they move to H, which can
 * rebuild about 30% of the symbol, and the logo covers at most
 * `LOGO_FRACTION` of the width, roughly 5% of the area, so the margin for
 * dirt, creases and glare is still most of what H buys.
 *
 * The encoded content is always the code URL. A logo, a pattern or a colour
 * changes the artwork and never where a scan goes.
 */

/**
 * "M" is for static codes only, which carry their whole content in the
 * symbol and so stay one level lower without a logo; see `static-artwork.ts`.
 */
export type QrLevel = "M" | "Q" | "H";

export function levelFor(hasLogo: boolean): "Q" | "H" {
  return hasLogo ? "H" : "Q";
}

export type Geometry = {
  /** One path covering every dark module, in module units. */
  path: string;
  /** Modules per side, quiet zone excluded. */
  size: number;
  /** One byte per module, row by row, non-zero for dark. */
  modules: Uint8Array;
};

/** The plain module grid, for the static code painter in the browser. */
export function qrGeometry(content: string, level: QrLevel): Geometry {
  const qr = QRCode.create(content, { errorCorrectionLevel: level });
  const n = qr.modules.size;
  const data = qr.modules.data;

  let path = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (data[y * n + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { path, size: n, modules: data };
}

/**
 * The modules as a plain string, which crosses from a server component to the
 * live preview as a prop. The browser never runs a QR encoder.
 */
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
 * the file stands alone once it leaves the dashboard: a print shop opening it
 * offline still gets the logo.
 */
export function renderQrSvg(options: {
  content: string;
  style: QrStyle;
  /** Output width in pixels; a frame can make it taller than wide. */
  px: number;
  logoHref?: string;
  /** A preset mark for the middle, which takes precedence over `logoHref`. */
  presetLogo?: PresetLogoId | null;
  /** Overrides `levelFor`. Static codes pass their own; see `static-artwork.ts`. */
  level?: QrLevel;
}): string {
  const logo = options.presetLogo ?? Boolean(options.logoHref);
  const matrix = qrMatrix(options.content, options.level ?? levelFor(Boolean(logo)));
  const art = qrArtwork(matrix, options.style, inksFor(options.style), logo);
  return artworkSvg(
    composeArtwork(art, options.style),
    options.px,
    options.presetLogo ? undefined : options.logoHref
  );
}
