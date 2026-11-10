import { FRAME_FONT } from "@/lib/design-assets.generated";
import { contrastRatio, type QrFrame } from "@/lib/qr-style";

/**
 * The printed frame around a code: its shape, and its call to action drawn as
 * outlines.
 *
 * Pure, like `qr-artwork.ts`, so the live preview and the download draw the
 * same frame. Text is outlined from glyph data generated at build time rather
 * than set in a font, because the PNG renderer on a server has no fonts: a
 * `<text>` element there would come out blank or in a fallback face.
 *
 * Every frame sits wholly outside the symbol's quiet zone. Frames that fill
 * the area around the code paint the quiet zone light themselves, even for a
 * transparent style, so a frame can never take the clear margin a scanner
 * needs. `qr-render.test.ts` decodes every frame.
 */

export type Layer = { d: string; fill: string; evenOdd?: boolean };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Width of `text` in em, from the glyph advances. */
function emWidth(text: string): number {
  let units = 0;
  for (const char of text) units += FRAME_FONT.glyphs[char as keyof typeof FRAME_FONT.glyphs]?.a ?? 0;
  return units / FRAME_FONT.unitsPerEm;
}

/**
 * `text` as one path, its capitals `capHeight` tall, centred on (cx, cy),
 * shrunk if needed to fit `maxWidth`. Glyph paths are absolute M/L/Q/C/Z
 * commands in font units, so placing one is scaling and offsetting each
 * coordinate pair.
 */
export function textOutline(text: string, cx: number, cy: number, capHeight: number, maxWidth: number): string {
  let scale = capHeight / FRAME_FONT.capHeight;
  const natural = emWidth(text) * FRAME_FONT.unitsPerEm * scale;
  if (natural > maxWidth) scale *= maxWidth / natural;
  const width = emWidth(text) * FRAME_FONT.unitsPerEm * scale;

  let x = cx - width / 2;
  // The baseline sits half a cap height below the centre line.
  const baseline = cy + (FRAME_FONT.capHeight * scale) / 2;
  let out = "";
  for (const char of text) {
    const glyph = FRAME_FONT.glyphs[char as keyof typeof FRAME_FONT.glyphs];
    if (!glyph) continue;
    let pair = 0;
    out += glyph.d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (number) => {
      const value = parseFloat(number);
      const placed = pair % 2 === 0 ? x + value * scale : baseline + value * scale;
      pair += 1;
      // Always a space before: in the source a minus sign doubles as the
      // separator ("370-33"), and once placed both numbers may be positive.
      return ` ${r3(placed)}`;
    });
    x += glyph.a * scale;
  }
  return out;
}

function rect(x: number, y: number, w: number, h: number, rad = 0): string {
  if (rad <= 0) return `M${r3(x)} ${r3(y)}h${r3(w)}v${r3(h)}h${r3(-w)}z`;
  const r = Math.min(rad, w / 2, h / 2);
  return (
    `M${r3(x + r)} ${r3(y)}H${r3(x + w - r)}A${r3(r)} ${r3(r)} 0 0 1 ${r3(x + w)} ${r3(y + r)}` +
    `V${r3(y + h - r)}A${r3(r)} ${r3(r)} 0 0 1 ${r3(x + w - r)} ${r3(y + h)}` +
    `H${r3(x + r)}A${r3(r)} ${r3(r)} 0 0 1 ${r3(x)} ${r3(y + h - r)}` +
    `V${r3(y + r)}A${r3(r)} ${r3(r)} 0 0 1 ${r3(x + r)} ${r3(y)}Z`
  );
}

/** Black or white, whichever reads better on `fill`. */
export function inkOn(fill: string): string {
  return contrastRatio(fill, "#FFFFFF") >= contrastRatio(fill, "#000000") ? "#FFFFFF" : "#000000";
}

export type FrameLayout = {
  width: number;
  height: number;
  /** Where the symbol's top-left corner goes. */
  qr: { x: number; y: number };
  /** Painted before the symbol. */
  back: Layer[];
  /** Painted after it. */
  front: Layer[];
};

/**
 * The frame around a symbol `span` modules wide (quiet zone included).
 * `colour` is the frame's own; `ground` is the background, or null for a
 * transparent style.
 */
export function frameLayout(
  frame: QrFrame,
  span: number,
  text: string,
  colour: string,
  ground: string | null,
  light: string
): FrameLayout {
  const S = span;
  const line = Math.max(1, S * 0.03);
  const band = S * 0.24;
  const cap = band * 0.38;
  const maxText = S * 0.84;
  const onFill = inkOn(colour);

  const canvas = (width: number, height: number) => (ground ? [{ d: rect(0, 0, width, height), fill: ground }] : []);

  switch (frame) {
    case "box": {
      const w = S + line * 2;
      const h = w + band;
      return {
        width: w,
        height: h,
        qr: { x: line, y: line },
        back: [...canvas(w, h), { d: rect(0, 0, w, w, line * 1.5) + rect(line, line, S, S), fill: colour, evenOdd: true }],
        front: [{ d: textOutline(text, w / 2, w + band / 2, cap, maxText), fill: colour }],
      };
    }
    case "banner-below":
    case "banner-above": {
      const w = S + line * 2;
      const h = w + band;
      const below = frame === "banner-below";
      const qr = { x: line, y: below ? line : band + line };
      return {
        width: w,
        height: h,
        qr,
        back: [
          ...canvas(w, h),
          // The symbol's square is cut out, so its own ground shows through
          // and the band fills the rest.
          { d: rect(0, 0, w, h, line * 1.5) + rect(qr.x, qr.y, S, S), fill: colour, evenOdd: true },
        ],
        front: [{ d: textOutline(text, w / 2, below ? w + band / 2 - line / 2 : band / 2 + line / 2, cap, maxText), fill: onFill }],
      };
    }
    case "bubble": {
      const gap = S * 0.03;
      const tip = S * 0.05;
      const bw = S * 0.8;
      const h = S + gap + tip + band * 0.85;
      const top = S + gap + tip;
      const cx = S / 2;
      return {
        width: S,
        height: h,
        qr: { x: 0, y: 0 },
        back: canvas(S, h),
        front: [
          {
            d: rect(cx - bw / 2, top, bw, band * 0.85, band * 0.2) + `M${r3(cx - tip)} ${r3(top + 0.01)}L${r3(cx)} ${r3(S + gap)}L${r3(cx + tip)} ${r3(top + 0.01)}Z`,
            fill: colour,
          },
          { d: textOutline(text, cx, top + (band * 0.85) / 2, cap, bw * 0.88), fill: onFill },
        ],
      };
    }
    case "tag": {
      const pad = S * 0.06;
      const w = S + pad * 2;
      const h = w + band * 0.9;
      return {
        width: w,
        height: h,
        qr: { x: pad, y: pad },
        back: [
          { d: rect(0, 0, w, h, S * 0.08) + rect(pad, pad, S, S), fill: colour, evenOdd: true },
          // Always light, transparent style or not: this is the quiet zone.
          { d: rect(pad, pad, S, S), fill: light },
        ],
        front: [{ d: textOutline(text, w / 2, w + (band * 0.9) / 2 - pad / 2, cap, maxText), fill: onFill }],
      };
    }
    case "corners": {
      const m = S * 0.05 + line;
      const w = S + m * 2;
      const h = w + band * 0.9;
      const arm = S * 0.18;
      const brackets = [
        [0, 0, 1, 1],
        [w, 0, -1, 1],
        [0, w, 1, -1],
        [w, w, -1, -1],
      ]
        .map(([x, y, dx, dy]) => {
          const x2 = x + dx * arm;
          const y2 = y + dy * arm;
          const ix = x + dx * line;
          const iy = y + dy * line;
          return `M${r3(x)} ${r3(y)}L${r3(x2)} ${r3(y)}L${r3(x2)} ${r3(iy)}L${r3(ix)} ${r3(iy)}L${r3(ix)} ${r3(y2)}L${r3(x)} ${r3(y2)}Z`;
        })
        .join("");
      return {
        width: w,
        height: h,
        qr: { x: m, y: m },
        back: canvas(w, h),
        front: [
          { d: brackets, fill: colour },
          { d: textOutline(text, w / 2, w + (band * 0.9) / 2, cap, maxText), fill: colour },
        ],
      };
    }
    case "pill": {
      const gap = S * 0.04;
      const ph = band * 0.7;
      const textWidth = Math.min(maxText, emWidth(text) * cap * (FRAME_FONT.unitsPerEm / FRAME_FONT.capHeight));
      const pw = Math.min(S, textWidth + ph * 1.2);
      const h = S + gap + ph;
      return {
        width: S,
        height: h,
        qr: { x: 0, y: 0 },
        back: canvas(S, h),
        front: [
          { d: rect(S / 2 - pw / 2, S + gap, pw, ph, ph / 2), fill: colour },
          { d: textOutline(text, S / 2, S + gap + ph / 2, cap * 0.9, pw - ph * 0.8), fill: onFill },
        ],
      };
    }
    default:
      return { width: S, height: S, qr: { x: 0, y: 0 }, back: [], front: [] };
  }
}
