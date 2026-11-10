"use client";

import { useState } from "react";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { countWords } from "@/lib/blog-schema";

/**
 * The editor's small parts: labelled fields with live counters, a comma list,
 * and a list of rows staff can add to, reorder and remove.
 */

export const label = "mb-1 block text-xs text-[var(--paper-soft)]";
export const help = "mt-1 text-xs leading-relaxed text-[var(--paper-soft)]";
export const area = `${inputClass} min-h-[5.5rem] leading-relaxed`;
const iconButton =
  "inline-flex size-7 items-center justify-center rounded-md text-[var(--paper-soft)] transition-colors duration-150 hover:bg-[var(--paper-raised)] hover:text-[var(--paper-ink)] disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * A count against a target range. Soft while inside it, amber outside it
 * (worth a look, not wrong), coral only past the hard limit a save refuses.
 */
export function Counter({
  value,
  unit,
  min,
  max,
  hardMax,
}: {
  value: number;
  unit: "characters" | "words";
  min?: number;
  max?: number;
  hardMax?: number;
}) {
  const over = hardMax !== undefined && value > hardMax;
  const outside = value > 0 && ((min !== undefined && value < min) || (max !== undefined && value > max));
  const tone = over ? "text-[var(--struck-ink)]" : outside ? "text-[var(--pending-ink)]" : "text-[var(--paper-soft)]";
  const range = min !== undefined && max !== undefined ? ` (aim for ${min}–${max})` : "";
  return (
    <span className={`dash-num text-xs ${tone}`} aria-live="polite">
      {value} {unit}
      {range}
    </span>
  );
}

export function TextField({
  id,
  name,
  value,
  onChange,
  max,
  target,
  multiline = false,
  rows,
  placeholder,
  hint,
  countWordsInstead = false,
  type = "text",
  inputMode,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  target?: { min: number; max: number };
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: React.ReactNode;
  countWordsInstead?: boolean;
  type?: "text" | "url";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const count = countWordsInstead ? countWords(value) : value.length;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={label}>
          {name}
        </label>
        {target || countWordsInstead ? (
          <Counter
            value={count}
            unit={countWordsInstead ? "words" : "characters"}
            min={target?.min}
            max={target?.max}
            hardMax={countWordsInstead ? undefined : max}
          />
        ) : null}
      </div>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={area}
          maxLength={countWordsInstead ? max : undefined}
        />
      ) : (
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}
      {hint ? <p className={help}>{hint}</p> : null}
    </div>
  );
}

/**
 * A comma-separated list. The text is kept as typed, so a trailing comma
 * survives while the next item is being typed; the list is read off it on
 * every change. Give it a new `key` to load a different list.
 */
export function ListInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string;
  name: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  const [text, setText] = useState(value.join(", "));
  return (
    <div>
      <label htmlFor={id} className={label}>
        {name}
      </label>
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          onChange(
            event.target.value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          );
        }}
        className={inputClass}
      />
      {hint ? <p className={help}>{hint}</p> : null}
    </div>
  );
}

type RowField<T> = {
  key: keyof T & string;
  label: string;
  multiline?: boolean;
  type?: "text" | "url";
  placeholder?: string;
};

/**
 * Rows staff add, edit, reorder and remove: questions, steps, sources,
 * takeaways. Rows left entirely blank are dropped on save.
 */
export function RowList<T extends Record<string, string>>({
  idPrefix,
  rows,
  onChange,
  fields,
  blank,
  addLabel,
  max,
  itemName,
}: {
  idPrefix: string;
  rows: T[];
  onChange: (rows: T[]) => void;
  fields: RowField<T>[];
  blank: T;
  addLabel: string;
  max: number;
  itemName: string;
}) {
  const update = (index: number, key: keyof T, value: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {rows.length > 0 ? (
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li key={index} className="rounded-md border border-[var(--paper-rule)] bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="dash-num text-xs text-[var(--paper-soft)]">
                  {itemName} {index + 1}
                </span>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className={iconButton}
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label={`Move ${itemName.toLowerCase()} ${index + 1} up`}
                  >
                    <Arrow d="M8 12.5v-9M4 7l4-4 4 4" />
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    onClick={() => move(index, index + 1)}
                    disabled={index === rows.length - 1}
                    aria-label={`Move ${itemName.toLowerCase()} ${index + 1} down`}
                  >
                    <Arrow d="M8 3.5v9M4 9l4 4 4-4" />
                  </button>
                  <button
                    type="button"
                    className={iconButton}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    aria-label={`Remove ${itemName.toLowerCase()} ${index + 1}`}
                  >
                    <Arrow d="M4 4l8 8M12 4l-8 8" />
                  </button>
                </span>
              </div>
              <div className="space-y-2">
                {fields.map((field) => {
                  const id = `${idPrefix}-${index}-${field.key}`;
                  return (
                    <div key={field.key}>
                      <label htmlFor={id} className={label}>
                        {field.label}
                      </label>
                      {field.multiline ? (
                        <textarea
                          id={id}
                          value={row[field.key]}
                          placeholder={field.placeholder}
                          onChange={(event) => update(index, field.key, event.target.value)}
                          className={`${inputClass} min-h-[4.5rem] leading-relaxed`}
                        />
                      ) : (
                        <input
                          id={id}
                          type={field.type ?? "text"}
                          value={row[field.key]}
                          placeholder={field.placeholder}
                          onChange={(event) => update(index, field.key, event.target.value)}
                          className={inputClass}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      {rows.length < max ? (
        <button type="button" onClick={() => onChange([...rows, { ...blank }])} className={secondaryButtonClass}>
          {addLabel}
        </button>
      ) : (
        <p className={help}>That is the most this post can carry ({max}).</p>
      )}
    </div>
  );
}

function Arrow({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A panel in the editor's sidebar: a titled group, open by default. */
export function Panel({
  title,
  description,
  children,
  defaultOpen = true,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-[var(--paper-rule)] py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="font-sarlotte text-[1.2rem] leading-none">{title}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="text-[var(--paper-soft)] transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-180"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      {description ? <p className={`${help} mt-2`}>{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
