import sharp from "sharp";
import jsQR from "jsqr";
import { codeUrl } from "@/lib/brand";
import { DEFAULT_QR_STYLE } from "@/lib/qr-style";
import {
  LOGO_FRACTION,
  levelFor,
  logoBox,
  qrGeometry,
  renderQrSvg,
} from "@/lib/qr-render";

/**
 * The renderer draws what gets printed. The decode tests are the ones that
 * matter: they rasterise the real artwork, logo and colours included, and
 * read it back with a QR decoder, so "a logo still scans" is checked rather
 * than assumed.
 */

const CONTENT = codeUrl("Ab3kQ9x");

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

async function decode(svg: string): Promise<string | null> {
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  return result?.data ?? null;
}

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
    expect(qrGeometry(CONTENT, "H").size).toBeGreaterThanOrEqual(29);
  });

  it("keeps clear of the finder patterns and the format information beside them (modules 0 to 8)", () => {
    for (const size of [21, 25, 29, 33]) {
      expect(logoBox(size).offset).toBeGreaterThan(8);
    }
  });
});

describe("renderQrSvg", () => {
  it("draws the same grid the geometry function gives", () => {
    const svg = renderQrSvg({ content: CONTENT, style: DEFAULT_QR_STYLE, px: 512 });
    expect(svg).toContain(qrGeometry(CONTENT, "Q").path);
    expect(svg).not.toContain("<image");
  });

  it("switches to H and embeds the logo when given one", () => {
    const svg = renderQrSvg({
      content: CONTENT,
      style: DEFAULT_QR_STYLE,
      px: 512,
      logoHref: "data:image/png;base64,AAAA",
    });
    expect(svg).toContain(qrGeometry(CONTENT, "H").path);
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
      style: { dark: "#0B3D5C", light: "#FFF8EC" },
      px: 512,
    });
    expect(svg).toContain('fill="#0B3D5C"');
    expect(svg).toContain('fill="#FFF8EC"');
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
      style: { dark: "#0B3D5C", light: "#FFF8EC" },
      px: 600,
      logoHref: await noisyLogo(),
    });
    expect(await decode(svg)).toBe(CONTENT);
  });
});
