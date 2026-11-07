"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { pinMismatch, writable, type AccountScope } from "@/lib/account-scope";
import { resolveScope } from "@/lib/resolve-scope";
import { canBulkCreate, canUseCustomCodes, getEntitlement } from "@/lib/entitlement";
import { featureRefusal } from "@/lib/refusals";
import { BULK_MAX_BYTES, checkRows, fitToSlots, readRows, type CheckedRow } from "@/lib/bulk-import";
import { createBulk } from "@/lib/bulk-create";
import { allowBulkImport } from "@/lib/ratelimit";
import { parseLogoId } from "@/lib/logos";
import { flash } from "@/lib/flash";

/**
 * Bulk creation, in two steps: check (read the rows, write nothing, show
 * every problem) and create.
 *
 * Both re-read the session, since a Server Action is an endpoint anyone can
 * post to, and both read and check the whole batch themselves. The create
 * step takes the batch text back from the check step's form, but trusts
 * nothing about it: it is parsed, screened and counted again.
 */

async function requireScope(): Promise<AccountScope> {
  const scope = await resolveScope();
  if (!scope) redirect("/auth/sign-in");
  return scope;
}

/** One row as the preview shows it. */
export type PreviewRow = {
  row: number;
  name: string;
  destination: string;
  /** Why it cannot be made; absent for a row that can. */
  reason?: string;
  /** A good row the plan has no slot left for. */
  overLimit?: boolean;
  /** The custom link it asked for, when it did. */
  link?: string | null;
};

export type BulkCheckState = {
  error?: string;
  preview?: {
    /** The batch, sent back so the create step posts exactly what was checked. */
    text: string;
    source: "csv" | "paste";
    rows: PreviewRow[];
    willCreate: number;
    invalid: number;
    overLimit: number;
  };
};

const sourceSchema = z.enum(["csv", "paste"]);

/** The batch's text from an uploaded file or the paste box. */
async function batchText(formData: FormData): Promise<{ ok: true; text: string; source: "csv" | "paste" } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > BULK_MAX_BYTES) {
      return { ok: false, error: `That file is larger than ${BULK_MAX_BYTES / 1024} KB. Split it into smaller batches.` };
    }
    return { ok: true, text: await file.text(), source: "csv" };
  }
  const pasted = formData.get("text");
  if (typeof pasted === "string" && pasted.trim() !== "") {
    const source = sourceSchema.safeParse(formData.get("source") ?? "paste");
    return { ok: true, text: pasted, source: source.success ? source.data : "paste" };
  }
  return { ok: false, error: "Choose a CSV file, or paste your rows into the box." };
}

async function checkBatch(scope: AccountScope, text: string) {
  const may = writable(scope);
  if (!may.ok) return { ok: false as const, error: may.reason };
  const entitlement = await getEntitlement(scope.accountId);
  if (!canBulkCreate(entitlement)) {
    return { ok: false as const, error: await featureRefusal("bulk_creation", entitlement) };
  }
  const read = readRows(text);
  if (!read.ok) return { ok: false as const, error: read.reason };
  const customLinks = canUseCustomCodes(entitlement);
  const rows = checkRows(read.rows, {
    customLinks,
    customRefusal: customLinks ? "" : await featureRefusal("custom_codes", entitlement),
  });
  return { ok: true as const, rows, entitlement: entitlement! };
}

export async function checkBulkAction(
  _previous: BulkCheckState,
  formData: FormData
): Promise<BulkCheckState> {
  const scope = await requireScope();
  const stale = pinMismatch(scope, formData);
  if (stale) return { error: stale };

  const input = await batchText(formData);
  if (!input.ok) return { error: input.error };

  const checked = await checkBatch(scope, input.text);
  if (!checked.ok) return { error: checked.error };

  // A preview of what fits, from the count as it stands. The create step
  // counts again under the lock, which is the number that decides.
  const free = checked.entitlement.maxCodes - checked.entitlement.codesUsed;
  const { create, overLimit } = fitToSlots(checked.rows, free);
  const over = new Set(overLimit.map((r) => r.row));

  return {
    preview: {
      text: input.text,
      source: input.source,
      rows: checked.rows.map((r: CheckedRow): PreviewRow =>
        r.ok
          ? { row: r.row, name: r.name, destination: r.destination, link: r.customCode, overLimit: over.has(r.row) }
          : { row: r.row, name: r.name, destination: r.destination, reason: r.reason }
      ),
      willCreate: create.length,
      invalid: checked.rows.filter((r) => !r.ok).length,
      overLimit: overLimit.length,
    },
  };
}

export type BulkCreateState = { error?: string };

const createSchema = z.object({
  text: z.string().min(1, "Check your rows first.").max(BULK_MAX_BYTES * 2, "That batch is too large."),
  source: sourceSchema,
  logoId: z
    .string()
    .refine((value) => value === "" || parseLogoId(value) !== null, "That logo could not be found.")
    .transform((value) => (value === "" ? null : value)),
});

export async function createBulkAction(
  _previous: BulkCreateState,
  formData: FormData
): Promise<BulkCreateState> {
  const scope = await requireScope();
  const stale = pinMismatch(scope, formData);
  if (stale) return { error: stale };

  const parsed = createSchema.safeParse({
    text: formData.get("text"),
    source: formData.get("source"),
    logoId: formData.get("logoId") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your rows first." };

  if (!(await allowBulkImport(scope.accountId))) {
    return { error: "That is a lot of batches in one hour. Please wait a little and try again." };
  }

  const checked = await checkBatch(scope, parsed.data.text);
  if (!checked.ok) return { error: checked.error };

  let result;
  try {
    result = await createBulk(scope, checked.rows, {
      source: parsed.data.source,
      logoId: parsed.data.logoId,
    });
  } catch (error) {
    console.error("[dashboard] bulk create failed", error);
    return { error: "We could not create those codes. Nothing was made. Please try again." };
  }
  if (!result.ok) return { error: result.reason };

  revalidatePath("/app");
  // Outside any try/catch: `redirect` works by throwing.
  await flash("bulk-created");
  redirect(`/app/imports/${result.importId}`);
}
