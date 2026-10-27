"use client";

import { useActionState, useState } from "react";
import { setLogoAction, type CodeState } from "../actions";
import { LogoPicker, type PickerLogo } from "../LogoPicker";
import { primaryButtonClass } from "@/components/controls";

/**
 * Put a logo in the middle of this code, change it, or take it out.
 *
 * A logo moves the code to error-correction level H, which changes the grid,
 * so the copy says to re-download: artwork saved before the change still
 * scans, it simply has no logo.
 */
export function LogoForm({
  id,
  current,
  logos,
  uploads,
}: {
  id: string;
  current: string | null;
  logos: PickerLogo[];
  uploads: boolean;
}) {
  const [state, action, pending] = useActionState(setLogoAction, {} as CodeState);
  const [choice, setChoice] = useState(current ?? "");
  const dirty = choice !== (current ?? "");

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <LogoPicker
        logos={logos}
        defaultSelected={current ?? ""}
        uploads={uploads}
        idPrefix="code-logo"
        onChange={(logoId) => setChoice(logoId)}
      />
      <div className="mt-3">
        <button type="submit" disabled={pending || !dirty} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save logo"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : state.saved && !dirty ? (
        <p className="mt-2 max-w-[44ch] text-xs leading-relaxed text-[var(--paper-soft)]">
          Saved. Download the artwork again to get it: files you saved before
          still scan, they just do not have this change.
        </p>
      ) : null}
    </form>
  );
}
