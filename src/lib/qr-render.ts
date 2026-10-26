import QRCode from "qrcode";
import type { QrStyle } from "@/lib/qr-style";

/**
 * Drawing a code's symbol, with or without a logo in the middle.
 *
 * Shared by the dashboard specimen and the download route, so the grid an
 * owner sees is the grid they print: same content, same error-correction
 * level, same logo box.
 *
 * Without a logo, codes stay at level Q. With one, they move to H, which can
 * rebuild about 30% of the symbol, and the logo covers at most
 * `LOGO_FRACTION` of the width -- roughly 5% of the area -- so the margin for
 * dirt, creases and glare is still most of what H buys.
 *
 * The encoded content is always the code URL. A logo, like a colour, changes
 * the artwork and never where a scan goes.
 */

export type QrLevel = "Q" | "H";

/** Width of the logo box, quiet zone excluded, as a share of the symbol. */
export const LOGO_FRACTION = 0.22;

/** Modules of clear ground around the symbol. Part of the code, not padding. */
export const QUIET_ZONE = 4;

export function levelFor(hasLogo: boolean): QrLevel {
  return hasLogo ? "H" : "Q";
}

export type Geometry = {
  /** One path covering every dark module, in module units. */
  path: string;
  /** Modules per side, quiet zone excluded. */
  size: number;
};

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
  return { path, size: n };
}

/**
 * The square the logo sits in, in module units, quiet zone excluded.
 *
 * Snapped to whole modules and centred exactly: the side takes the parity of
 * the symbol's size, so the box starts on a module edge rather than cutting a
 * module in half and leaving a sliver that reads as noise.
 *
 * It also never reaches module 8 from any edge. The finder patterns and their
 * separators take modules 0 to 7, and row and column 8 beside them carry the
 * format information, which error correction does not protect: covering it
 * can make a code unreadable however much H recovers elsewhere. Only the
 * smallest symbol sizes come near; a code URL is never one of them.
 */
export function logoBox(size: number): { offset: number; side: number } {
  let side = Math.round(size * LOGO_FRACTION);
  if ((size - side) % 2 !== 0) side += 1;
  while ((size - side) / 2 < 9 && side > 2) side -= 2;
  return { offset: (size - side) / 2, side };
}

/**
 * The full artwork as an SVG document.
 *
 * `logoHref` is whatever an `<image>` can load. Downloads pass a data URI so
 * the file stands alone once it leaves the dashboard: a print shop opening it
 * offline still gets the logo.
 */
export function renderQrSvg(options: {
  content: string;
  style: QrStyle;
  /** Output width and height in pixels. */
  px: number;
  logoHref?: string;
}): string {
  const level = levelFor(Boolean(options.logoHref));
  const { path, size } = qrGeometry(options.content, level);
  const span = size + QUIET_ZONE * 2;
  const { dark, light } = options.style;

  let logo = "";
  if (options.logoHref) {
    const box = logoBox(size);
    const at = box.offset + QUIET_ZONE;
    // One module of clear ground between the logo and the nearest module, so
    // the edge of the logo is never mistaken for part of the pattern.
    logo =
      `<rect x="${at}" y="${at}" width="${box.side}" height="${box.side}" fill="${light}"/>` +
      `<image x="${at + 1}" y="${at + 1}" width="${box.side - 2}" height="${box.side - 2}"` +
      ` preserveAspectRatio="xMidYMid meet" href="${escapeAttribute(options.logoHref)}"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${span} ${span}"` +
    ` width="${options.px}" height="${options.px}" shape-rendering="crispEdges">` +
    `<rect width="${span}" height="${span}" fill="${light}"/>` +
    `<path transform="translate(${QUIET_ZONE} ${QUIET_ZONE})" d="${path}" fill="${dark}"/>` +
    logo +
    `</svg>`
  );
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
