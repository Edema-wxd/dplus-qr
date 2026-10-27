import sharp from "sharp";
import { auth } from "@/lib/auth/server";
import { codeUrl } from "@/lib/brand";
import { getCode, parseCodeId } from "@/lib/user-codes";
import { loadLogo } from "@/lib/logos";
import { renderQrSvg } from "@/lib/qr-render";

/**
 * The downloadable artwork for one code.
 *
 * `proxy.ts` already covers `/app/:path*`, but the session is checked again
 * here: a matcher protects pages, not data, and this handler returns bytes
 * derived from a database row.
 *
 * The encoded content is always the code URL, never the destination. That is
 * the whole product: a symbol encoding the destination would be a static code
 * and could never be re-pointed.
 *
 * That URL comes from `codeUrl()`, the same function the dashboard renders its
 * on-screen symbol and its caption from, so what the owner sees and what they
 * download cannot encode different hosts.
 *
 * Error correction is Q, the level a printed code without a centred logo
 * wants. A code with a logo is drawn at H by `renderQrSvg`, which draws with
 * the same artwork function as the on-screen specimen and the live preview.
 *
 * The design comes from the code's saved style through `readQrStyle`, so the
 * download matches what the owner previewed. A stored style that would not
 * scan reads as the default, never as unscannable artwork.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;

  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return new Response("Not signed in", { status: 401 });
  }

  const id = parseCodeId(raw);
  if (!id) return new Response("Not found", { status: 404 });

  const code = await getCode(session.user.id, id);
  if (!code) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "png" ? "png" : "svg";
  // Clamped rather than trusted: this value sizes an allocation.
  const requested = Number(url.searchParams.get("size"));
  const size = requested === 2048 ? 2048 : 1024;

  const content = codeUrl(code.shortCode);
  const filename = `${code.shortCode}.${format}`;
  const headers = {
    "Content-Type": format === "png" ? "image/png" : "image/svg+xml",
    "Content-Disposition": `attachment; filename="${filename}"`,
    // Someone else's artwork must never be served from a shared cache, and
    // the owner may re-download after changing nothing but their mind.
    "Cache-Control": "private, no-store",
  };

  // A preset mark is drawn from bundled outlines, so only an uploaded logo
  // needs fetching.
  let logoHref: string | undefined;
  if (code.logo && !code.presetLogo) {
    // Fetched and embedded, never linked: an SVG that points at a URL loses
    // its logo the moment a print shop opens it offline.
    try {
      logoHref = `data:image/png;base64,${(await loadLogo(code.logo.url)).toString("base64")}`;
    } catch (error) {
      console.error("[qr] logo fetch failed", error);
      // Refused rather than quietly drawn without the logo, which would hand
      // the owner artwork that differs from what they previewed.
      return new Response(
        "The logo for this code could not be loaded. Please try the download again.",
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // One renderer for every download, logo or not, so a pattern, corners and
  // colours come out exactly as previewed. A transparent style leaves the
  // ground out, and the PNG keeps the transparency.
  const svg = renderQrSvg({ content, style: code.style, px: size, logoHref, presetLogo: code.presetLogo });
  const body = format === "png" ? await sharp(Buffer.from(svg)).png().toBuffer() : svg;
  return new Response(body as BodyInit, { headers });
}
