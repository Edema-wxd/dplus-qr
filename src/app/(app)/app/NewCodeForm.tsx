"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createCodeAction, type CreateCodeState } from "./actions";
import {
  buildStaticPayload,
  type StaticFields,
  type StaticKind,
} from "@/lib/static-payload";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./DashShell";
import { LogoPicker, type PickerLogo } from "./LogoPicker";

/**
 * Create a code.
 *
 * An inline disclosure rather than a modal: two fields and a button need
 * neither interruption nor protected focus, and a dialog here would cost a
 * focus trap, a scroll lock and an escape handler to deliver nothing.
 *
 * The first question is whether the code is static or dynamic, because the
 * answer changes everything after it. A dynamic code is a short link we host:
 * it can be re-pointed, paused and counted, and it is saved to the account. A
 * static code encodes its content directly: it is built in the browser,
 * downloaded, and never stored, so it needs no account slot -- but it can
 * never be changed or tracked once printed.
 *
 * Opening moves focus to the first choice, so the keyboard path is the same
 * length as the pointer one.
 *
 * At the plan's code limit the trigger is `aria-disabled` rather than
 * `disabled`, so the reason it cannot be pressed is reachable from the
 * keyboard. The page owns that sentence and gives it `id="code-limit-hint"`.
 */
type Mode = "choose" | "dynamic" | "static";

export function NewCodeForm({
  disabled,
  logos,
  uploads,
}: {
  disabled?: boolean;
  /** The account's logo library, offered so a logo is uploaded only once. */
  logos: PickerLogo[];
  uploads: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [state, action, pending] = useActionState(
    createCodeAction,
    {} as CreateCodeState
  );
  const firstRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "choose") firstRef.current?.focus();
    if (mode === "dynamic") nameRef.current?.focus();
  }, [open, mode]);

  function close() {
    setOpen(false);
    setMode("choose");
  }

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

  const shell =
    "w-full rounded-lg border border-[var(--paper-rule)] bg-white p-5 text-left sm:w-[28rem]";

  if (mode === "choose") {
    return (
      <div className={shell}>
        <p className="mb-3 text-sm font-medium">What kind of code?</p>
        <div className="space-y-2">
          <button
            ref={firstRef}
            type="button"
            onClick={() => setMode("dynamic")}
            className="block w-full rounded-md border border-[var(--paper-rule)] p-3 text-left hover:border-[var(--paper-soft)]"
          >
            <span className="block text-sm font-medium">Dynamic</span>
            <span className="block text-xs text-[var(--paper-soft)]">
              A short link we host. Change where it leads after printing, pause
              it, and see scans. Links only.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("static")}
            className="block w-full rounded-md border border-[var(--paper-rule)] p-3 text-left hover:border-[var(--paper-soft)]"
          >
            <span className="block text-sm font-medium">Static</span>
            <span className="block text-xs text-[var(--paper-soft)]">
              Content is baked into the pattern. Free of any account, but it
              can never be changed or tracked. Links, text, email, phone, SMS
              or Wi-Fi.
            </span>
          </button>
        </div>
        <div className="mt-4">
          <button type="button" onClick={close} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "static") {
    return (
      <StaticCodeForm
        className={shell}
        onBack={() => setMode("choose")}
        onClose={close}
      />
    );
  }

  return (
    <form action={action} className={shell}>
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
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="your-site.com/page"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--paper-soft)]">
            A web address, with or without https://. You can change this at any
            time without reprinting.
          </p>
        </div>

        {/*
          Shown when there is anything to pick or a way to add something. With
          neither, it would be a fieldset holding only "None".
        */}
        {uploads || logos.length > 0 ? (
          <LogoPicker logos={logos} uploads={uploads} idPrefix="new-code-logo" />
        ) : null}

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
            onClick={() => setMode("choose")}
            className={secondaryButtonClass}
          >
            Back
          </button>
        </div>
      </div>
    </form>
  );
}

const KIND_LABELS: Record<StaticKind, string> = {
  url: "Link",
  text: "Text",
  email: "Email",
  phone: "Phone",
  sms: "SMS",
  wifi: "Wi-Fi",
};

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      {children}
    </div>
  );
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

/**
 * Static codes are built entirely in the browser. Nothing is posted, saved or
 * counted -- the content never reaches the server, which is also why this
 * path needs no session check or plan limit.
 */
function StaticCodeForm({
  className,
  onBack,
  onClose,
}: {
  className: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<StaticKind>("url");
  const [fields, setFields] = useState<StaticFields>({ security: "WPA" });
  // Keyed by the content it was drawn for, so a stale image is never shown
  // against newer input while the next one renders.
  const [drawn, setDrawn] = useState<{ content: string; url: string } | null>(
    null
  );

  const result = buildStaticPayload(kind, fields);
  const content = result.ok ? result.content : null;
  // Say nothing until the person has typed something to be wrong about.
  const touched = Object.entries(fields).some(
    ([k, v]) => v && k !== "security" && v !== "false"
  );

  useEffect(() => {
    let live = true;
    if (!content) return;
    QRCode.toDataURL(content, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 512,
      color: { dark: "#1A1A1AFF", light: "#FFFFFFFF" },
    })
      .then((url) => live && setDrawn({ content, url }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [content]);

  const preview = drawn && drawn.content === content ? drawn.url : null;

  const set = (name: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setFields((prev) => ({ ...prev, [name]: e.target.value }));

  const v = (name: string) => fields[name] ?? "";
  const base = `static-${kind}`;

  async function downloadSvg() {
    if (!content) return;
    const svg = await QRCode.toString(content, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
      width: 1024,
      color: { dark: "#1A1A1AFF", light: "#FFFFFFFF" },
    });
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    download(url, `${base}.svg`);
    URL.revokeObjectURL(url);
  }

  async function downloadPng() {
    if (!content) return;
    const url = await QRCode.toDataURL(content, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 1024,
      color: { dark: "#1A1A1AFF", light: "#FFFFFFFF" },
    });
    download(url, `${base}.png`);
  }

  return (
    <div className={className}>
      <div className="space-y-4">
        <div role="group" aria-label="Content type" className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_LABELS) as StaticKind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full border px-3 py-1 text-sm ${
                kind === k
                  ? "border-[var(--paper-ink,#1a1a1a)] bg-[var(--paper-ink,#1a1a1a)] text-white"
                  : "border-[var(--paper-rule)]"
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>

        {kind === "url" ? (
          <Field id="static-url" label="Web address">
            <input
              id="static-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={v("url")}
              onChange={set("url")}
              placeholder="your-site.com/page"
              className={inputClass}
            />
          </Field>
        ) : null}

        {kind === "text" ? (
          <Field id="static-text" label="Text">
            <textarea
              id="static-text"
              rows={4}
              value={v("text")}
              onChange={set("text")}
              className={inputClass}
            />
          </Field>
        ) : null}

        {kind === "email" ? (
          <>
            <Field id="static-email" label="To">
              <input
                id="static-email"
                type="email"
                value={v("email")}
                onChange={set("email")}
                placeholder="hello@your-site.com"
                className={inputClass}
              />
            </Field>
            <Field id="static-subject" label="Subject (optional)">
              <input
                id="static-subject"
                value={v("subject")}
                onChange={set("subject")}
                className={inputClass}
              />
            </Field>
            <Field id="static-body" label="Message (optional)">
              <textarea
                id="static-body"
                rows={3}
                value={v("body")}
                onChange={set("body")}
                className={inputClass}
              />
            </Field>
          </>
        ) : null}

        {kind === "phone" || kind === "sms" ? (
          <Field id="static-phone" label="Phone number">
            <input
              id="static-phone"
              type="tel"
              inputMode="tel"
              value={v("phone")}
              onChange={set("phone")}
              placeholder="+234 801 234 5678"
              className={inputClass}
            />
          </Field>
        ) : null}

        {kind === "sms" ? (
          <Field id="static-message" label="Message (optional)">
            <textarea
              id="static-message"
              rows={3}
              value={v("message")}
              onChange={set("message")}
              className={inputClass}
            />
          </Field>
        ) : null}

        {kind === "wifi" ? (
          <>
            <Field id="static-ssid" label="Network name">
              <input
                id="static-ssid"
                value={v("ssid")}
                onChange={set("ssid")}
                autoCapitalize="none"
                className={inputClass}
              />
            </Field>
            <Field id="static-security" label="Security">
              <select
                id="static-security"
                value={v("security")}
                onChange={set("security")}
                className={inputClass}
              >
                <option value="WPA">WPA / WPA2 / WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">No password</option>
              </select>
            </Field>
            {v("security") !== "nopass" ? (
              <Field id="static-password" label="Password">
                <input
                  id="static-password"
                  value={v("password")}
                  onChange={set("password")}
                  autoCapitalize="none"
                  autoComplete="off"
                  className={inputClass}
                />
              </Field>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v("hidden") === "true"}
                onChange={(e) =>
                  setFields((prev) => ({
                    ...prev,
                    hidden: e.target.checked ? "true" : "false",
                  }))
                }
              />
              Hidden network
            </label>
          </>
        ) : null}

        {!result.ok && touched ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {result.reason}
          </p>
        ) : null}

        {preview ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview of your static QR code"
              width={176}
              height={176}
              className="rounded border border-[var(--paper-rule)]"
            />
            <div className="flex gap-2">
              <button type="button" onClick={downloadPng} className={primaryButtonClass}>
                Download PNG
              </button>
              <button type="button" onClick={downloadSvg} className={secondaryButtonClass}>
                Download SVG
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-[var(--paper-soft)]">
          Static codes are not saved to your account and cannot be edited or
          tracked. Want to change it later? Go back and choose dynamic.
        </p>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className={secondaryButtonClass}>
            Back
          </button>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
