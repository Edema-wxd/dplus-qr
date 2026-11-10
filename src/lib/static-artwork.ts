import { checkQrStyle, DEFAULT_QR_STYLE, type QrStyle } from "@/lib/qr-style";
import {
  levelFor,
  logoBox,
  qrGeometry,
  QUIET_ZONE,
  renderQrSvg,
  type Geometry,
  type QrLevel,
} from "@/lib/qr-render";

/**
 * Composing a static code's artwork: its content, colours and logo.
 *
 * A static code is drawn entirely in the browser and never stored, so this
 * is where the rules a dynamic code gets from the server are applied instead:
 * the same contrast check (`checkQrStyle`), the same logo box (`logoBox`) and
 * the same level with a logo (`levelFor(true)`, H). The SVG is drawn by the
 * dynamic codes' own `renderQrSvg`, and the PNG is painted onto a canvas from
 * the same geometry, so the preview, the SVG and the PNG are one picture.
 *
 * Pure: nothing here touches the DOM. The canvas is reached through the
 * narrow `ArtworkCanvas` interface, which the tests implement with a plain
 * pixel buffer so the painted PNG can be decoded in jest.
 */

/**
 * The level a static code without a logo is drawn at.
 *
 * One below a dynamic code's Q, as static codes always have been. A dynamic
 * code encodes a 30-character link; a static one carries its whole content,
 * up to 1,000 characters of vCard or Wi-Fi details, and every level up makes
 * the modules smaller at the same print size. With a logo the level is H,
 * the same as a dynamic code, because the logo covers modules that only H's
 * error correction can spare.
 */
export const STATIC_PLAIN_LEVEL: QrLevel = "M";

export function staticLevel(hasLogo: boolean): QrLevel {
  return hasLogo ? levelFor(true) : STATIC_PLAIN_LEVEL;
}

/**
 * What a static code is styled with: two colours, nothing else. See
 * `plainStyle`.
 */
export type StaticColours = Pick<QrStyle, "dark" | "light">;

/** A logo ready to draw: a same-origin data URL and its pixel size. */
export type StaticLogo = { href: string; width: number; height: number };

/** Where the browser has got to with the chosen logo. */
export type LogoState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; logo: StaticLogo }
  | { status: "failed" };

export type StaticArtwork = {
  content: string;
  style: StaticColours;
  level: QrLevel;
  geometry: Geometry;
  /** Null when drawn without a logo, whether by choice or by fallback. */
  logo: StaticLogo | null;
};

export type StaticPlan =
  | {
      ok: true;
      artwork: StaticArtwork;
      /** Said inline beside the downloads whenever it is not null. */
      notice: string | null;
      /** False while the colours fail the check or the logo is still loading. */
      downloadable: boolean;
    }
  | { ok: false; reason: string };

export const LOGO_FAILED_NOTICE =
  "Your logo could not be loaded, so this code is drawn without it and the downloads will not include it.";
export const LOGO_TOO_LONG_NOTICE =
  "This is too much content to fit with a logo, which needs the highest level of error correction. The code is drawn without the logo; shorten the content to add it.";
export const LOGO_LOADING_NOTICE = "Adding your logo…";
const TOO_LONG_REASON =
  "That is too much to fit in one QR code. Shorten it: emoji and accented letters take more room than plain letters.";

function encode(content: string, level: QrLevel): Geometry | null {
  try {
    return qrGeometry(content, level);
  } catch {
    // `qrcode` throws when the data exceeds the largest symbol at this level.
    return null;
  }
}

/**
 * Decide what to draw.
 *
 * A logo that failed to load, or content too long to carry one at H, falls
 * back to the plain code at M -- and says so in `notice`, never silently,
 * because the person would otherwise print artwork that differs from what
 * they chose.
 */
export function planStaticArtwork(
  content: string,
  style: StaticColours,
  logo: LogoState
): StaticPlan {
  const styleOk = checkQrStyle(style).ok;

  if (logo.status === "ready") {
    const geometry = encode(content, staticLevel(true));
    if (geometry) {
      return {
        ok: true,
        artwork: { content, style, level: staticLevel(true), geometry, logo: logo.logo },
        notice: null,
        downloadable: styleOk,
      };
    }
  }

  const geometry = encode(content, STATIC_PLAIN_LEVEL);
  if (!geometry) return { ok: false, reason: TOO_LONG_REASON };

  const notice =
    logo.status === "ready"
      ? LOGO_TOO_LONG_NOTICE
      : logo.status === "failed"
        ? LOGO_FAILED_NOTICE
        : logo.status === "loading"
          ? LOGO_LOADING_NOTICE
          : null;

  return {
    ok: true,
    artwork: { content, style, level: STATIC_PLAIN_LEVEL, geometry, logo: null },
    notice,
    // Not while loading: a download then would quietly lack the logo.
    downloadable: styleOk && logo.status !== "loading",
  };
}

/**
 * A static code's style: its two colours on the plain square design.
 *
 * Static codes are not offered patterns, corner shapes, corner colours or a
 * transparent ground. The PNG is painted module by module onto a canvas
 * (`paintStaticArtwork`), which draws squares only, so the SVG is held to the
 * same plain design and the two files stay one picture whatever the style
 * object carries.
 */
export function plainStyle(style: StaticColours): QrStyle {
  return { ...DEFAULT_QR_STYLE, dark: style.dark, light: style.light };
}

/** The artwork as a standalone SVG document; the logo is embedded, not linked. */
export function staticSvg(artwork: StaticArtwork, px: number): string {
  return renderQrSvg({
    content: artwork.content,
    style: plainStyle(artwork.style),
    px,
    level: artwork.level,
    logoHref: artwork.logo?.href,
  });
}

/**
 * The pixel size of a PNG near `target`, at a whole number of pixels per
 * module. Whole pixels keep every module edge sharp: at a fractional scale
 * neighbouring modules blur into grey seams a scanner has to see past.
 */
export function pngScale(geometry: Geometry, target: number): { scale: number; px: number } {
  const span = geometry.size + QUIET_ZONE * 2;
  const scale = Math.max(1, Math.round(target / span));
  return { scale, px: span * scale };
}

/** `preserveAspectRatio="xMidYMid meet"`: fit inside the box, centred. */
export function containRect(
  box: { x: number; y: number; side: number },
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  const ratio = Math.min(box.side / width, box.side / height);
  const w = width * ratio;
  const h = height * ratio;
  return { x: box.x + (box.side - w) / 2, y: box.y + (box.side - h) / 2, width: w, height: h };
}

/** The part of a 2D canvas context the painter uses. */
export type ArtworkCanvas<Image> = {
  fillStyle: unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: Image, x: number, y: number, width: number, height: number): void;
};

/**
 * Paint the artwork at `scale` pixels per module, the same layout
 * `renderQrSvg` writes: ground, modules, then the logo box and the logo one
 * module inside it. `image` is the decoded logo; pass null when the artwork
 * has none.
 */
export function paintStaticArtwork<Image>(
  ctx: ArtworkCanvas<Image>,
  artwork: StaticArtwork,
  scale: number,
  image: Image | null
): void {
  const { size, modules } = artwork.geometry;
  const span = size + QUIET_ZONE * 2;

  ctx.fillStyle = artwork.style.light;
  ctx.fillRect(0, 0, span * scale, span * scale);

  // One rectangle per horizontal run of dark modules, not per module: a
  // dense vCard symbol has thousands of modules.
  ctx.fillStyle = artwork.style.dark;
  for (let y = 0; y < size; y += 1) {
    let x = 0;
    while (x < size) {
      if (!modules[y * size + x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < size && modules[y * size + x]) x += 1;
      ctx.fillRect(
        (start + QUIET_ZONE) * scale,
        (y + QUIET_ZONE) * scale,
        (x - start) * scale,
        scale
      );
    }
  }

  if (artwork.logo && image) {
    const box = logoBox(size);
    const at = (box.offset + QUIET_ZONE) * scale;
    ctx.fillStyle = artwork.style.light;
    ctx.fillRect(at, at, box.side * scale, box.side * scale);
    const fit = containRect(
      { x: at + scale, y: at + scale, side: (box.side - 2) * scale },
      artwork.logo.width,
      artwork.logo.height
    );
    ctx.drawImage(image, fit.x, fit.y, fit.width, fit.height);
  }
}
