"use client";

import { useActionState } from "react";
import { inputClass, primaryButtonClass } from "@/components/controls";
import { assignPlanAction, type AdminFormState } from "../actions";

export type AssignablePlan = { slug: string; label: string };

/**
 * Put an account on a plan by hand. The server re-checks everything the note
 * below says, so this form is a convenience, not the rule.
 */
export function AssignPlan({
  userId,
  plans,
  currentSlug,
  paysThroughPaystack,
}: {
  userId: string;
  plans: AssignablePlan[];
  currentSlug: string | null;
  paysThroughPaystack: boolean;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(assignPlanAction, {});

  if (paysThroughPaystack) {
    return (
      <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--paper-soft)]">
        This account pays through Paystack, so its plan is changed there: cancel or change the subscription in
        Paystack and the webhook updates the account. Assigning a plan here would leave Paystack charging for the
        old one.
      </p>
    );
  }

  return (
    <form action={action} className="max-w-xl">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="assign-plan" className="mb-1 block text-xs text-[var(--paper-soft)]">
            Plan
          </label>
          <select
            key={currentSlug ?? "none"}
            id="assign-plan"
            name="planSlug"
            defaultValue={currentSlug ?? ""}
            required
            className={inputClass}
          >
            <option value="" disabled>
              Choose a plan
            </option>
            {plans.map((plan) => (
              <option key={plan.slug} value={plan.slug}>
                {plan.label}
                {plan.slug === currentSlug ? " (current)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Assigning…" : "Assign"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--paper-soft)]">
        No payment is taken. The plan runs until you assign another or the customer pays through checkout,
        which replaces it. A plan smaller than the codes they hold is refused.
      </p>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">{state.error}</p>
      ) : state.notice ? (
        <p role="status" className="mt-2 text-sm text-[var(--live-ink)]">{state.notice}</p>
      ) : null}
    </form>
  );
}
