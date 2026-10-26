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
