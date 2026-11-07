"use client";

import { useActionState, useState } from "react";
import {
  checkBulkAction,
  createBulkAction,
  type BulkCheckState,
  type BulkCreateState,
  type PreviewRow,
} from "./actions";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { problemsCsv } from "@/lib/csv-export";
import { ACCOUNT_PIN_FIELD } from "@/lib/account-scope";
import type { UpgradeOffer } from "@/lib/upgrade-offers";
import { LogoPicker, type PickerLogo } from "../../LogoPicker";
import { LockIcon, LockedButton } from "../../UpgradePrompt";

/** What the template download holds: the columns, and one example of each type. */
const TEMPLATE = [
  "name,destination,type,link",
  "Shop window,https://example.com/menu,link,",
  "Flyer: Instagram,@yourbusiness,instagram,",
  "Flyer: Facebook,facebook.com/yourbusiness,facebook,",
].join("\r\n");

const OVER_LIMIT = "No dynamic code left on your plan for this row.";

/**
 * Bulk creation in two steps on one page: check the rows (nothing is made),
 * then confirm. Problems are shown on their own rows, inline, and stay until
 * the file is fixed and checked again; the confirm button says exactly how
 * many codes it will make and how many rows it will leave out.
 */
export function BulkForm({
  accountId,
  free,
  customLinks,
  logos,
  uploads,
  codesOffer,
}: {
  /** The account this page was drawn for; see `pinMismatch`. */
  accountId: string;
  /** Code slots left when the page loaded; the server counts again. */
  free: number;
  customLinks: boolean;
  logos: PickerLogo[];
  uploads: boolean;
  codesOffer: UpgradeOffer;
}) {
  const [checked, check, checking] = useActionState(checkBulkAction, {} as BulkCheckState);
  const [created, create, creating] = useActionState(createBulkAction, {} as BulkCreateState);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const preview = checked.preview;

  return (
    <div className="max-w-3xl space-y-10">
      <form action={check} className="space-y-5">
        <input type="hidden" name={ACCOUNT_PIN_FIELD} value={accountId} />
        <div role="group" aria-label="How to add rows" className="inline-flex rounded-md border border-[var(--paper-rule)] bg-white p-0.5">
          {(["file", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 text-xs transition-colors duration-150 ${
                mode === m
                  ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                  : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
              }`}
            >
              {m === "file" ? "Upload a CSV" : "Paste rows"}
            </button>
          ))}
        </div>

        {mode === "file" ? (
          <div>
            <label htmlFor="bulk-file" className="mb-1 block text-sm">
              CSV file
            </label>
            <input
              id="bulk-file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-[var(--paper-rule)] file:bg-white file:px-3 file:py-1.5 file:text-sm"
            />
            <p className="mt-1 text-xs text-[var(--paper-soft)]">
              Save from Excel, Numbers or Google Sheets as CSV.
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="bulk-text" className="mb-1 block text-sm">
              Rows
            </label>
            <textarea
              id="bulk-text"
              name="text"
              rows={8}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={TEMPLATE}
              className={`${inputClass} font-mono text-xs`}
            />
            <input type="hidden" name="source" value="paste" />
            <p className="mt-1 text-xs text-[var(--paper-soft)]">
              The first line names the columns. Copying cells straight from a spreadsheet works
              if you separate them with commas.
            </p>
          </div>
        )}

        <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
          Columns: <strong className="font-medium">name</strong> and{" "}
          <strong className="font-medium">destination</strong>, and optionally{" "}
          <strong className="font-medium">type</strong> (link, instagram or facebook; link if
          blank)
          {customLinks ? (
            <>
              {" "}
              and <strong className="font-medium">link</strong>, your own short link for that row
            </>
          ) : null}
          .{" "}
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
            download="qriateplus-bulk-template.csv"
            className="underline underline-offset-4"
          >
            Download a template
          </a>
          .
        </p>

        {checked.error ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {checked.error}
          </p>
        ) : null}

        <button type="submit" disabled={checking} className={secondaryButtonClass}>
          {checking ? "Checking…" : preview ? "Check again" : "Check rows"}
        </button>
      </form>

      {preview ? (
        <Preview
          key={preview.text}
          preview={preview}
          accountId={accountId}
          free={free}
          logos={logos}
          uploads={uploads}
          codesOffer={codesOffer}
          create={create}
          creating={creating}
          error={created.error}
        />
      ) : null}
    </div>
  );
}

function Preview({
  preview,
  accountId,
  free,
  logos,
  uploads,
  codesOffer,
  create,
  creating,
  error,
}: {
  preview: NonNullable<BulkCheckState["preview"]>;
  accountId: string;
  free: number;
  logos: PickerLogo[];
  uploads: boolean;
  codesOffer: UpgradeOffer;
  create: (formData: FormData) => void;
  creating: boolean;
  error?: string;
}) {
  const problems = preview.rows.filter((r) => r.reason || r.overLimit);
  const good = preview.rows.filter((r) => !r.reason && !r.overLimit);
  const skipped = preview.invalid + preview.overLimit;

  const downloadProblems = () => {
    const csv = problemsCsv(
      problems.map((r) => ({ row: r.row, name: r.name, destination: r.destination, reason: r.reason ?? OVER_LIMIT }))
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "qriateplus-rows-to-fix.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="preview-heading" className="space-y-6">
      <h2 id="preview-heading" className="font-sarlotte text-2xl leading-none">
        Before anything is made
      </h2>

      <ul className="dash-num space-y-1 text-sm" role="status">
        <li>
          <strong className="font-medium">{preview.willCreate.toLocaleString("en-NG")}</strong>{" "}
          {preview.willCreate === 1 ? "code" : "codes"} will be made.
        </li>
        {preview.invalid > 0 ? (
          <li>
            {preview.invalid.toLocaleString("en-NG")} {preview.invalid === 1 ? "row has" : "rows have"} a
            problem and will be left out.
          </li>
        ) : null}
        {preview.overLimit > 0 ? (
          <li>
            {preview.overLimit.toLocaleString("en-NG")} more {preview.overLimit === 1 ? "row is" : "rows are"}{" "}
            fine but over your plan&apos;s limit: you have {free.toLocaleString("en-NG")}{" "}
            {free === 1 ? "code" : "codes"} left, so the first rows that fit are made and these are left out.
          </li>
        ) : null}
      </ul>

      {preview.overLimit > 0 ? (
        <LockedButton offer={codesOffer} className={`${secondaryButtonClass} gap-1.5 border-dashed`}>
          <LockIcon />
          More dynamic codes
        </LockedButton>
      ) : null}

      {problems.length > 0 ? (
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--paper-rule)] pb-2">
            <h3 className="text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">Left out</h3>
            <button type="button" onClick={downloadProblems} className="text-xs underline underline-offset-4">
              Download these rows to fix
            </button>
          </div>
          <RowList rows={problems} />
        </div>
      ) : null}

      {good.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">
            {good.length === 1 ? "The code" : `The ${good.length.toLocaleString("en-NG")} codes`} that will be made
          </summary>
          <RowList rows={good} />
        </details>
      ) : null}

      <form action={create} className="space-y-6 rounded-lg border border-[var(--paper-rule)] bg-white p-4 sm:p-5">
        <input type="hidden" name="text" value={preview.text} />
        <input type="hidden" name={ACCOUNT_PIN_FIELD} value={accountId} />
        <input type="hidden" name="source" value={preview.source} />
        {uploads || logos.length > 0 ? (
          <LogoPicker logos={logos} uploads={uploads} idPrefix="bulk-logo" />
        ) : null}
        <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
          Every code starts black on white
          {uploads || logos.length > 0 ? ", with the logo above if you choose one" : ""}. You can
          restyle each code afterwards. The codes go live as soon as they are made.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={creating || preview.willCreate === 0} className={primaryButtonClass}>
          {creating
            ? "Creating…"
            : preview.willCreate === 0
              ? "Nothing to make"
              : `Create ${preview.willCreate.toLocaleString("en-NG")} ${preview.willCreate === 1 ? "code" : "codes"}${
                  skipped > 0 ? `, leave out ${skipped.toLocaleString("en-NG")}` : ""
                }`}
        </button>
      </form>
    </section>
  );
}

/** Rows as a list rather than a table, so long links wrap on a phone. */
function RowList({ rows }: { rows: PreviewRow[] }) {
  return (
    <ol>
      {rows.map((r) => (
        <li
          key={r.row}
          className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-[var(--paper-rule)] py-2.5 text-sm last:border-b-0"
        >
          <span className="dash-num row-span-3 text-xs text-[var(--paper-soft)]">Row {r.row}</span>
          <span className="truncate">{r.name || <span className="text-[var(--paper-soft)]">No name</span>}</span>
          <span className="truncate font-mono text-xs text-[var(--paper-soft)]">
            {r.destination || "No destination"}
            {r.link ? ` · ${r.link}` : ""}
          </span>
          {r.reason || r.overLimit ? (
            <span className="text-xs text-[var(--struck-ink)]">{r.reason ?? OVER_LIMIT}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
