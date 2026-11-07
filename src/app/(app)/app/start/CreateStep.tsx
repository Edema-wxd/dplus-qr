"use client";

import { createContext, useActionState, useContext, useState, type CSSProperties } from "react";
import { DEFAULT_QR_STYLE } from "@/lib/qr-style";
import { FIRST_CODE_INKS } from "@/lib/onboarding-steps";
import { LogoPicker, type PickerLogo } from "../LogoPicker";
import { createFirstCodeAction, type StepState } from "./actions";
import { obInputClass, obPrimaryClass } from "./controls";

const InkContext = createContext<{ ink: string; setInk: (ink: string) => void } | null>(null);

/**
 * Holds the colour being picked, around the whole screen, so the outline on
 * the other side of the page recolours as the swatches change. It paints
 * with `--ob-ink`, so this needs no second renderer.
 */
export function InkScope({ children }: { children: React.ReactNode }) {
  const [ink, setInk] = useState<string>(DEFAULT_QR_STYLE.dark);
  return (
    <InkContext.Provider value={{ ink, setInk }}>
      <div style={{ "--ob-ink": ink } as CSSProperties}>
        {children}
      </div>
    </InkContext.Provider>
  );
}

/** Screen 4: name it, optionally colour it, and make it. */
export function CreateStep({
  suggestedName,
  logos,
  uploads,
}: {
  suggestedName: string;
  logos: PickerLogo[];
  uploads: boolean;
}) {
  const scope = useContext(InkContext);
  if (!scope) throw new Error("CreateStep must sit inside InkScope");
  const { ink, setInk } = scope;
  const [state, action, pending] = useActionState(createFirstCodeAction, {} as StepState);

  return (
    <form action={action} className="space-y-7">
      <div>
        <label htmlFor="onboarding-name" className="mb-1.5 block text-sm font-medium">
          Name
        </label>
        <input
          id="onboarding-name"
          name="name"
          required
          maxLength={80}
          defaultValue={state.value ?? suggestedName}
          aria-describedby="onboarding-name-hint"
          className={obInputClass}
        />
        <p id="onboarding-name-hint" className="mt-1.5 text-sm text-[var(--paper-soft)]">
          Only you see this. Name it after what it is printed on.
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colour</legend>
        <div className="flex flex-wrap gap-2.5">
          {FIRST_CODE_INKS.map((option) => (
            <label
              key={option.dark}
              title={option.name}
              className="relative grid size-11 cursor-pointer place-items-center rounded-full border border-[var(--paper-rule)] bg-white transition-[border-color,box-shadow] duration-150 has-[:checked]:border-[var(--paper-ink)] has-[:checked]:shadow-[0_0_0_2px_var(--paper-ink)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--pin-ink)]"
            >
              <input
                type="radio"
                name="dark"
                value={option.dark}
                checked={ink === option.dark}
                onChange={() => setInk(option.dark)}
                className="sr-only"
              />
              <span aria-hidden className="size-7 rounded-full" style={{ background: option.dark }} />
              <span className="sr-only">{option.name}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm text-[var(--paper-soft)]">
          Dark colours only, so every phone can read it. More on the code&apos;s page later.
        </p>
      </fieldset>

      {uploads || logos.length > 0 ? (
        <details className="group rounded-lg border border-[var(--paper-rule)] bg-white">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] [&::-webkit-details-marker]:hidden">
            Add your logo
            <span className="text-sm text-[var(--paper-soft)] group-open:hidden">Optional</span>
          </summary>
          <div className="border-t border-[var(--paper-rule)] p-4">
            <LogoPicker logos={logos} uploads={uploads} idPrefix="onboarding-logo" />
          </div>
        </details>
      ) : null}

      {state.error ? (
        <p role="alert" className="text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={obPrimaryClass}>
        {pending ? "Creating your code…" : "Create code"}
      </button>
    </form>
  );
}
