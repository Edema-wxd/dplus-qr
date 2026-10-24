"use client";

import { useActionState } from "react";
import { cancelPlanAction, type CancelFormState } from "./actions";

/**
 * Cancelling.
 *
 * Two clicks, not one: the confirm step is not ceremony, it is the only thing
 * between a misclick and someone's printed codes being scheduled to go dark.
 * The copy states what stays true -- codes keep working for the rest of the
 * period, nothing is deleted -- because an unclear cancel button makes people
 * email support instead of using it.
 */
export function CancelPlan({ periodEndLabel }: { periodEndLabel: string | null }) {
  const [state, action, pending] = useActionState<CancelFormState, FormData>(
    cancelPlanAction,
    {}
  );

  if (state.done) {
    return (
      <p role="status" className="text-sm text-[var(--paper-soft)]">
        Your plan will not renew
        {periodEndLabel ? ` after ${periodEndLabel}` : ""}. Your codes keep working
        until then, and nothing has been deleted.
      </p>
    );
  }

  return (
    <form action={action}>
      {state.error ? (
        <p role="alert" className="mb-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}
      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--paper-soft)] underline">
          Cancel this plan
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-[var(--paper-soft)]">
            Your codes keep working
            {periodEndLabel ? ` until ${periodEndLabel}` : " until the period ends"}.
            After that they show a &ldquo;temporarily unavailable&rdquo; page. Nothing is
            deleted, and starting a plan again brings every printed code back.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="border border-[var(--paper-rule)] px-4 py-2 disabled:opacity-50"
          >
            {pending ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </details>
    </form>
  );
}
