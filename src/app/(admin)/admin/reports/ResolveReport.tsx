"use client";

import { useActionState } from "react";
import { secondaryButtonClass } from "@/components/controls";
import { reportAction } from "../moderation-actions";
import type { AdminFormState } from "../actions";

const smallButton = `${secondaryButtonClass} px-2.5 py-1 text-xs`;

/**
 * Close one report without touching the code. Blocking or archiving the code
 * closes its reports by itself, so these two are for the other outcomes.
 */
export function ResolveReport({ reportId }: { reportId: number }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(reportAction, {});

  if (state.notice) {
    return <span role="status" className="text-xs text-[var(--live-ink)]">{state.notice}</span>;
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="reportId" value={reportId} />
      <button
        type="submit"
        name="resolution"
        value="dismissed"
        disabled={pending}
        title="The report did not hold up. The code stays as it is."
        className={smallButton}
      >
        Dismiss
      </button>
      <button
        type="submit"
        name="resolution"
        value="actioned"
        disabled={pending}
        title="Dealt with another way, such as the owner fixing the destination."
        className={smallButton}
      >
        Mark handled
      </button>
      {state.error ? <span role="alert" className="text-xs text-[var(--struck-ink)]">{state.error}</span> : null}
    </form>
  );
}
