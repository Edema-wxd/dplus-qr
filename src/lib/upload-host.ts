/**
 * The host this app's UploadThing files are served from.
 *
 * UploadThing v7 serves each app's files from `<app-id>.ufs.sh`, and the app id
 * is part of every file URL, so this is not a secret. It is a constant rather
 * than something derived from `UPLOADTHING_TOKEN` because `next.config.ts`
 * reads it at build time, and the build must need no secrets.
 *
 * It exists to scope the image optimiser. `next/image` will only resize
 * images from hosts listed in `remotePatterns`; listing `*.ufs.sh` would let
 * anyone push any UploadThing customer's files through this deployment's
 * optimiser, on this account's bill. Listing our own app's host keeps it ours.
 *
 * If the UploadThing app ever changes, change this. Images from any other host
 * still render, just unoptimised (see `isOptimisableImage`).
 */
export const UPLOADTHING_APP_HOST = "fmctfyekk3.ufs.sh";

/** True when `next/image` is configured to optimise this URL. */
export function isOptimisableImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === UPLOADTHING_APP_HOST &&
      parsed.pathname.startsWith("/f/")
    );
  } catch {
    return false;
  }
}

/**
 * Whether a URL is one UploadThing serves files from.
 *
 * Checked before the server fetches a logo or a page file, so a route can only
 * ever be made to fetch from UploadThing, never from an address someone
 * slipped into a row. The static code form runs it too before fetching a logo
 * in the browser. v7 serves from `<app-id>.ufs.sh`; older files from
 * `utfs.io`. Wider than `isOptimisableImage` on purpose: this asks "is it an
 * UploadThing file", not "is it ours to resize".
 */
export function isUploadThingUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return url.hostname.endsWith(".ufs.sh") || url.hostname === "utfs.io";
}
