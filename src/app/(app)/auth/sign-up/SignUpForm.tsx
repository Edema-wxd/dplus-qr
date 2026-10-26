"use client";

import { useActionState } from "react";
import { signUpAction, type SignUpState } from "./actions";
import { Field, PasswordField, FormError, SubmitButton } from "../../AuthFields";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {} as SignUpState);

  return (
    <form action={action} className="space-y-5">
      <Field
        label="Business or contact name"
        name="name"
        required
        autoComplete="organization"
      />
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
      />
      <PasswordField
        label="Password"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
        hint="At least 8 characters."
      />

      <FormError message={state.error} />

      <SubmitButton pending={pending} idle="Create account" busy="Creating account…" />
    </form>
  );
}
