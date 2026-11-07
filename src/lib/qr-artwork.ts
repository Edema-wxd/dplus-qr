import QRCode from "qrcode";
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
 * Error correction is Q, the level a printed code without a centred logo
 * wants. A code with a logo is drawn at H by `renderQrSvg`, the same renderer
 * whose geometry the on-screen specimen uses. Colours are the saved style,
 * already read through `readQrStyle` by whoever loaded the code.
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

  const common = {
    errorCorrectionLevel: "Q" as const,
    margin: 4,
    // `qrcode` takes RGBA hex; the style is opaque RGB, so append full alpha.
    color: { dark: `${code.style.dark}FF`, light: `${code.style.light}FF` },
  };

  return format === "png"
    ? QRCode.toBuffer(content, { ...common, type: "png", width: size })
    : QRCode.toString(content, { ...common, type: "svg", width: size });
}
