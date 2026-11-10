"use client";

import { useActionState } from "react";
import { secondaryButtonClass } from "@/components/controls";
import { retryPaymentEventAction } from "./payment-actions";
import type { AdminFormState } from "./actions";

/** Apply one stored Paystack event again, once its cause is fixed. */
export function RetryEvent({ eventId }: { eventId: number }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(retryPaymentEventAction, {});

  if (state.notice) {
    return <span role="status" className="text-xs text-[var(--live-ink)]">{state.notice}</span>;
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="eventId" value={eventId} />
      <button type="submit" disabled={pending} className={`${secondaryButtonClass} px-2.5 py-1 text-xs`}>
        {pending ? "Retrying…" : "Retry"}
      </button>
      {state.error ? <span role="alert" className="text-xs text-[var(--struck-ink)]">{state.error}</span> : null}
    </form>
  );
}
