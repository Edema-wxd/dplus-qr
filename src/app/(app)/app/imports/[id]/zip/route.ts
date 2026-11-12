import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { resolveScope } from "@/lib/resolve-scope";
import { canBulkCreate, getEntitlement } from "@/lib/entitlement";
import { getBatch, parseImportId } from "@/lib/bulk-create";
import { zipEntryName } from "@/lib/bulk-import";
import { batchCsv } from "@/lib/csv-export";
import { loadLogo } from "@/lib/logos";
import { renderArtwork, type LogoCache } from "@/lib/qr-artwork";
import { allowZipDownload } from "@/lib/ratelimit";

/**
 * Every code in one batch as a zip: each code's artwork at 1024px, SVG or
 * PNG, drawn by the same `renderArtwork` as the single download so the files
 * are identical, plus `codes.csv` listing name, short link and destination.
 *
 * Checked like every route here: the session (a matcher protects pages, not
 * data), the batch belonging to this account (another account's is a 404),
 * and the plan still including bulk creation (decided 7 Nov 2026: the zip
 * comes with the bulk plans only). Codes made one at a time are downloaded
 * from their own pages.
 *
 * Streamed, so 500 PNGs never sit in memory at once. Logos are fetched
 * before the first byte goes out: once a 200 has been sent a failure can
 * only cut the zip short, so a logo that will not load is a 503 instead,
 * exactly as the single download refuses rather than drawing without it.
 */
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;

  const scope = await resolveScope();
  if (!scope) return new Response("Not signed in", { status: 401 });

  const id = parseImportId(raw);
  if (!id) return new Response("Not found", { status: 404 });

  const [batch, entitlement] = await Promise.all([
    getBatch(scope, id),
    getEntitlement(scope.accountId),
  ]);
  if (!batch) return new Response("Not found", { status: 404 });
  if (!canBulkCreate(entitlement)) {
    return new Response("Downloading a batch as a zip is not part of your plan.", { status: 403 });
  }
  // Each download renders the whole batch, so the account gets a ceiling
  // (audit L10). Checked after the batch and plan, so a refused request
  // spends nothing.
  if (!(await allowZipDownload(scope.accountId))) {
    return new Response(
      "That is a lot of downloads for one hour. Please try again a little later.",
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } }
    );
  }

  const format = new URL(request.url).searchParams.get("format") === "png" ? "png" : "svg";

  const logos: LogoCache = new Map();
  try {
    // A preset mark is drawn from bundled outlines; only uploads are fetched.
    for (const url of new Set(batch.codes.flatMap((c) => (c.logo && !c.presetLogo ? [c.logo.url] : [])))) {
      const loaded = loadLogo(url);
      logos.set(url, loaded);
      await loaded;
    }
  } catch (error) {
    console.error("[zip] logo fetch failed", error);
    return new Response(
      "A logo in this batch could not be loaded. Please try the download again.",
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const codes = batch.codes;
  const list = batchCsv(
    codes.map((c) => ({ name: c.name, link: c.link, destination: c.destination, createdAt: c.createdAt }))
  );

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for (const code of codes) {
          const art = await renderArtwork(code, format, 1024, logos);
          const name = zipEntryName(code.name, code.shortCode, format);
          // PNG is already compressed; deflating it again costs time for nothing.
          const entry = format === "png" ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
          zip.add(entry);
          entry.push(typeof art === "string" ? strToU8(art) : new Uint8Array(art), true);
        }
        const csv = new ZipDeflate("codes.csv", { level: 6 });
        zip.add(csv);
        csv.push(strToU8(list), true);
        zip.end();
      } catch (error) {
        console.error("[zip] batch failed", error);
        zip.terminate();
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="qriateplus-batch-${batch.id}-${format}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
