import type { CornerFrame, QrPattern, QrStyle } from "@/lib/qr-style";
import { presetLogo, type PresetLogoId } from "@/lib/preset-logos";
import { frameLayout, type FrameLayout } from "@/lib/frames";

/**
 * Drawing a symbol's modules in a chosen pattern, from a module matrix.
 *
 * Pure and encoder-free, so the server's downloads, the server-rendered
 * specimens and the live preview in the browser all draw with this one
 * function from the same matrix: what the owner previews is what they print.
 * The browser never runs a QR encoder; the server sends the matrix.
 *
 * Everything is in module units. The three corner (finder) squares are drawn
 * as shapes of their own, the rest module by module, and modules under a logo
 * are left out rather than painted over, so a transparent ground stays
 * transparent behind the logo too.
 *
 * Every pattern, corner and logo combination is read back by a real decoder
 * in `qr-render.test.ts`. A shape that stops scanning fails the build.
 */

/** Modules of clear ground around the symbol. Part of the code, not padding. */
export const QUIET_ZONE = 4;

/** Width of the logo box, quiet zone excluded, as a share of the symbol. */
export const LOGO_FRACTION = 0.22;

/**
 * A symbol's modules: `size` per side, and `bits` as one '0'/'1' character
 * per module, row by row. A string so it crosses from server to client as a
 * plain prop.
 */
export type QrMatrix = { size: number; bits: string };

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

/** The colours to paint with. CSS values, so a caller may pass `var(--x)`. */
export type ArtworkInks = { dots: string; frame: string; eye: string; ground: string | null };

export function inksFor(style: QrStyle): ArtworkInks {
  return {
    dots: style.dark,
    frame: style.cornerFrameColor ?? style.dark,
    eye: style.cornerDotColor ?? style.dark,
    ground: style.transparent ? null : style.light,
  };
}

export type ArtworkShape = Pick<QrStyle, "pattern" | "cornerFrame" | "cornerDot">;

export type Artwork = {
  /** Side of the whole image, quiet zone included. */
  span: number;
  ground: string | null;
  /** Painted in order. `evenodd` paths are rings. */
  layers: { d: string; fill: string; evenOdd?: boolean }[];
  /**
   * Where a logo goes, in the same units, when there is one. A preset mark
   * carries its own drawing; an uploaded logo is an image the caller supplies.
   */
  logo: { x: number; y: number; side: number; preset: { hex: string; path: string; label: string } | null } | null;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Which shape a corner ring takes, with `auto` resolved from the pattern. */
export function frameShape(shape: ArtworkShape): Exclude<CornerFrame, "auto"> {
  if (shape.cornerFrame !== "auto") return shape.cornerFrame;
  return roundish(shape.pattern) ? "rounded" : "square";
}

/** Which shape a corner centre takes, with `auto` resolved from the pattern. */
export function eyeShape(shape: ArtworkShape): "square" | "rounded" | "dot" {
  if (shape.cornerDot !== "auto") return shape.cornerDot;
  return roundish(shape.pattern) ? "rounded" : "square";
}

function roundish(pattern: QrPattern): boolean {
  return pattern === "rounded" || pattern === "extra-rounded" || pattern === "classy-rounded";
}

/** A rectangle with each corner's radius given, clockwise from top left. */
function roundedRect(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: number[]): string {
  const arc = (rad: number, ex: number, ey: number) => (rad > 0 ? `A${rad} ${rad} 0 0 1 ${r3(ex)} ${r3(ey)}` : "");
  return (
    `M${r3(x + tl)} ${r3(y)}H${r3(x + w - tr)}${arc(tr, x + w, y + tr)}` +
    `V${r3(y + h - br)}${arc(br, x + w - br, y + h)}` +
    `H${r3(x + bl)}${arc(bl, x, y + h - bl)}` +
    `V${r3(y + tl)}${arc(tl, x + tl, y)}Z`
  );
}

function circle(cx: number, cy: number, rad: number): string {
  return `M${r3(cx - rad)} ${r3(cy)}a${rad} ${rad} 0 1 0 ${r3(rad * 2)} 0a${rad} ${rad} 0 1 0 ${r3(-rad * 2)} 0Z`;
}

/** Corner radii for one module, from which of its four sides touch another dark module. */
function moduleRadii(pattern: QrPattern, t: boolean, r: boolean, b: boolean, l: boolean): number[] {
  // A corner may round only where neither side meeting at it touches a
  // neighbour, so runs of modules stay solid bars and only their ends shape.
  const open = [!t && !l, !t && !r, !b && !r, !b && !l];
  const by = (radii: number[]) => radii.map((rad, i) => (open[i] ? rad : 0));
  switch (pattern) {
    case "rounded":
      return by([0.3, 0.3, 0.3, 0.3]);
    case "extra-rounded":
      return by([0.5, 0.5, 0.5, 0.5]);
    case "classy":
      return by([0.5, 0, 0.5, 0]);
    case "classy-rounded":
      return by([0.5, 0.25, 0.5, 0.25]);
    default:
      return [0, 0, 0, 0];
  }
}

/**
 * Straight edges that meet a neighbour are pushed into it by this much, so
 * two modules drawn as separate shapes leave no hairline seam once the
 * renderer anti-aliases their curves. Never applied where a corner rounds.
 */
const SEAM = 0.02;

/**
 * The whole symbol, ready to paint.
 *
 * `logo` reserves the logo box: `true` for an uploaded image, or a preset's
 * id to draw that mark. The matrix should then be the level-H one, which is
 * the caller's job, since only it knows what was encoded.
 */
export function qrArtwork(
  matrix: QrMatrix,
  shape: ArtworkShape,
  inks: ArtworkInks,
  logo: boolean | PresetLogoId = false
): Artwork {
  const n = matrix.size;
  const q = QUIET_ZONE;
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && matrix.bits.charCodeAt(y * n + x) === 49;

  const finders = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ];
  const inFinder = (x: number, y: number) => finders.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

  const box = logo ? logoBox(n) : null;
  const inLogo = (x: number, y: number) =>
    box !== null && x >= box.offset && x < box.offset + box.side && y >= box.offset && y < box.offset + box.side;

  // Modules not drawn as themselves: the finders have their own shapes, and
  // the logo box is cleared. Neighbours there count as absent, so the edge of
  // a cleared area shapes like any other edge.
  const counts = (x: number, y: number) => dark(x, y) && !inFinder(x, y) && !inLogo(x, y);

  let dots = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!counts(x, y)) continue;
      const px = x + q;
      const py = y + q;
      if (shape.pattern === "square") {
        dots += `M${px} ${py}h1v1h-1z`;
      } else if (shape.pattern === "dots") {
        // A full-width circle. Smaller dots looked airier but decoded less
        // reliably in testing, as more of each module's area went to ground.
        dots += circle(px + 0.5, py + 0.5, 0.5);
      } else {
        const t = counts(x, y - 1);
        const r = counts(x + 1, y);
        const b = counts(x, y + 1);
        const l = counts(x - 1, y);
        const x0 = px - (l ? SEAM : 0);
        const y0 = py - (t ? SEAM : 0);
        const x1 = px + 1 + (r ? SEAM : 0);
        const y1 = py + 1 + (b ? SEAM : 0);
        dots += roundedRect(x0, y0, x1 - x0, y1 - y0, moduleRadii(shape.pattern, t, r, b, l));
      }
    }
  }

  let frames = "";
  let eyes = "";
  const ring = frameShape(shape);
  const centre = eyeShape(shape);
  for (const [fx, fy] of finders) {
    const ox = fx + q;
    const oy = fy + q;
    if (ring === "circle") {
      frames += circle(ox + 3.5, oy + 3.5, 3.5) + circle(ox + 3.5, oy + 3.5, 2.5);
    } else if (ring === "rounded") {
      frames += roundedRect(ox, oy, 7, 7, [2, 2, 2, 2]) + roundedRect(ox + 1, oy + 1, 5, 5, [1, 1, 1, 1]);
    } else {
      frames += `M${ox} ${oy}h7v7h-7z` + `M${ox + 1} ${oy + 1}h5v5h-5z`;
    }
    if (centre === "dot") eyes += circle(ox + 3.5, oy + 3.5, 1.5);
    else if (centre === "rounded") eyes += roundedRect(ox + 2, oy + 2, 3, 3, [0.75, 0.75, 0.75, 0.75]);
    else eyes += `M${ox + 2} ${oy + 2}h3v3h-3z`;
  }

  return {
    span: n + q * 2,
    ground: inks.ground,
    layers: [
      { d: dots, fill: inks.dots },
      { d: frames, fill: inks.frame, evenOdd: true },
      { d: eyes, fill: inks.eye },
    ],
    // One module of clear ground between the logo and the nearest module, so
    // the edge of the logo is never mistaken for part of the pattern.
    logo: box
      ? {
          x: box.offset + q + 1,
          y: box.offset + q + 1,
          side: box.side - 2,
          preset: typeof logo === "string" ? presetLogo(logo) : null,
        }
      : null,
  };
}

/**
 * A symbol with its frame around it: the frame's own canvas, and where the
 * symbol sits on it. Without a frame the canvas is just the symbol.
 */
export type Composition = { art: Artwork; frame: FrameLayout };

export function composeArtwork(
  art: Artwork,
  style: Pick<QrStyle, "frame" | "frameText" | "frameColor" | "dark" | "light">
): Composition {
  const frame = frameLayout(style.frame, art.span, style.frameText, style.frameColor ?? style.dark, art.ground, style.light);
  return { art, frame };
}

/** A preset mark: the brand colour as a disc, the mark in white at its centre. */
function presetSvg(logo: NonNullable<Artwork["logo"]>): string {
  const preset = logo.preset!;
  const r = logo.side / 2;
  const mark = logo.side * 0.6;
  const at = (logo.side - mark) / 2;
  return (
    `<circle cx="${logo.x + r}" cy="${logo.y + r}" r="${r}" fill="${preset.hex}"/>` +
    `<svg x="${logo.x + at}" y="${logo.y + at}" width="${mark}" height="${mark}" viewBox="0 0 24 24">` +
    `<path d="${preset.path}" fill="#FFFFFF"/></svg>`
  );
}

const pathSvg = (layer: { d: string; fill: string; evenOdd?: boolean }) =>
  layer.d ? `<path d="${layer.d}" fill="${layer.fill}"${layer.evenOdd ? ' fill-rule="evenodd"' : ""}/>` : "";

/**
 * The artwork as an SVG document, `px` wide; a frame below or above makes it
 * taller than wide. `logoHref` is whatever an `<image>` can load; downloads
 * pass a data URI so the file stands alone once it leaves the dashboard, and
 * a print shop opening it offline still gets the logo.
 */
export function artworkSvg(composition: Composition, px: number, logoHref?: string): string {
  const { art, frame } = composition;
  const square = frame.back.length + frame.front.length === 0 && !art.logo?.preset && art.layers.every((layer) => !/[Aa]/.test(layer.d));
  const height = Math.round((px * frame.height) / frame.width);
  const logo = art.logo
    ? art.logo.preset
      ? presetSvg(art.logo)
      : logoHref
        ? `<image x="${art.logo.x}" y="${art.logo.y}" width="${art.logo.side}" height="${art.logo.side}"` +
          ` preserveAspectRatio="xMidYMid meet" href="${escapeAttribute(logoHref)}"/>`
        : ""
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.width} ${frame.height}"` +
    ` width="${px}" height="${height}"${square ? ' shape-rendering="crispEdges"' : ""}>` +
    frame.back.map(pathSvg).join("") +
    `<g transform="translate(${frame.qr.x} ${frame.qr.y})">` +
    (art.ground ? `<rect width="${art.span}" height="${art.span}" fill="${art.ground}"/>` : "") +
    art.layers.map(pathSvg).join("") +
    logo +
    `</g>` +
    frame.front.map(pathSvg).join("") +
    `</svg>`
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
