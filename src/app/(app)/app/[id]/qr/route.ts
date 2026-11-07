import { resolveScope } from "@/lib/resolve-scope";
import { getCode, parseCodeId } from "@/lib/user-codes";
import { LogoUnavailable, renderArtwork } from "@/lib/qr-artwork";

/**
 * The downloadable artwork for one code. The drawing itself is
 * `renderArtwork` (`src/lib/qr-artwork.ts`), shared with a batch's zip.
 *
 * `proxy.ts` already covers `/app/:path*`, but the session is checked again
 * here: a matcher protects pages, not data, and this handler returns bytes
 * derived from a database row.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;

  const scope = await resolveScope();
  if (!scope) {
    return new Response("Not signed in", { status: 401 });
  }

  const id = parseCodeId(raw);
  if (!id) return new Response("Not found", { status: 404 });

  const code = await getCode(scope, id);
  if (!code) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "png" ? "png" : "svg";
  // Clamped rather than trusted: this value sizes an allocation.
  const requested = Number(url.searchParams.get("size"));
  const size = requested === 2048 ? 2048 : 1024;

  const filename = `${code.shortCode}.${format}`;
  const headers = {
    "Content-Type": format === "png" ? "image/png" : "image/svg+xml",
    "Content-Disposition": `attachment; filename="${filename}"`,
    // Someone else's artwork must never be served from a shared cache, and
    // the owner may re-download after changing nothing but their mind.
    "Cache-Control": "private, no-store",
  };

  try {
    const body = await renderArtwork(code, format, size);
    return new Response(body as BodyInit, { headers });
  } catch (error) {
    if (!(error instanceof LogoUnavailable)) throw error;
    return new Response(
      "The logo for this code could not be loaded. Please try the download again.",
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
