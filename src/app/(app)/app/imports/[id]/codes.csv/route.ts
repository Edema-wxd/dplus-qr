import { resolveScope } from "@/lib/resolve-scope";
import { getBatch, parseImportId } from "@/lib/bulk-create";
import { batchCsv, csvResponse } from "@/lib/csv-export";

/**
 * A batch's codes as a spreadsheet: name, short link, destination, created.
 * The owner's own codes and nothing more, so it comes with the batch on any
 * plan, unlike the zip. Session and ownership checked here, as in every
 * route under `/app`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;

  const scope = await resolveScope();
  if (!scope) return new Response("Not signed in", { status: 401 });

  const id = parseImportId(raw);
  if (!id) return new Response("Not found", { status: 404 });

  const batch = await getBatch(scope, id);
  if (!batch) return new Response("Not found", { status: 404 });

  return csvResponse(
    batchCsv(batch.codes.map((c) => ({ name: c.name, link: c.link, destination: c.destination, createdAt: c.createdAt }))),
    `qriateplus-batch-${batch.id}.csv`
  );
}
