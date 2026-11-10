"use client";

import { useActionState } from "react";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { codeAction } from "../moderation-actions";
import type { AdminFormState } from "../actions";
import { ActionNote, confirmFirst, dangerButtonClass } from "../ActionNote";

/**
 * What staff can do to one code, offered only where it applies. The server
 * re-checks each state itself, so a stale page can offer a button that is
 * then refused with a reason, never one that does the wrong thing.
 */
export function CodeActions({
  codeId,
  status,
  archived,
  ownerGone,
}: {
  codeId: number;
  status: "active" | "paused" | "blocked";
  archived: boolean;
  /** The owner's account is archived or erased, so an archived code stays archived. */
  ownerGone: boolean;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(codeAction, {});

  return (
    <div className="max-w-2xl space-y-5">
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="codeId" value={codeId} />
        {status === "blocked" ? (
          <button type="submit" name="op" value="unblock" disabled={pending} className={secondaryButtonClass}>
            {archived ? "Unblock" : "Unblock and put live"}
          </button>
        ) : null}
        {!archived && status === "active" ? (
          <button type="submit" name="op" value="pause" disabled={pending} className={secondaryButtonClass}>
            Pause
          </button>
        ) : null}
        {!archived && status === "paused" ? (
          <button type="submit" name="op" value="resume" disabled={pending} className={secondaryButtonClass}>
            Resume
          </button>
        ) : null}
        <button type="submit" name="op" value="rescreen" disabled={pending} className={secondaryButtonClass}>
          Re-screen destination
        </button>
        {archived ? (
          ownerGone ? null : (
            <button type="submit" name="op" value="unarchive" disabled={pending} className={secondaryButtonClass}>
              Unarchive
            </button>
          )
        ) : (
          <button
            type="submit"
            name="op"
            value="archive"
            disabled={pending}
            onClick={confirmFirst(
              "Archive this code? It stops working, answers as an unknown code, and leaves the owner's dashboard. You can unarchive it later."
            )}
            className={dangerButtonClass}
          >
            Archive
          </button>
        )}
      </form>

      {status !== "blocked" ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="codeId" value={codeId} />
          <input type="hidden" name="op" value="block" />
          <label htmlFor="block-reason" className="block text-xs text-[var(--paper-soft)]">
            Block for safety. The owner sees this reason; scanners see only that the link is disabled.
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <input
              id="block-reason"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="e.g. Phishing page imitating a bank login"
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button type="submit" disabled={pending} className={dangerButtonClass}>
              {pending ? "Working…" : "Block"}
            </button>
          </div>
        </form>
      ) : null}

      <ActionNote state={state} id="code-action" />
    </div>
  );
}
