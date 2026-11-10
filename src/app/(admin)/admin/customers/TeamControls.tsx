"use client";

import { useActionState } from "react";
import { teamAction } from "../moderation-actions";
import type { AdminFormState } from "../actions";
import { ActionNote, confirmFirst } from "../ActionNote";

/** Remove someone from this account's team, or cancel an invitation. Staff never add. */
export function TeamControl({
  accountId,
  op,
  targetId,
  label,
  confirm,
}: {
  accountId: string;
  op: "remove-member" | "revoke-invite";
  targetId: string;
  label: string;
  confirm: string;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(teamAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name={op === "remove-member" ? "memberId" : "inviteId"} value={targetId} />
      <button
        type="submit"
        disabled={pending}
        onClick={confirmFirst(confirm)}
        className="text-sm text-[var(--struck-ink)] underline underline-offset-4"
      >
        {label}
      </button>
      <ActionNote state={state} id={`team-${op}-${targetId}`} />
    </form>
  );
}
