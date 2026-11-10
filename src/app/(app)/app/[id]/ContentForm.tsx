"use client";

import { useActionState, useEffect, useState } from "react";
import { updateContentAction, type CodeState } from "../actions";
import type { PageKind } from "@/lib/qr-types";
import { primaryButtonClass } from "@/components/controls";
import { useSuccessToast } from "@/components/notify";
import { ContentEditor, type Draft } from "../ContentEditor";
import type { UpgradeOffer } from "@/lib/upgrade-offers";

/**
 * Edit a hosted page. The page-type counterpart of `DestinationForm`: the
 * printed code never changes, only what it shows.
 *
 * An upload lands in the draft, not on the page. Until "Save page" is
 * pressed the new photos exist only in this tab, so the form says it has
 * unsaved changes and the browser asks before a reload or a closed tab
 * throws them away. Owners who added photos and refreshed found them gone,
 * with nothing to say they had never been saved.
 */
export function ContentForm({
  id,
  kind,
  initial,
  uploads,
  videoUploads,
  videoOffer,
  disabled,
}: {
  id: string;
  kind: PageKind;
  initial: Draft;
  uploads: boolean;
  /** Whether the plan includes uploading video files. */
  videoUploads: boolean;
  /** What clicking the locked video upload explains, when it is locked. */
  videoOffer?: UpgradeOffer;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  // The draft as last saved, serialised as it is posted, so a change and its
  // undo compare equal and the note goes away again.
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [state, action, pending] = useActionState(
    async (previous: CodeState, formData: FormData) => {
      const next = await updateContentAction(previous, formData);
      if (next.saved) setSaved(String(formData.get("content")));
      return next;
    },
    {} as CodeState
  );
  const content = JSON.stringify(draft);
  const dirty = content !== saved;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useSuccessToast(state, "content", (s) =>
    s.saved
      ? { title: "Page saved", description: "The next person to scan sees the new page." }
      : null
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="content" value={content} />
      <fieldset disabled={disabled} className="rounded-lg border border-[var(--paper-rule)] bg-white p-4 sm:p-5">
        <legend className="px-1 text-sm">What it shows</legend>
        <ContentEditor
          kind={kind}
          value={draft}
          uploads={uploads}
          videoUploads={videoUploads}
          videoOffer={videoOffer}
          onChange={setDraft}
        />
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || disabled} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save page"}
        </button>
        {state.error ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {state.error}
          </p>
        ) : dirty ? (
          <p role="status" className="text-xs text-[var(--paper-ink)]">
            Unsaved changes. Save the page and the next person to scan sees them.
          </p>
        ) : (
          <p className="text-xs text-[var(--paper-soft)]">
            The printed code never changes. Only this does.
          </p>
        )}
      </div>
    </form>
  );
}
