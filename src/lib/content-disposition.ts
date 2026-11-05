/**
 * The `Content-Disposition` for a customer's file served from this host.
 *
 * `inline` opens it in the browser's own viewer, `attachment` saves it. The
 * filename is whatever the uploader's file was called, so the plain
 * `filename` parameter gets a safe ASCII copy (quotes, backslashes and
 * anything outside printable ASCII replaced) for old clients, and the real
 * name travels percent-encoded in `filename*` (RFC 6266 / RFC 5987), which
 * every current browser prefers.
 */
export function contentDisposition(
  name: string,
  download: boolean,
  extension = "pdf"
): string {
  const suffix = `.${extension}`;
  const base = name.trim() || "document";
  const full = base.toLowerCase().endsWith(suffix) ? base : `${base}${suffix}`;

  const ascii = full.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  // encodeURIComponent leaves ' ( ) * alone, and RFC 5987 does not allow them.
  const encoded = encodeURIComponent(full).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
