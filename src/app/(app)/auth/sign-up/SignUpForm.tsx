"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUpAction, type SignUpState } from "./actions";
import { Field, PasswordField, FormError, SubmitButton } from "../../AuthFields";
import { SIGNUP_REF_PARAM } from "@/lib/signup-ref";
import { InviteField } from "../InviteField";

/**
 * Carries the code of the hosted page whose footer sent this visitor, so the
 * sign-up can be credited to it. Read from the URL, never stored: see
 * `src/lib/signup-source.ts`.
 *
 * In its own Suspense boundary because reading search params suspends the
 * prerender; the form around it stays in the static shell.
 */
function RefField() {
  const ref = useSearchParams().get(SIGNUP_REF_PARAM);
  return ref ? <input type="hidden" name={SIGNUP_REF_PARAM} value={ref} /> : null;
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {} as SignUpState);

  return (
    <form action={action} className="space-y-5">
      <Suspense fallback={null}>
        <RefField />
        <InviteField />
      </Suspense>
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
