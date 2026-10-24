import QRCode from "qrcode";
import { auth } from "@/lib/auth/server";
import { getCode } from "@/lib/user-codes";
import { env } from "@/lib/env";

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
 * Error correction is Q, the level a printed code without a centred logo
 * wants. Logo-in-QR (which needs H) is not offered yet.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return new Response("Not signed in", { status: 401 });
  }

  const code = await getCode(session.user.id, id);
  if (!code) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "png" ? "png" : "svg";
  // Clamped rather than trusted: this value sizes an allocation.
  const requested = Number(url.searchParams.get("size"));
  const size = requested === 2048 ? 2048 : 1024;

  const content = `${env().QR_BASE_URL.replace(/\/$/, "")}/${code.shortCode}`;
  const filename = `${code.shortCode}.${format}`;

  const common = {
    errorCorrectionLevel: "Q" as const,
    margin: 4,
    color: { dark: "#1A1A1AFF", light: "#FFFFFFFF" },
  };

  const body =
    format === "png"
      ? await QRCode.toBuffer(content, { ...common, type: "png", width: size })
      : await QRCode.toString(content, { ...common, type: "svg", width: size });

  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": format === "png" ? "image/png" : "image/svg+xml",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Someone else's artwork must never be served from a shared cache, and
      // the owner may re-download after changing nothing but their mind.
      "Cache-Control": "private, no-store",
    },
  });
}
