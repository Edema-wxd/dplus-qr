"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  buildStaticPayload,
  PAYPAL_CURRENCIES,
  type StaticFields,
  type StaticKind,
} from "@/lib/static-payload";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "../DashShell";
import { ContactImport } from "../ContactImport";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-[var(--paper-soft)]">{hint}</p> : null}
    </div>
  );
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

const INK = { dark: "#1A1A1AFF", light: "#FFFFFFFF" };

/**
 * A static code, built entirely in the browser.
 *
 * Nothing is posted, saved or counted -- the content never reaches the
 * server, which is also why this path needs no session check or plan limit.
 * The payload rules live in `buildStaticPayload`, which the tests pin.
 */
export function StaticCodeForm({ kind }: { kind: StaticKind }) {
  const [fields, setFields] = useState<StaticFields>({ security: "WPA", currency: "USD" });
  // Keyed by the content it was drawn for, so a stale image is never shown
  // against newer input while the next one renders.
  const [drawn, setDrawn] = useState<{ content: string; url: string } | null>(null);

  const result = buildStaticPayload(kind, fields);
  const content = result.ok ? result.content : null;
  // Say nothing until the person has typed something to be wrong about.
  const touched = Object.entries(fields).some(
    ([k, v]) => v && k !== "security" && k !== "currency" && v !== "false"
  );

  useEffect(() => {
    let live = true;
    if (!content) return;
    QRCode.toDataURL(content, { errorCorrectionLevel: "M", margin: 2, width: 512, color: INK })
      .then((url) => live && setDrawn({ content, url }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [content]);

  const preview = drawn && drawn.content === content ? drawn.url : null;

  const set =
    (name: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setFields((prev) => ({ ...prev, [name]: e.target.value }));

  const v = (name: string) => fields[name] ?? "";
  const base = `static-${kind}`;

  /** A single-line text input bound to one field. */
  const input = (
    name: string,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    hint?: string
  ) => (
    <Field id={`static-${name}`} label={label} hint={hint}>
      <input
        id={`static-${name}`}
        value={v(name)}
        onChange={set(name)}
        className={inputClass}
        {...props}
      />
    </Field>
  );

  const area = (name: string, label: string, rows = 3) => (
    <Field id={`static-${name}`} label={label}>
      <textarea
        id={`static-${name}`}
        rows={rows}
        value={v(name)}
        onChange={set(name)}
        className={inputClass}
      />
    </Field>
  );

  const urlProps = {
    type: "text",
    inputMode: "url",
    autoCapitalize: "none",
    autoCorrect: "off",
    spellCheck: false,
  } as const;
  const phoneProps = { type: "tel", inputMode: "tel", placeholder: "+234 801 234 5678" } as const;

  async function downloadSvg() {
    if (!content) return;
    const svg = await QRCode.toString(content, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
      width: 1024,
      color: INK,
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
      color: INK,
    });
    download(url, `${base}.png`);
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] lg:gap-14">
      <div className="max-w-xl space-y-4">
        {kind === "url" ? input("url", "Web address", { ...urlProps, placeholder: "your-site.com/page" }) : null}

        {kind === "text" ? area("text", "Text", 5) : null}

        {kind === "email" ? (
          <>
            {input("email", "To", { type: "email", placeholder: "hello@your-site.com" })}
            {input("subject", "Subject (optional)")}
            {area("body", "Message (optional)")}
          </>
        ) : null}

        {kind === "phone" || kind === "sms" || kind === "whatsapp"
          ? input(
              "phone",
              kind === "whatsapp" ? "WhatsApp number" : "Phone number",
              phoneProps,
              kind === "whatsapp" ? "With the country code, so it opens the right chat." : undefined
            )
          : null}

        {kind === "sms" || kind === "whatsapp" ? area("message", "Message (optional)") : null}

        {kind === "wifi" ? (
          <>
            {input("ssid", "Network name", { autoCapitalize: "none" })}
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
            {v("security") !== "nopass"
              ? input("password", "Password", { autoCapitalize: "none", autoComplete: "off" })
              : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v("hidden") === "true"}
                onChange={(e) =>
                  setFields((prev) => ({ ...prev, hidden: e.target.checked ? "true" : "false" }))
                }
              />
              Hidden network
            </label>
          </>
        ) : null}

        {kind === "vcard" ? (
          <>
            <ContactImport
              onImport={(contact) => setFields((prev) => ({ ...prev, ...contact }))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {input("firstName", "First name", { autoComplete: "off" })}
              {input("lastName", "Last name", { autoComplete: "off" })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {input("organisation", "Company (optional)")}
              {input("title", "Job title (optional)")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {input("mobile", "Mobile (optional)", phoneProps)}
              {input("phone", "Work phone (optional)", phoneProps)}
            </div>
            {input("email", "Email (optional)", { type: "email" })}
            {input("website", "Website (optional)", urlProps)}
            {input("street", "Street (optional)")}
            <div className="grid gap-4 sm:grid-cols-2">
              {input("city", "City (optional)")}
              {input("region", "State (optional)")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {input("postcode", "Postcode (optional)")}
              {input("country", "Country (optional)")}
            </div>
          </>
        ) : null}

        {kind === "paypal" ? (
          <>
            {input(
              "email",
              "PayPal account email",
              { type: "email" },
              "The account that receives the payment."
            )}
            {input("item", "What it is for", { placeholder: "Order #1042" })}
            <div className="grid gap-4 sm:grid-cols-2">
              {input("amount", "Amount (optional)", { inputMode: "decimal", placeholder: "25.00" })}
              <Field id="static-currency" label="Currency">
                <select
                  id="static-currency"
                  value={v("currency")}
                  onChange={set("currency")}
                  className={inputClass}
                >
                  {PAYPAL_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-[var(--paper-soft)]">
              PayPal does not accept payments in naira, so the amount is in the currency chosen
              here.
            </p>
          </>
        ) : null}

        {kind === "bitcoin" ? (
          <>
            {input("address", "Bitcoin address", {
              autoCapitalize: "none",
              autoCorrect: "off",
              spellCheck: false,
              className: `${inputClass} font-mono`,
            })}
            {input("amount", "Amount in BTC (optional)", { inputMode: "decimal", placeholder: "0.0015" })}
            {input("label", "Recipient name (optional)")}
            {input("message", "Message (optional)")}
          </>
        ) : null}

        {!result.ok && touched ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {result.reason}
          </p>
        ) : null}

        <p className="max-w-[56ch] text-xs leading-relaxed text-[var(--paper-soft)]">
          Static codes are not saved to your account and cannot be edited or tracked. Want to
          change it later? Choose a dynamic type instead.
        </p>
      </div>

      <div>
        <div className="flex aspect-square w-full max-w-[18rem] items-center justify-center rounded-lg border border-[var(--paper-rule)] bg-white p-4">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Preview of your static QR code"
              width={256}
              height={256}
              className="h-auto w-full"
            />
          ) : (
            <p className="px-6 text-center text-sm text-[var(--paper-soft)]">
              Your code appears here as you fill it in.
            </p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={downloadPng}
            disabled={!preview}
            className={primaryButtonClass}
          >
            Download PNG
          </button>
          <button
            type="button"
            onClick={downloadSvg}
            disabled={!preview}
            className={secondaryButtonClass}
          >
            Download SVG
          </button>
        </div>
      </div>
    </div>
  );
}
