"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptState } from "./actions";
import { FormError, SubmitButton } from "../../../AuthFields";

export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, {} as AcceptState);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <SubmitButton pending={pending} idle="Join the team" busy="Joining…" />
    </form>
  );
}
