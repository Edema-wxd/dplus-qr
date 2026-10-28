"use client";

import { useActionState } from "react";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { accountAction } from "../moderation-actions";
import type { AdminFormState } from "../actions";
import { ActionNote, confirmFirst, dangerButtonClass } from "../ActionNote";

/**
 * Suspend, archive or block an account's codes. Each is reversible, which is
 * why they sit apart from erasing.
 */
export function AccountActions({
  userId,
  suspended,
  archived,
  activeCodes,
}: {
  userId: string;
  suspended: boolean;
  archived: boolean;
  /** Codes not yet blocked, so "block every code" is offered only when it would do something. */
  activeCodes: number;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(accountAction, {});

  return (
    <div className="max-w-2xl space-y-5">
      <form action={action} className="flex flex-wrap gap-2">
        <input type="hidden" name="userId" value={userId} />
        {archived ? (
          <button type="submit" name="op" value="unarchive" disabled={pending} className={secondaryButtonClass}>
            Unarchive account
          </button>
        ) : suspended ? (
          <button type="submit" name="op" value="unsuspend" disabled={pending} className={secondaryButtonClass}>
            Lift suspension
          </button>
        ) : (
          <button
            type="submit"
            name="op"
            value="suspend"
            disabled={pending}
            onClick={confirmFirst("Suspend this account? Every one of its codes shows the paused page until you lift it.")}
            className={dangerButtonClass}
          >
            Suspend
          </button>
        )}
        {archived ? null : (
          <button
            type="submit"
            name="op"
            value="archive"
            disabled={pending}
            onClick={confirmFirst(
              "Archive this account? It is suspended and every code is archived: they stop working and leave the owner's dashboard. You can unarchive it later."
            )}
            className={dangerButtonClass}
          >
            Archive account
          </button>
        )}
      </form>
      <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
        Suspending stops every code serving while the owner can still sign in to see why. Archiving also takes the
        codes off their dashboard. Unarchiving brings those codes back paused and keeps the suspension until you
        lift it.
      </p>

      {activeCodes > 0 ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="op" value="block_all" />
          <label htmlFor="block-all-reason" className="block text-xs text-[var(--paper-soft)]">
            Block all {activeCodes} unblocked {activeCodes === 1 ? "code" : "codes"} for safety. The owner sees this
            reason on each.
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <input
              id="block-all-reason"
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="e.g. Account used for a phishing campaign"
              className={`${inputClass} min-w-0 flex-1`}
            />
            <button type="submit" disabled={pending} className={dangerButtonClass}>
              Block every code
            </button>
          </div>
        </form>
      ) : null}

      <ActionNote state={state} id="account-action" />
    </div>
  );
}
