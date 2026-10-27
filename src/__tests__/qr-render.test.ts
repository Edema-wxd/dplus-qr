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
import { CORNER_DOTS, CORNER_FRAMES, DEFAULT_QR_STYLE, QR_PATTERNS, type QrStyle } from "@/lib/qr-style";
import { LOGO_FRACTION, levelFor, logoBox, qrMatrix, renderQrSvg } from "@/lib/qr-render";
import { eyeShape, frameShape, inksFor, qrArtwork } from "@/lib/qr-artwork";

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
