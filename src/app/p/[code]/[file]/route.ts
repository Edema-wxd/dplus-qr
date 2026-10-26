import { connection } from "next/server";
import { normaliseCode } from "@/lib/short-code";
import { loadPublicPage } from "@/lib/public-page";
import type { PageContent } from "@/lib/page-content";
import { buildIcs, eventInstant } from "@/lib/page-helpers";
import { buildVCard } from "@/lib/vcard";

/**
 * Files a hosted page offers: `event.ics` for an event, `contact.vcf` for a
 * profile card. Built per request from the stored content, so they always
 * match the page, and refused on the same terms the page is.
 */
export async function GET(
  _request: Request,
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

  return new Response("Not found", { status: 404 });
}
