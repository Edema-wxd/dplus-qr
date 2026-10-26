"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createCodeAction, type CreateCodeState } from "./actions";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./DashShell";

/**
 * Create a code.
 *
 * An inline disclosure rather than a modal: two fields and a button need
 * neither interruption nor protected focus, and a dialog here would cost a
 * focus trap, a scroll lock and an escape handler to deliver nothing.
 *
 * Opening moves focus to the first field, so the keyboard path is the same
 * length as the pointer one.
 *
 * At the plan's code limit the trigger is `aria-disabled` rather than
 * `disabled`, so the reason it cannot be pressed is reachable from the
 * keyboard. The page owns that sentence and gives it `id="code-limit-hint"`.
 */
export function NewCodeForm({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    createCodeAction,
    {} as CreateCodeState
  );
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  if (!open) {
    /*
      `aria-disabled`, not `disabled`. A disabled button is removed from the
      tab order, so the one explanation of why it cannot be pressed -- the
      plan-limit paragraph below the table -- was reachable only by a pointer
      hovering a `title`. This stays focusable, announces itself as disabled,
      and points at that paragraph, while the handler declines to open.
    */
    return (
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? "code-limit-hint" : undefined}
        className={`${primaryButtonClass} ${
          disabled ? "opacity-60" : ""
        }`.trim()}
      >
        New code
      </button>
    );
  }

  return (
    <form
      action={action}
      className="w-full rounded-lg border border-[var(--paper-rule)] bg-white p-5 text-left sm:w-[28rem]"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="new-code-name" className="mb-1 block text-sm">
            Name
          </label>
          <input
            ref={nameRef}
            id="new-code-name"
            name="name"
            required
            maxLength={80}
            placeholder="Wrap label, 5,000 run"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--paper-soft)]">
            For you, not your customers. Name it after the thing it is printed
            on.
          </p>
        </div>

        <div>
          <label htmlFor="new-code-destination" className="mb-1 block text-sm">
            Points to
          </label>
          <input
            id="new-code-destination"
            name="destinationUrl"
            type="url"
            inputMode="url"
            required
            placeholder="https://your-site.com/page"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--paper-soft)]">
            You can change this at any time without reprinting.
          </p>
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {state.error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? "Creating…" : "Create code"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
