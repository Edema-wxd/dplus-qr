import { isUploadThingUrl } from "@/lib/upload-host";
import {
  paintStaticArtwork,
  pngScale,
  type StaticArtwork,
  type StaticLogo,
} from "@/lib/static-artwork";

/**
 * The browser half of drawing a static code: bringing a logo in, and
 * painting the PNG. What to draw is decided by the pure `static-artwork.ts`;
 * this is only the DOM work it cannot do.
 *
 * The PNG is painted on a canvas, and drawing an image from another origin
 * straight onto one "taints" it: the browser then refuses `toBlob`, so the
 * download would fail. The logo lives on UploadThing's host, so it is fetched
 * as a blob (which needs UploadThing's CORS headers), read into a data URL,
 * and from then on is same-origin data that taints nothing. The same data URL
 * is what the SVG embeds, so a print shop opening the file offline still gets
 * the logo, as with a dynamic code's download.
 *
 * Only the logo is fetched. Nothing about the code's content leaves the page.
 */

/** The size the server also normalises a dynamic code's logo to. */
const LOGO_RASTER_PX = 512;
const FETCH_TIMEOUT_MS = 10_000;

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the logo"));
    reader.readAsDataURL(blob);
  });
}

/** Decode an image URL (a data URL here) into an element a canvas can draw. */
export async function decodeImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/**
 * Turn a fetched logo into a PNG data URL no larger than `LOGO_RASTER_PX` on
 * its longer side. That keeps a 1MB upload from being copied into the SVG at
 * full size, turns a WebP into something every print tool opens, and is the
 * check that the file decodes as an image at all.
 */
export async function normaliseLogo(blob: Blob): Promise<StaticLogo> {
  if (!blob.type.startsWith("image/")) throw new Error("Logo is not an image");
  const original = await decodeImage(await readAsDataUrl(blob));
  const longer = Math.max(original.naturalWidth, original.naturalHeight);
  if (!longer) throw new Error("Logo has no size");
  const ratio = Math.min(1, LOGO_RASTER_PX / longer);
  const width = Math.max(1, Math.round(original.naturalWidth * ratio));
  const height = Math.max(1, Math.round(original.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(original, 0, 0, width, height);
  // The source is a data URL, so this cannot be tainted; if it somehow were,
  // the throw reaches the no-logo fallback rather than a failed download.
  return { href: canvas.toDataURL("image/png"), width, height };
}

/** Fetch a library logo from UploadThing and normalise it. */
export async function loadStaticLogo(url: string): Promise<StaticLogo> {
  if (!isUploadThingUrl(url)) throw new Error("Logo is not an UploadThing file");
  const response = await fetch(url, {
    mode: "cors",
    credentials: "omit",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Logo fetch failed: ${response.status}`);
  return normaliseLogo(await response.blob());
}

/** Paint the artwork on a canvas and encode it as a PNG. */
export async function renderStaticPng(artwork: StaticArtwork, target: number): Promise<Blob> {
  const { scale, px } = pngScale(artwork.geometry, target);
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const image = artwork.logo ? await decodeImage(artwork.logo.href) : null;
  paintStaticArtwork(ctx, artwork, scale, image);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
      "image/png"
    )
  );
}
