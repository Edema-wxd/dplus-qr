import { connection } from "next/server";
import { normaliseCode } from "@/lib/short-code";
import { loadPublicPage } from "@/lib/public-page";
import type { PageContent } from "@/lib/page-content";
import { buildIcs, eventInstant } from "@/lib/page-helpers";
import { buildVCard } from "@/lib/vcard";
import { isUploadThingUrl } from "@/lib/logos";
import { contentDisposition } from "@/lib/content-disposition";

/**
 * Files a hosted page offers: `event.ics` for an event, `contact.vcf` for a
 * profile card, and `document` for a PDF page. Built or fetched per request
 * from the stored content, so they always match the page, and refused on the
 * same terms the page is: a paused or blocked code's document is gone too.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string; file: string }> }
) {
  await connection();
  const { code: raw, file } = await params;
  const code = normaliseCode(raw);
  if (!code) return new Response("Not found", { status: 404 });

  let page;
  try {
    page = await loadPublicPage(code);
  } catch (error) {
    console.error("[page] file load failed", error);
    return new Response("Unavailable", { status: 503 });
  }
  if (page.state !== "page") return new Response("Not found", { status: 404 });

  const headers = { "Cache-Control": "no-store" };

  if (file === "event.ics" && page.kind === "event") {
    const c = page.content as PageContent<"event">;
    const body = buildIcs({
      uid: `${code}@qriateplus.com`,
      title: c.title,
      start: eventInstant(c.start, c.utcOffset),
      end: c.end ? eventInstant(c.end, c.utcOffset) : null,
      location: c.location,
      description: c.description,
      url: c.link || undefined,
    });
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${code}.ics"`,
      },
    });
  }

  if (file === "contact.vcf" && page.kind === "profile") {
    const c = page.content as PageContent<"profile">;
    const body = buildVCard({
      fullName: c.name,
      organisation: c.company,
      title: c.title,
      mobile: c.mobile.replace(/[\s().-]/g, ""),
      email: c.email,
      website: c.website,
      street: c.address,
      note: c.bio,
    });
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type": "text/vcard; charset=utf-8",
        "Content-Disposition": `attachment; filename="${code}.vcf"`,
      },
    });
  }

  if (file === "document" && page.kind === "pdf") {
    const c = page.content as PageContent<"pdf">;
    const download = new URL(request.url).searchParams.has("download");
    return documentResponse(c.file.url, c.file.name || `${code}.pdf`, download);
  }

  return new Response("Not found", { status: 404 });
}

/**
 * A PDF page's file, served from this host.
 *
 * This is the document's permanent address. The UploadThing URL behind it is
 * different for every upload, so a link to that breaks the moment the owner
 * replaces the file; `/p/{code}/document` always serves whichever file the
 * page holds now. It is also what the in-page viewer reads, same-origin, so
 * no cross-origin fetch is involved.
 *
 * Streamed, not buffered: a 16MB PDF passes through without being held in
 * memory. The type is set here rather than copied from UploadThing, and
 * `nosniff` stops a browser second-guessing it, so a file is only ever
 * treated as a PDF, whatever bytes it holds.
 */
async function documentResponse(url: string, name: string, download: boolean): Promise<Response> {
  // Every stored file URL came from an UploadThing callback; checked again so
  // a tampered row cannot make this route fetch an internal address.
  if (!isUploadThingUrl(url)) return new Response("Not found", { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(url, { cache: "no-store" });
  } catch (error) {
    console.error("[page] document fetch failed", error);
    return new Response("Unavailable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    console.error("[page] document fetch answered", upstream.status);
    return new Response("Unavailable", { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Content-Disposition": contentDisposition(name, download),
    // A replaced file must reach the next reader at once.
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, { headers });
}
