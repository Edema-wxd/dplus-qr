import sharp from "sharp";
import jsQR from "jsqr";
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { codeUrl } from "@/lib/brand";
import { CORNER_DOTS, CORNER_FRAMES, DEFAULT_QR_STYLE, QR_PATTERNS, readQrStyle, type QrStyle } from "@/lib/qr-style";
import { LOGO_FRACTION, QUIET_ZONE, levelFor, logoBox, qrMatrix, renderQrSvg } from "@/lib/qr-render";
import { eyeShape, frameShape, inksFor, qrArtwork } from "@/lib/qr-draw";
import { renderArtwork } from "@/lib/qr-artwork";

// The download path fetches logos; these tests draw without one.
jest.mock("@/lib/logos", () => ({ loadLogo: jest.fn() }));

/**
 * The renderer draws what gets printed. The decode tests are the ones that
 * matter: they rasterise the real artwork, logo, colours and shapes included,
 * and read it back, so "this design still scans" is checked rather than
 * assumed.
 *
 * Two readers. ZXing, the engine many Android scanner apps are built on, must
 * read every pattern and corner combination; a design it cannot read fails
 * the build and must not be offered. jsQR, which is far stricter about corner
 * shapes than any phone camera, must still read the default artwork, as it
 * always has.
 */

const CONTENT = codeUrl("Ab3kQ9x");
/** A long custom code: more modules, so smaller ones at the same size. */
const LONG = codeUrl("our-new-autumn-menu-2026-xyz");

/** A busy, high-contrast square: a harder logo than any real mark. */
async function noisyLogo(): Promise<string> {
  const px = 64;
  const raw = Buffer.alloc(px * px * 3);
  for (let i = 0; i < px * px; i += 1) {
    const dark = ((i % px) ^ Math.floor(i / px)) & 4;
    raw.fill(dark ? 0 : 255, i * 3, i * 3 + 3);
    raw[i * 3] = 220; // keep it coloured, not just grey
  }
  const png = await sharp(raw, { raw: { width: px, height: px, channels: 3 } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** RGBA pixels, laid on white as a transparent download would be printed. */
async function pixels(svg: string) {
  return sharp(Buffer.from(svg))
    .flatten({ background: "#FFFFFF" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function decode(svg: string): Promise<string | null> {
  const { data, info } = await pixels(svg);
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return result?.data ?? null;
}

async function decodeZxing(svg: string): Promise<string | null> {
  const { data, info } = await pixels(svg);
  const luminance = new Uint8ClampedArray(info.width * info.height);
  for (let i = 0; i < luminance.length; i += 1) {
    luminance[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  }
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminance, info.width, info.height)));
    return new QRCodeReader().decode(bitmap, new Map([[DecodeHintType.TRY_HARDER, true]])).getText();
  } catch {
    return null;
  }
}

const COMBINATIONS = QR_PATTERNS.flatMap((pattern) =>
  CORNER_FRAMES.flatMap((cornerFrame) =>
    CORNER_DOTS.map((cornerDot): QrStyle => ({ ...DEFAULT_QR_STYLE, pattern, cornerFrame, cornerDot }))
  )
);
const label = (style: QrStyle) => `${style.pattern} / ${style.cornerFrame} frame / ${style.cornerDot} centre`;

describe("levelFor", () => {
  it("uses Q without a logo and H with one", () => {
    expect(levelFor(false)).toBe("Q");
    expect(levelFor(true)).toBe("H");
  });
});

describe("logoBox", () => {
  it.each([21, 25, 29, 33, 37, 41])(
    "centres exactly on whole modules for a %i-module symbol",
    (size) => {
      const box = logoBox(size);
      expect(Number.isInteger(box.offset)).toBe(true);
      expect(box.offset * 2 + box.side).toBe(size);
    }
  );

  it.each([29, 33, 37, 41])("never covers more than a quarter of the width (%i)", (size) => {
    const box = logoBox(size);
    expect(box.side / size).toBeLessThanOrEqual(0.25);
    expect(box.side / size).toBeGreaterThanOrEqual(LOGO_FRACTION - 0.05);
  });

  it("is the size a real code URL actually renders at, with a logo", () => {
    // A 30-character code URL at level H. If this changes, the decode tests
    // below are the ones to trust.
    expect(qrMatrix(CONTENT, "H").size).toBeGreaterThanOrEqual(29);
  });

  it("keeps clear of the finder patterns and the format information beside them (modules 0 to 8)", () => {
    for (const size of [21, 25, 29, 33]) {
      expect(logoBox(size).offset).toBeGreaterThan(8);
    }
  });
});

describe("qrArtwork", () => {
  const matrix = qrMatrix(CONTENT, "Q");

  it("draws the three corner squares as shapes of their own", () => {
    const art = qrArtwork(matrix, DEFAULT_QR_STYLE, inksFor(DEFAULT_QR_STYLE));
    const [dots, frames, eyes] = art.layers;
    expect(frames.evenOdd).toBe(true);
    expect(frames.d.match(/M/g)).toHaveLength(6); // three rings, each an outer and an inner square
    expect(eyes.d.match(/M/g)).toHaveLength(3);
    // No data module is drawn inside a corner square.
    expect(dots.d).not.toMatch(/(^|[^\d.])M4 4h1/);
  });

  it("leaves the logo box empty rather than painting over it", () => {
    const withLogo = qrArtwork(qrMatrix(CONTENT, "H"), DEFAULT_QR_STYLE, inksFor(DEFAULT_QR_STYLE), true);
    const box = logoBox(qrMatrix(CONTENT, "H").size);
    const centre = box.offset + Math.floor(box.side / 2) + 4;
    expect(withLogo.layers[0].d).not.toContain(`M${centre} ${centre}h1`);
    expect(withLogo.logo).not.toBeNull();
  });

  it("follows the pattern for corners left on auto", () => {
    expect(frameShape({ ...DEFAULT_QR_STYLE, pattern: "rounded" })).toBe("rounded");
    expect(frameShape({ ...DEFAULT_QR_STYLE, pattern: "square" })).toBe("square");
    expect(eyeShape({ ...DEFAULT_QR_STYLE, pattern: "extra-rounded" })).toBe("rounded");
    expect(frameShape({ ...DEFAULT_QR_STYLE, pattern: "rounded", cornerFrame: "circle" })).toBe("circle");
  });

  it("paints each part in its own colour, and the ground only when not transparent", () => {
    const style: QrStyle = { ...DEFAULT_QR_STYLE, cornerFrameColor: "#2E6B2E", cornerDotColor: "#1A4F8A" };
    const art = qrArtwork(matrix, style, inksFor(style));
    expect(art.layers.map((layer) => layer.fill)).toEqual(["#1A1A1A", "#2E6B2E", "#1A4F8A"]);
    expect(art.ground).toBe("#FFFFFF");
    expect(qrArtwork(matrix, style, inksFor({ ...style, transparent: true })).ground).toBeNull();
  });
});

describe("renderQrSvg", () => {
  it("keeps the default artwork pixel-crisp, with no curves", () => {
    const svg = renderQrSvg({ content: CONTENT, style: DEFAULT_QR_STYLE, px: 512 });
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toContain("<image");
  });

  it("switches to H and embeds the logo when given one", () => {
    const svg = renderQrSvg({
      content: CONTENT,
      style: DEFAULT_QR_STYLE,
      px: 512,
      logoHref: "data:image/png;base64,AAAA",
    });
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
  });

  it("escapes the logo reference, so it cannot break out of the attribute", () => {
    const svg = renderQrSvg({
      content: CONTENT,
      style: DEFAULT_QR_STYLE,
      px: 512,
      logoHref: 'x" onload="alert(1)',
    });
    expect(svg).not.toContain('onload="alert(1)"');
    expect(svg).toContain("&quot;");
  });

  it("paints the chosen colours", () => {
    const svg = renderQrSvg({
      content: CONTENT,
      style: { ...DEFAULT_QR_STYLE, dark: "#0B3D5C", light: "#FFF8EC" },
      px: 512,
    });
    expect(svg).toContain('fill="#0B3D5C"');
    expect(svg).toContain('fill="#FFF8EC"');
  });

  it("leaves the ground out of a transparent download", () => {
    const svg = renderQrSvg({ content: CONTENT, style: { ...DEFAULT_QR_STYLE, transparent: true }, px: 512 });
    expect(svg).not.toContain("<rect");
  });
});

describe("rendered artwork scans", () => {
  it("decodes to the code URL without a logo", async () => {
    const svg = renderQrSvg({ content: CONTENT, style: DEFAULT_QR_STYLE, px: 600 });
    expect(await decode(svg)).toBe(CONTENT);
  });

  it("decodes to the code URL with a busy logo in the middle", async () => {
    const svg = renderQrSvg({
      content: CONTENT,
      style: DEFAULT_QR_STYLE,
      px: 600,
      logoHref: await noisyLogo(),
    });
    expect(await decode(svg)).toBe(CONTENT);
  });

  it("decodes with brand colours and a logo together", async () => {
    const svg = renderQrSvg({
      content: CONTENT,
      style: { ...DEFAULT_QR_STYLE, dark: "#0B3D5C", light: "#FFF8EC" },
      px: 600,
      logoHref: await noisyLogo(),
    });
    expect(await decode(svg)).toBe(CONTENT);
  });
});

describe("every pattern and corner combination scans", () => {
  let logo: string;
  beforeAll(async () => {
    logo = await noisyLogo();
  });

  it.each(COMBINATIONS.map((style) => [label(style), style] as const))("%s, small and plain", async (_name, style) => {
    expect(await decodeZxing(renderQrSvg({ content: CONTENT, style, px: 240 }))).toBe(CONTENT);
  });

  it.each(COMBINATIONS.map((style) => [label(style), style] as const))("%s, with a busy logo", async (_name, style) => {
    expect(await decodeZxing(renderQrSvg({ content: CONTENT, style, px: 600, logoHref: logo }))).toBe(CONTENT);
  });

  it.each(QR_PATTERNS)("%s, with every part in a different brand colour, a logo and a long link", async (pattern) => {
    const style: QrStyle = {
      ...DEFAULT_QR_STYLE,
      pattern,
      dark: "#0B3D5C",
      light: "#FFF8EC",
      cornerFrameColor: "#2E6B2E",
      cornerDotColor: "#1A4F8A",
    };
    expect(await decodeZxing(renderQrSvg({ content: LONG, style, px: 400, logoHref: logo }))).toBe(LONG);
  });

  it.each(QR_PATTERNS)("%s, transparent, laid on white", async (pattern) => {
    const style: QrStyle = { ...DEFAULT_QR_STYLE, pattern, transparent: true };
    expect(await decodeZxing(renderQrSvg({ content: CONTENT, style, px: 400 }))).toBe(CONTENT);
  });
});

describe("downloads (renderArtwork)", () => {
  const code = (stored: unknown) => ({ shortCode: "Ab3kQ9x", style: readQrStyle(stored), logo: null });

  it("draws a style saved before patterns existed as exactly the modules it always did", async () => {
    // A row holding only the two colours, or nothing at all, is the plain
    // design: every module of the level-Q matrix, square, in its own colour.
    for (const stored of [{}, { dark: "#0B3D5C", light: "#FFF8EC" }]) {
      const style = readQrStyle(stored);
      const png = (await renderArtwork(code(stored), "png", 1024)) as Buffer;
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const matrix = qrMatrix(CONTENT, "Q");
      const span = matrix.size + QUIET_ZONE * 2;
      // Sampled near a corner of each module as well as its centre, so a dot or
      // a rounded corner would show as a difference, not only a missing module.
      const at = (mx: number, my: number, inset = 0.5) => {
        const x = Math.floor(((mx + inset) * info.width) / span);
        const y = Math.floor(((my + inset) * info.height) / span);
        const i = (y * info.width + x) * 4;
        return `#${[data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      };
      for (let my = 0; my < span; my += 1) {
        for (let mx = 0; mx < span; mx += 1) {
          const x = mx - QUIET_ZONE;
          const y = my - QUIET_ZONE;
          const dark =
            x >= 0 && y >= 0 && x < matrix.size && y < matrix.size && matrix.bits[y * matrix.size + x] === "1";
          expect(at(mx, my)).toBe(dark ? style.dark : style.light);
          expect(at(mx, my, 0.15)).toBe(dark ? style.dark : style.light);
        }
      }
      expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(CONTENT);
    }
  });

  it("draws the saved pattern, and the SVG is the one renderer's", async () => {
    const stored = { dark: "#0B3D5C", light: "#FFFFFF", pattern: "classy-rounded", cornerFrame: "circle", cornerDot: "dot" };
    const svg = (await renderArtwork(code(stored), "svg", 1024)) as string;
    expect(svg).toBe(renderQrSvg({ content: CONTENT, style: readQrStyle(stored), px: 1024 }));
    expect(await decodeZxing(svg)).toBe(CONTENT);
  });

  it("keeps a transparent PNG transparent", async () => {
    const png = (await renderArtwork(code({ dark: "#1A1A1A", light: "#FFFFFF", transparent: true }), "png", 1024)) as Buffer;
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBe(0); // the top-left corner is quiet zone, left out
  });
});
