"use client";

import { useActionState, useState } from "react";
import type { LinkKind } from "@/lib/qr-types";
import { setLinkAction, type StepState } from "./actions";
import { obInputClass, obPrimaryClass } from "./controls";

const KINDS: Record<LinkKind, { label: string; field: string; placeholder: string; inputMode: "url" | "text" }> = {
  url: {
    label: "Website",
    field: "Web address",
    placeholder: "your-site.com/menu",
    inputMode: "url",
  },
  instagram: {
    label: "Instagram",
    field: "Instagram handle or link",
    placeholder: "@yourbusiness",
    inputMode: "text",
  },
  facebook: {
    label: "Facebook",
    field: "Facebook page name or link",
    placeholder: "facebook.com/yourbusiness",
    inputMode: "text",
  },
};

/**
 * Screen 3: where a scan goes. Three choices and one field.
 *
 * Only link codes are offered here, because every new account starts on the
 * free plan, which makes link codes. Hosted pages, menus and the rest are on
 * the dashboard's full type picker, which says what each needs.
 */
export function LinkStep({ initial }: { initial: { kind: LinkKind; destination: string } | null }) {
  const [state, action, pending] = useActionState(setLinkAction, {} as StepState);
  const [kind, setKind] = useState<LinkKind>(initial?.kind ?? "url");
  const field = KINDS[kind];

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">It opens</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--paper-rule)] bg-white p-1">
          {(Object.keys(KINDS) as LinkKind[]).map((option) => (
            <label
              key={option}
              className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 text-[15px] text-[var(--paper-soft)] transition-colors duration-150 has-[:checked]:bg-[var(--paper-ink)] has-[:checked]:text-[var(--paper)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--pin-ink)]"
            >
              <input
                type="radio"
                name="kind"
                value={option}
                checked={kind === option}
                onChange={() => setKind(option)}
                className="sr-only"
              />
              {KINDS[option].label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="onboarding-destination" className="mb-1.5 block text-sm font-medium">
          {field.field}
        </label>
        <input
          id="onboarding-destination"
          name="destination"
          type="text"
          inputMode={field.inputMode}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          autoFocus
          maxLength={2048}
          defaultValue={state.value ?? initial?.destination ?? ""}
          placeholder={field.placeholder}
          aria-invalid={state.error ? true : undefined}
          aria-describedby="onboarding-destination-hint"
          className={obInputClass}
        />
        <p id="onboarding-destination-hint" className="mt-1.5 text-sm text-[var(--paper-soft)]">
          You can change this whenever you like, even after the code is printed.
        </p>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={obPrimaryClass}>
        {pending ? "Checking the link…" : "Continue"}
      </button>
    </form>
  );
}
