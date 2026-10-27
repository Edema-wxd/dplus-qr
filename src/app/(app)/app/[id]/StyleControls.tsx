"use client";

import { createContext, useActionState, useContext, useState } from "react";
import {
  DEFAULT_QR_STYLE,
  checkQrStyle,
  isDefaultQrStyle,
  sameQrStyle,
  type QrStyle,
} from "@/lib/qr-style";
import type { QrMatrix } from "@/lib/qr-artwork";
import type { PresetLogoId } from "@/lib/preset-logos";
import { setStyleAction, type CodeState } from "../actions";
import { primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { DesignFields, DesignPreview } from "../DesignPanel";

/**
 * Live design preview for the code page.
 *
 * The scope holds the style being previewed, so the specimen in one column
 * redraws as the form in the other changes. The specimen draws from the
 * matrix the server encoded for this code, with the same function the
 * download uses: what the owner previews is what they print.
 */
type Scope = { style: QrStyle; setStyle: (style: QrStyle) => void };

const StyleContext = createContext<Scope | null>(null);

function useScope(): Scope {
  const scope = useContext(StyleContext);
  if (!scope) throw new Error("Design controls must sit inside StyleScope");
  return scope;
}

export function StyleScope({
  initial,
  className,
  children,
}: {
  initial: QrStyle;
  className?: string;
  children: React.ReactNode;
}) {
  const [style, setStyle] = useState(initial);
  return (
    <StyleContext.Provider value={{ style, setStyle }}>
      <div className={className}>{children}</div>
    </StyleContext.Provider>
  );
}

/** The code's specimen, in the style being previewed. */
export function LiveSymbol({
  matrix,
  logoUrl,
  presetLogo,
  title,
}: {
  matrix: QrMatrix;
  logoUrl?: string | null;
  presetLogo?: PresetLogoId | null;
  title: string;
}) {
  const { style } = useScope();
  return (
    <DesignPreview
      matrix={matrix}
      style={style}
      logoUrl={logoUrl}
      presetLogo={presetLogo}
      px={248}
      title={title}
      className="mx-auto block h-auto w-full max-w-[248px]"
    />
  );
}

/**
 * The design form. The colour check here is the one the Server Action runs
 * again, so the form refuses exactly what the server would, before a round
 * trip. It is a convenience; the server's check is the one that counts.
 */
export function StyleForm({ id, saved, matrix }: { id: string; saved: QrStyle; matrix: QrMatrix }) {
  const { style, setStyle } = useScope();
  const [state, action, pending] = useActionState(setStyleAction, {} as CodeState);

  const ok = checkQrStyle(style).ok;
  const dirty = !sameQrStyle(style, saved);

  // The style the last save was about. A server message describes that
  // style, so it is hidden as soon as the owner changes anything.
  const [submitted, setSubmitted] = useState<QrStyle | null>(null);
  const current = submitted !== null && sameQrStyle(submitted, style);

  return (
    <form action={action} onSubmit={() => setSubmitted(style)}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="style" value={JSON.stringify(style)} />
      <DesignFields style={style} onChange={setStyle} matrix={matrix} idPrefix="code-design" />

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !dirty || !ok} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save design"}
        </button>
        {dirty ? (
          <button type="button" onClick={() => setStyle(saved)} className={secondaryButtonClass}>
            Undo changes
          </button>
        ) : null}
        {isDefaultQrStyle(style) ? null : (
          <button type="button" onClick={() => setStyle(DEFAULT_QR_STYLE)} className={secondaryButtonClass}>
            Reset to plain black on white
          </button>
        )}
      </div>

      {state.error && current ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : (
        <p className="mt-2 max-w-[48ch] text-xs leading-relaxed text-[var(--paper-soft)]">
          {dirty
            ? "Previewing. Downloads use the saved design until you save."
            : state.saved
              ? "Saved. Downloads now use this design."
              : "The design changes the artwork only. Codes already printed keep working whatever you pick here."}
        </p>
      )}
    </form>
  );
}
