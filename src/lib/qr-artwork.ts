import sharp from "sharp";
import { codeUrl } from "@/lib/brand";
import { loadLogo } from "@/lib/logos";
import { renderQrSvg } from "@/lib/qr-render";
import type { QrStyle } from "@/lib/qr-style";

/**
 * The downloadable artwork for one dynamic code, as SVG text or PNG bytes.
 *
 * Shared by the single download (`/app/{id}/qr`) and a batch's zip, so the
 * two cannot drift: a code downloaded on its own and the same code out of a
 * zip are the same bytes.
 *
 * The encoded content is always the code URL, never the destination. That
 * is the whole product: a symbol encoding the destination would be a static
 * code and could never be re-pointed. It comes from `codeUrl()`, the same
 * function the dashboard draws its on-screen symbol from.
 *
 * Every download is drawn by `renderQrSvg`, logo or not, which draws with
 * `qr-draw.ts`, the module the on-screen specimen and the live design preview
 * use too: what the owner previews is what they print. Error correction is Q
 * without a logo and H with one (`levelFor`). The style is the saved one,
 * already read through `readQrStyle` by whoever loaded the code, so a row
 * saved before patterns existed draws as the plain squares it always did.
 *
 * A PNG is that SVG rasterised by sharp. A transparent style keeps its
 * transparency: the SVG has no ground to paint, and sharp keeps the alpha.
 */

export type ArtworkFormat = "svg" | "png";

export type ArtworkCode = {
  shortCode: string;
  style: QrStyle;
  logo: { url: string } | null;
};

/** The logo could not be fetched; the caller refuses rather than drawing without it. */
export class LogoUnavailable extends Error {}

/**
 * Logos already fetched in this request, by URL, so a batch of 500 codes
 * sharing one logo fetches it once.
 */
export type LogoCache = Map<string, Promise<Buffer>>;

export async function renderArtwork(
  code: ArtworkCode,
  format: ArtworkFormat,
  size: 1024 | 2048,
  logos: LogoCache = new Map()
): Promise<string | Buffer> {
  const content = codeUrl(code.shortCode);

  if (code.logo) {
    // Fetched and embedded, never linked: an SVG that points at a URL loses
    // its logo the moment a print shop opens it offline.
    let pending = logos.get(code.logo.url);
    if (!pending) {
      pending = loadLogo(code.logo.url);
      logos.set(code.logo.url, pending);
    }
    let logo: Buffer;
    try {
      logo = await pending;
    } catch (error) {
      console.error("[qr] logo fetch failed", error);
      // Refused rather than quietly drawn without the logo, which would hand
      // the owner artwork that differs from what they previewed.
      logos.delete(code.logo.url);
      throw new LogoUnavailable("The logo for this code could not be loaded.");
    }

    const svg = renderQrSvg({
      content,
      style: code.style,
      px: size,
      logoHref: `data:image/png;base64,${logo.toString("base64")}`,
    });
    return format === "png" ? sharp(Buffer.from(svg)).png().toBuffer() : svg;
  }

  const svg = renderQrSvg({ content, style: code.style, px: size });
  return format === "png" ? sharp(Buffer.from(svg)).png().toBuffer() : svg;
}

