"use client";

import { useActionState } from "react";
import { secondaryButtonClass } from "@/components/controls";
import { reportAction } from "../warning-actions";
import type { AdminFormState } from "../actions";
import { ActionNote } from "../ActionNote";

/**
 * Close a report. Blocking or warning happens on the code's page; this only
 * records that the report has been dealt with, or was not a real problem.
 */
export function ReportActions({ reportId }: { reportId: number }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(reportAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="op" value="actioned" disabled={pending} className={secondaryButtonClass}>
          Mark actioned
        </button>
        <button type="submit" name="op" value="dismissed" disabled={pending} className={secondaryButtonClass}>
          Dismiss
        </button>
      </div>
      <ActionNote state={state} />
    </form>
  );
}
