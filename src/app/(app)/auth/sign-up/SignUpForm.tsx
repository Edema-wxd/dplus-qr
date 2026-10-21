"use client";

import { useActionState } from "react";
import { signUpAction, type SignUpState } from "./actions";
import { fieldClass, buttonClass } from "../../AuthShell";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, {} as SignUpState);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm mb-1">
          Business or contact name
        </label>
        <input id="name" name="name" required autoComplete="organization" className={fieldClass} />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldClass}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-dsp-red">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
