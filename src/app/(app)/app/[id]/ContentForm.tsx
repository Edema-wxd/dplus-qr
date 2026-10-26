"use client";

import { useActionState, useState } from "react";
import { updateContentAction, type CodeState } from "../actions";
import type { PageKind } from "@/lib/qr-types";
import { primaryButtonClass } from "../DashShell";
import { ContentEditor, type Draft } from "../ContentEditor";

/**
 * Edit a hosted page. The page-type counterpart of `DestinationForm`: the
 * printed code never changes, only what it shows.
 */
export function ContentForm({
  id,
  kind,
  initial,
  uploads,
  disabled,
}: {
  id: string;
  kind: PageKind;
  initial: Draft;
  uploads: boolean;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(updateContentAction, {} as CodeState);
  const [draft, setDraft] = useState<Draft>(initial);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="content" value={JSON.stringify(draft)} />
      <fieldset disabled={disabled} className="rounded-lg border border-[var(--paper-rule)] bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm">What it shows</legend>
        <ContentEditor kind={kind} value={draft} uploads={uploads} onChange={setDraft} />
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || disabled} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save page"}
        </button>
        {state.error ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {state.error}
          </p>
        ) : (
          <p className="text-xs text-[var(--paper-soft)]">
            {state.saved
              ? "Saved. The next person to scan sees the new page."
              : "The printed code never changes. Only this does."}
          </p>
        )}
      </div>
    </form>
  );
}
