import sharp from "sharp";
import jsQR from "jsqr";
import { buildStaticPayload } from "@/lib/static-payload";
import { DEFAULT_QR_STYLE } from "@/lib/qr-style";
import { levelFor, logoBox, QUIET_ZONE, qrGeometry, renderQrSvg } from "@/lib/qr-render";
import {
  containRect,
  LOGO_FAILED_NOTICE,
  LOGO_LOADING_NOTICE,
  LOGO_TOO_LONG_NOTICE,
  paintStaticArtwork,
  planStaticArtwork,
  plainStyle,
  pngScale,
  STATIC_PLAIN_LEVEL,
  staticLevel,
  staticSvg,
  type ArtworkCanvas,
  type LogoState,
  type StaticArtwork,
  type StaticColours,
} from "@/lib/static-artwork";

/**
 * A static code is drawn in the browser and never stored, so these are the
 * evidence that a styled one still scans: the SVG is rasterised with sharp,
 * the PNG is painted by the real painter onto a pixel buffer, and both are
 * decoded with jsQR back to the exact content.
 */

const BRAND: StaticColours = { dark: "#0B3D5C", light: "#FFF8EC" };

function payload(kind: Parameters<typeof buildStaticPayload>[0], fields: Record<string, string>) {
  const result = buildStaticPayload(kind, fields);
  if (!result.ok) throw new Error(result.reason);
  return result.content;
}

const WIFI = payload("wifi", { ssid: "Mama Put; Ikeja", password: 'p:a"ss-2026', security: "WPA" });
const VCARD = payload("vcard", {
  firstName: "Adaeze",
  lastName: "Okonkwo-Bello",
  organisation: "Okonkwo & Sons Logistics",
  title: "Head of Operations",
  mobile: "+234 801 234 5678",
  phone: "+234 1 234 5678",
  email: "adaeze@okonkwo-logistics.ng",
  website: "okonkwo-logistics.ng/team/adaeze",
  street: "14 Adeola Odeku Street",
  city: "Victoria Island",
  region: "Lagos",
  country: "Nigeria",
});

/** A busy, coloured logo: harder for a scanner than any real mark. */
type Raster = { width: number; height: number; data: Uint8ClampedArray };
function noisyRaster(width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dark = (x ^ y) & 4;
      const i = (y * width + x) * 4;
      data[i] = 220;
      data[i + 1] = dark ? 0 : 255;
      data[i + 2] = dark ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

async function rasterDataUrl(raster: Raster): Promise<string> {
  const png = await sharp(Buffer.from(raster.data), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function readyLogo(raster: Raster): Promise<LogoState> {
  return {
    status: "ready",
    logo: { href: await rasterDataUrl(raster), width: raster.width, height: raster.height },
  };
}

function artworkOf(plan: ReturnType<typeof planStaticArtwork>): StaticArtwork {
  if (!plan.ok) throw new Error(plan.reason);
  return plan.artwork;
}

async function decodeSvg(svg: string): Promise<string | null> {
  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

/**
 * The subset of a canvas the painter uses, over a plain RGBA buffer, so the
 * PNG path is decoded without a browser. Nearest-neighbour `drawImage`.
 */
class PixelCanvas implements ArtworkCanvas<Raster> {
  fillStyle: unknown = "#000000";
  readonly data: Uint8ClampedArray;
  constructor(readonly size: number) {
    this.data = new Uint8ClampedArray(size * size * 4);
  }
  private put(x: number, y: number, rgba: ArrayLike<number>) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    this.data[i] = rgba[0];
    this.data[i + 1] = rgba[1];
    this.data[i + 2] = rgba[2];
    this.data[i + 3] = rgba[3];
  }
  fillRect(x: number, y: number, width: number, height: number) {
    const hex = String(this.fillStyle);
    const rgba = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255);
    for (let py = Math.round(y); py < Math.round(y + height); py += 1) {
      for (let px = Math.round(x); px < Math.round(x + width); px += 1) this.put(px, py, rgba);
    }
  }
  drawImage(image: Raster, x: number, y: number, width: number, height: number) {
    for (let py = Math.round(y); py < Math.round(y + height); py += 1) {
      for (let px = Math.round(x); px < Math.round(x + width); px += 1) {
        const sx = Math.min(image.width - 1, Math.floor(((px - x) / width) * image.width));
        const sy = Math.min(image.height - 1, Math.floor(((py - y) / height) * image.height));
        const i = (sy * image.width + sx) * 4;
        this.put(px, py, image.data.subarray(i, i + 4));
      }
    }
  }
}

function paintAndDecode(artwork: StaticArtwork, logo: Raster | null): string | null {
  const { scale, px } = pngScale(artwork.geometry, 1024);
  const canvas = new PixelCanvas(px);
  paintStaticArtwork(canvas, artwork, scale, logo);
  return jsQR(canvas.data, px, px)?.data ?? null;
}

describe("staticLevel", () => {
  it("stays at M without a logo and uses a dynamic code's level with one", () => {
    expect(staticLevel(false)).toBe("M");
    expect(STATIC_PLAIN_LEVEL).toBe("M");
    expect(staticLevel(true)).toBe(levelFor(true));
    expect(staticLevel(true)).toBe("H");
  });
});

describe("planStaticArtwork", () => {
  it("draws the plain code at M with no notice", () => {
    const plan = planStaticArtwork(WIFI, DEFAULT_QR_STYLE, { status: "none" });
    expect(plan).toMatchObject({ ok: true, notice: null, downloadable: true });
    expect(artworkOf(plan).level).toBe("M");
    expect(artworkOf(plan).logo).toBeNull();
    expect(artworkOf(plan).geometry.path).toBe(qrGeometry(WIFI, "M").path);
  });

  it("moves to H when the logo is ready", async () => {
    const plan = planStaticArtwork(WIFI, BRAND, await readyLogo(noisyRaster(64, 64)));
    expect(plan).toMatchObject({ ok: true, notice: null, downloadable: true });
    expect(artworkOf(plan).level).toBe("H");
    expect(artworkOf(plan).logo).not.toBeNull();
  });

  it("holds the downloads while the logo loads, so none quietly lacks it", () => {
    const plan = planStaticArtwork(WIFI, DEFAULT_QR_STYLE, { status: "loading" });
    expect(plan).toMatchObject({ ok: true, notice: LOGO_LOADING_NOTICE, downloadable: false });
  });

  it("falls back to no logo when it fails, and says so", () => {
    const plan = planStaticArtwork(WIFI, DEFAULT_QR_STYLE, { status: "failed" });
    expect(plan).toMatchObject({ ok: true, notice: LOGO_FAILED_NOTICE, downloadable: true });
    expect(artworkOf(plan).logo).toBeNull();
    expect(artworkOf(plan).level).toBe("M");
  });

  it("refuses to download a pair that fails the contrast check", () => {
    for (const style of [
      { dark: "#FFFFFF", light: "#1A1A1A" }, // inverted
      { dark: "#7A7A7A", light: "#FFFFFF" }, // too close
    ]) {
      expect(planStaticArtwork(WIFI, style, { status: "none" })).toMatchObject({
        ok: true,
        downloadable: false,
      });
    }
  });

  it("drops the logo, with a notice, when the content is too long for H", async () => {
    // 1,000 accented letters: inside the payload limit and M's capacity
    // (2,000 bytes of UTF-8), beyond H's 1,273.
    const content = payload("text", { text: "é".repeat(1000) });
    const plan = planStaticArtwork(content, DEFAULT_QR_STYLE, await readyLogo(noisyRaster(16, 16)));
    expect(plan).toMatchObject({ ok: true, notice: LOGO_TOO_LONG_NOTICE, downloadable: true });
    expect(artworkOf(plan).level).toBe("M");
  });

  it("says so, rather than drawing nothing, when even M cannot hold it", () => {
    const content = payload("text", { text: "中".repeat(1000) }); // 3,000 bytes
    const plan = planStaticArtwork(content, DEFAULT_QR_STYLE, { status: "none" });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/too much to fit/);
  });
});

describe("staticSvg", () => {
  it("is the dynamic renderer's output at the static level, colours and logo included", async () => {
    const plan = planStaticArtwork(WIFI, BRAND, await readyLogo(noisyRaster(64, 64)));
    const artwork = artworkOf(plan);
    const svg = staticSvg(artwork, 1024);
    expect(svg).toBe(
      renderQrSvg({ content: WIFI, style: plainStyle(BRAND), px: 1024, level: "H", logoHref: artwork.logo!.href })
    );
    expect(svg).toContain('fill="#0B3D5C"');
    expect(svg).toContain('fill="#FFF8EC"');
    expect(svg).toContain('href="data:image/png;base64,');
    expect(svg).toContain('width="1024"');
  });

  it("stays on the plain square design whatever the style object carries", () => {
    // Static codes are not offered patterns; the canvas PNG draws squares only.
    const plan = planStaticArtwork(WIFI, BRAND, { status: "none" });
    const artwork = artworkOf(plan);
    const fancy = { ...artwork, style: { ...DEFAULT_QR_STYLE, ...BRAND, pattern: "dots", transparent: true } };
    expect(staticSvg(fancy as StaticArtwork, 512)).toBe(staticSvg(artwork, 512));
    expect(staticSvg(artwork, 512)).toContain('shape-rendering="crispEdges"');
  });
});

describe("containRect", () => {
  it("fits a wide logo inside the box, centred, like xMidYMid meet", () => {
    expect(containRect({ x: 10, y: 10, side: 100 }, 200, 100)).toEqual({
      x: 10,
      y: 35,
      width: 100,
      height: 50,
    });
    expect(containRect({ x: 0, y: 0, side: 60 }, 30, 60)).toEqual({
      x: 15,
      y: 0,
      width: 30,
      height: 60,
    });
  });
});

describe("pngScale", () => {
  it("uses whole pixels per module near the target size", () => {
    const geometry = qrGeometry(VCARD, "H");
    const { scale, px } = pngScale(geometry, 1024);
    expect(Number.isInteger(scale)).toBe(true);
    expect(px).toBe((geometry.size + QUIET_ZONE * 2) * scale);
    expect(Math.abs(px - 1024)).toBeLessThanOrEqual((geometry.size + QUIET_ZONE * 2) / 2);
  });
});

describe("paintStaticArtwork", () => {
  it("paints the logo box where renderQrSvg puts it", async () => {
    const plan = planStaticArtwork(WIFI, BRAND, await readyLogo(noisyRaster(64, 64)));
    const artwork = artworkOf(plan);
    const calls: Array<[string, number, number, number, number]> = [];
    const ctx: ArtworkCanvas<Raster> = {
      fillStyle: "",
      fillRect(x, y, w, h) {
        calls.push([String(this.fillStyle), x, y, w, h]);
      },
      drawImage(_image, x, y, w, h) {
        calls.push(["image", x, y, w, h]);
      },
    };
    paintStaticArtwork(ctx, artwork, 10, noisyRaster(64, 64));
    const box = logoBox(artwork.geometry.size);
    const at = (box.offset + QUIET_ZONE) * 10;
    expect(calls).toContainEqual(["#FFF8EC", at, at, box.side * 10, box.side * 10]);
    expect(calls.at(-1)).toEqual(["image", at + 10, at + 10, (box.side - 2) * 10, (box.side - 2) * 10]);
  });
});

describe("a styled static code still scans", () => {
  const cases: Array<[string, string]> = [
    ["Wi-Fi", WIFI],
    ["vCard", VCARD],
    ["Bitcoin", payload("bitcoin", { address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", amount: "0.0015" })],
  ];

  it.each(cases)("the %s SVG decodes with brand colours and a busy logo", async (_name, content) => {
    const plan = planStaticArtwork(content, BRAND, await readyLogo(noisyRaster(64, 64)));
    expect(artworkOf(plan).level).toBe("H");
    expect(await decodeSvg(staticSvg(artworkOf(plan), 1024))).toBe(content);
  });

  it.each(cases)("the %s PNG painter decodes with brand colours and a busy logo", async (_name, content) => {
    const raster = noisyRaster(64, 64);
    const plan = planStaticArtwork(content, BRAND, await readyLogo(raster));
    expect(paintAndDecode(artworkOf(plan), raster)).toBe(content);
  });

  it("the PNG decodes with a wide logo, fitted rather than stretched", async () => {
    const raster = noisyRaster(160, 48);
    const plan = planStaticArtwork(VCARD, BRAND, await readyLogo(raster));
    expect(paintAndDecode(artworkOf(plan), raster)).toBe(VCARD);
  });

  it("the plain PNG and SVG decode at M in the default colours", async () => {
    const plan = planStaticArtwork(VCARD, DEFAULT_QR_STYLE, { status: "none" });
    expect(paintAndDecode(artworkOf(plan), null)).toBe(VCARD);
    expect(await decodeSvg(staticSvg(artworkOf(plan), 1024))).toBe(VCARD);
  });
});
