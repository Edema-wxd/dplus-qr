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
  contrastRatio,
  DEFAULT_QR_STYLE,
  isDefaultQrStyle,
  qrStyleVars,
  type QrStyle,
} from "@/lib/qr-style";
import { setStyleAction, type CodeState } from "../actions";
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
  const ratio = contrastRatio(style.dark, style.light);
  const dirty = style.dark !== saved.dark || style.light !== saved.light;
  const message = check.ok
    ? `Contrast ${ratio.toFixed(1)}:1. This will scan once printed.`
    : check.reason;

  // The pair the last save was about. A server message describes those
  // colours, so it is hidden as soon as the owner picks different ones rather
  // than sitting under a pair it no longer applies to.
  const [submitted, setSubmitted] = useState<QrStyle | null>(null);
  const current =
    submitted !== null && submitted.dark === style.dark && submitted.light === style.light;

  // `<input type="color">` reports lowercase; the stored form is uppercase.
  const pick = (key: keyof QrStyle) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setStyle({ ...style, [key]: event.target.value.toUpperCase() });

  return (
    <form action={action} onSubmit={() => setSubmitted(style)}>
      <input type="hidden" name="id" value={id} />
      <fieldset>
        <legend className="mb-2 block text-sm">Colours</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <ColourField
            id="qr-dark"
            name="dark"
            label="Code"
            value={style.dark}
            onChange={pick("dark")}
          />
          <ColourField
            id="qr-light"
            name="light"
            label="Background"
            value={style.light}
            onChange={pick("light")}
          />
        </div>
      </fieldset>

      {/*
        The live region persists so screen readers keep announcing it; the
        line inside is keyed on its text, so each change inserts a new node
        rather than editing one in place. Safari, with its colour panel open,
        repainted the recoloured specimen but left an edited text node showing
        the old message.
      */}
      <div aria-live="polite" className="mt-3">
        <p
          key={message}
          className={`text-xs leading-relaxed ${
            check.ok ? "text-[var(--paper-soft)]" : "text-[var(--struck-ink)]"
          }`}
        >
          {message}
        </p>
      </div>

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

function ColourField({
  id,
  name,
  label,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 text-sm">
      <input
        id={id}
        name={name}
        type="color"
        value={value.toLowerCase()}
        onChange={onChange}
        className="h-9 w-11 cursor-pointer rounded-md border border-[var(--paper-rule)] bg-white p-1"
      />
      <span>
        {label}
        <span className="dash-num block font-mono text-xs text-[var(--paper-soft)]">
          {value}
        </span>
      </span>
    </label>
  );
}
