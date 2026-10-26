"use client";

import { useActionState, useEffect, useState } from "react";
import { forgotPasswordAction, type ForgotState } from "./actions";
import { Field, FormError, SubmitButton } from "../../AuthFields";

const COOLDOWN_SECONDS = 30;

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, {} as ForgotState);

  if (state.sentTo) {
    // Keyed on the send time so a resend remounts the panel and its countdown
    // starts over.
    return <Sent key={state.sentAt} email={state.sentTo} action={action} pending={pending} />;
  }

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
        invalid={Boolean(state.error)}
      />
      <FormError message={state.error} />
      <SubmitButton pending={pending} idle="Send reset link" busy="Sending…" />
    </form>
  );
}

/**
 * The same answer whether or not the address holds an account, so it only says
 * what was done, never what was found.
 */
function Sent({
  email,
  action,
  pending,
}: {
  email: string;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  const [left, setLeft] = useState(COOLDOWN_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-5" role="status">
      <p className="text-base">
        If an account exists for <span className="font-medium break-all">{email}</span>, we have
        sent a link to reset its password. It works once and expires in an hour.
      </p>
      <p className="text-sm text-muted-foreground">
        Nothing there? Check your spam folder, or send it again.
      </p>
      <form action={action}>
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={pending || left > 0}
          className="flex w-full h-12 items-center justify-center rounded-lg border border-border bg-card px-4
            text-base font-medium transition-[transform,opacity] duration-150 ease-out active:scale-[0.97]
            focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dsp-blue/20
            disabled:opacity-60 disabled:active:scale-100"
        >
          {pending ? "Sending…" : left > 0 ? `Send again in ${left}s` : "Send again"}
        </button>
      </form>
    </div>
  );
}
