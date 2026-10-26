"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction, type ResetState } from "./actions";
import { PasswordField, FormError, SubmitButton } from "../../AuthFields";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, {} as ResetState);

  if (state.invalidLink) return <InvalidLink />;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <PasswordField
        label="New password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        hint="At least 8 characters."
        invalid={Boolean(state.error)}
      />
      <FormError message={state.error} />
      <SubmitButton pending={pending} idle="Save new password" busy="Saving…" />
    </form>
  );
}

/** Expired, already used, or cut short by an email client. The fix is the same. */
export function InvalidLink() {
  return (
    <div className="space-y-5" role="alert">
      <p className="text-base">
        This reset link has expired or has already been used. Links work once and last an hour.
      </p>
      <Link
        href="/auth/forgot-password"
        className="flex w-full h-12 items-center justify-center rounded-lg bg-foreground px-4 text-base font-medium
          text-background transition-transform duration-150 ease-out active:scale-[0.97]
          focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dsp-blue/40"
      >
        Send a new link
      </Link>
    </div>
  );
}
