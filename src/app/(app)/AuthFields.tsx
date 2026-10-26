"use client";

import { useId, useState } from "react";

/*
 * The controls the sign-in and sign-up forms share.
 *
 * Sized for a thumb: 16px text (anything smaller and iOS Safari zooms the page
 * when a field takes focus), 48px tall, and a press state on the button so the
 * tap is acknowledged before the server answers.
 */

const inputClass =
  "block w-full h-12 rounded-lg border border-border bg-card px-3.5 text-base " +
  "placeholder:text-muted-foreground/70 " +
  "transition-[border-color,box-shadow] duration-150 ease-out " +
  "focus:outline-none focus:border-foreground focus:ring-4 focus:ring-dsp-blue/20 " +
  "aria-[invalid=true]:border-dsp-red aria-[invalid=true]:focus:ring-dsp-red/20";

type FieldProps = Omit<React.ComponentProps<"input">, "id" | "className"> & {
  label: string;
  name: string;
  /** Quiet guidance under the field, tied to it for screen readers. */
  hint?: string;
  invalid?: boolean;
};

export function Field({ label, hint, invalid, ...input }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        className={inputClass}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  invalid,
  ...input
}: Omit<FieldProps, "type">) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [shown, setShown] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${inputClass} pr-12`}
          {...input}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 w-12 grid place-items-center rounded-r-lg text-muted-foreground
            transition-[color,transform] duration-150 ease-out active:scale-90
            focus-visible:outline-none focus-visible:text-foreground focus-visible:ring-4 focus-visible:ring-dsp-blue/20
            [@media(hover:hover)]:hover:text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {shown ? null : <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-dsp-red/40 bg-dsp-red/10 px-3.5 py-2.5 text-sm
        starting:opacity-0 starting:-translate-y-1 transition-[opacity,transform] duration-200 ease-out"
    >
      {message}
    </p>
  );
}

export function SubmitButton({
  pending,
  idle,
  busy,
}: {
  pending: boolean;
  idle: string;
  busy: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-4
        text-base font-medium text-background
        transition-[transform,opacity] duration-150 ease-out active:scale-[0.97]
        focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-dsp-blue/40
        disabled:opacity-70 disabled:active:scale-100"
    >
      {pending ? (
        <svg className="size-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : null}
      {pending ? busy : idle}
    </button>
  );
}
