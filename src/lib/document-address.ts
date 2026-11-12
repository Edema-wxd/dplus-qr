import { createHash } from "node:crypto";

/**
 * The one query string a document is served under: `?v=` a short digest of
 * the stored file URL, then `&download` when asked. Each upload has its own
 * URL, so replacing the file changes `v` and the CDN's copy of the old one
 * is never read again. A digest, not the key itself, so the address does not
 * reveal where the file lives at UploadThing.
 */
export function documentQuery(fileUrl: string, download: boolean): string {
  const version = createHash("sha256").update(fileUrl).digest("hex").slice(0, 16);
  return `?v=${version}${download ? "&download" : ""}`;
}
