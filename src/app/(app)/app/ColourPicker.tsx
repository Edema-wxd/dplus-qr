"use client";

import { checkQrStyle, contrastRatio, type QrStyle } from "@/lib/qr-style";

/**
 * The two colour inputs a code is drawn in, and what the contrast check says
 * about the pair.
 *
 * Shared by the dynamic code page (`StyleForm`, which saves the pair through
 * a Server Action) and the static code form (which never saves anything), so
 * both run `checkQrStyle` and say the same thing about the same pair. The
 * inputs carry `name="dark"` and `name="light"`, which is what `StyleForm`
 * posts; outside a form they are inert.
 */
export function ColourPicker({
  style,
  onChange,
  idPrefix = "qr",
}: {
  style: QrStyle;
  onChange: (style: QrStyle) => void;
  /** Keeps input ids unique if two pickers could share a page. */
  idPrefix?: string;
}) {
  const check = checkQrStyle(style);
  const ratio = contrastRatio(style.dark, style.light);
  const message = check.ok
    ? `Contrast ${ratio.toFixed(1)}:1. This will scan once printed.`
    : check.reason;

  // `<input type="color">` reports lowercase; the stored form is uppercase.
  const pick = (key: keyof QrStyle) => (event: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...style, [key]: event.target.value.toUpperCase() });

  return (
    <>
      <fieldset>
        <legend className="mb-2 block text-sm">Colours</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <ColourField
            id={`${idPrefix}-dark`}
            name="dark"
            label="Code"
            value={style.dark}
            onChange={pick("dark")}
          />
          <ColourField
            id={`${idPrefix}-light`}
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
    </>
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
