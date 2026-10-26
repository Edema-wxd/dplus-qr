"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "./actions";
import { Field, PasswordField, FormError, SubmitButton } from "../../AuthFields";

export function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, {} as SignInState);
  const failed = Boolean(state.error);

  return (
    <form action={action} className="space-y-5">
      <Field
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        invalid={failed}
      />
      <PasswordField
        label="Password"
        name="password"
        required
        autoComplete="current-password"
        invalid={failed}
      />

      <FormError message={state.error} />

      <SubmitButton pending={pending} idle="Sign in" busy="Signing in…" />
    </form>
  );
}
