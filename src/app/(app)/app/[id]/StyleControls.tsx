"use client";

import {
  createContext,
  useActionState,
  useContext,
  useState,
  type CSSProperties,
} from "react";
import {
  checkQrStyle,
  DEFAULT_QR_STYLE,
  isDefaultQrStyle,
  qrStyleVars,
  type QrStyle,
} from "@/lib/qr-style";
import { setStyleAction, type CodeState } from "../actions";
import { ColourPicker } from "../ColourPicker";
import { primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { useSuccessToast } from "@/components/notify";

/**
 * Live colour preview for the code page.
 *
 * The specimen is rendered on the server and paints with CSS custom
 * properties, so previewing a change needs no second QR encoder in the
 * browser: this scope sets the properties on a wrapper and the server-rendered
 * symbol inside it recolours as the owner picks. The form below reads and
 * writes the same state.
 */
type Scope = { style: QrStyle; setStyle: (style: QrStyle) => void };

const StyleContext = createContext<Scope | null>(null);

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
      <div className={className} style={qrStyleVars(style) as CSSProperties}>
        {children}
      </div>
    </StyleContext.Provider>
  );
}

/**
 * Pick the code's colours.
 *
 * The contrast check here is the same function the Server Action runs, so the
 * form refuses exactly what the server would refuse, before a round trip. It
 * is a convenience; the server's check is the one that counts.
 */
export function StyleForm({ id, saved }: { id: string; saved: QrStyle }) {
  const scope = useContext(StyleContext);
  if (!scope) throw new Error("StyleForm must sit inside StyleScope");
  const { style, setStyle } = scope;

  const [state, action, pending] = useActionState(
    setStyleAction,
    {} as CodeState
  );
  useSuccessToast(state, "style", (s) =>
    s.saved
      ? { title: "Colours saved", description: "Downloads now use these colours." }
      : null
  );

  const check = checkQrStyle(style);
  const dirty = style.dark !== saved.dark || style.light !== saved.light;

  // The pair the last save was about. A server message describes those
  // colours, so it is hidden as soon as the owner picks different ones rather
  // than sitting under a pair it no longer applies to.
  const [submitted, setSubmitted] = useState<QrStyle | null>(null);
  const current =
    submitted !== null && submitted.dark === style.dark && submitted.light === style.light;

  return (
    <form action={action} onSubmit={() => setSubmitted(style)}>
      <input type="hidden" name="id" value={id} />
      <ColourPicker style={style} onChange={setStyle} />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending || !dirty || !check.ok}
          className={primaryButtonClass}
        >
          {pending ? "Saving…" : "Save colours"}
        </button>
        {isDefaultQrStyle(style) ? null : (
          <button
            type="button"
            onClick={() => setStyle(DEFAULT_QR_STYLE)}
            className={secondaryButtonClass}
          >
            Reset to black on white
          </button>
        )}
      </div>

      {state.error && current ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : (
        <p className="mt-2 max-w-[44ch] text-xs leading-relaxed text-[var(--paper-soft)]">
          {dirty
            ? "Previewing. Downloads use the saved colours until you save."
            : "Colours change the artwork only. Codes already printed keep working whatever you pick here."}
        </p>
      )}
    </form>
  );
}
