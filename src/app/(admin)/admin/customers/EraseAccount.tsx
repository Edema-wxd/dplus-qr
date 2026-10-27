"use client";

import { useActionState } from "react";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { eraseAccountAction, removeSignInAction } from "../moderation-actions";
import type { AdminFormState } from "../actions";
import { ActionNote, dangerButtonClass } from "../ActionNote";

/**
 * The one change that cannot be undone. Typing the email is the confirmation;
 * the server checks it again, and every other rule, before anything happens.
 */
export function EraseAccount({ userId, email }: { userId: string; email: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(eraseAccountAction, {});

  return (
    <form action={action} className="max-w-2xl space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm leading-relaxed text-[var(--paper-soft)]">
        Only for a data-erasure request or a junk account. Deletes the account&apos;s scans, uploads, page content,
        destinations and profile details, and removes its sign-in. Its codes stop working for good and their
        short codes stay reserved. Billing records and this audit trail are kept. <strong>This cannot be undone.</strong>
      </p>
      <label htmlFor="erase-confirm" className="block pt-2 text-xs text-[var(--paper-soft)]">
        Type <span className="font-mono text-[var(--paper-ink)]">{email}</span> to confirm
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="erase-confirm"
          name="confirm"
          required
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" disabled={pending} className={dangerButtonClass}>
          {pending ? "Erasing…" : "Erase account"}
        </button>
      </div>
      <ActionNote state={state} />
    </form>
  );
}

/** Shown on an erased account whose Neon Auth user is still there. */
export function RetryRemoveSignIn({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(removeSignInAction, {});
  return (
    <form action={action} className="max-w-2xl">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-sm text-[var(--paper-soft)]">
        The data is erased, but the sign-in account still exists in Neon Auth.
      </p>
      <button type="submit" disabled={pending} className={`${secondaryButtonClass} mt-2`}>
        {pending ? "Removing…" : "Retry removing sign-in"}
      </button>
      <ActionNote state={state} />
    </form>
  );
}
