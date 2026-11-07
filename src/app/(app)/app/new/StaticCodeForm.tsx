"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildStaticPayload,
  PAYPAL_CURRENCIES,
  type StaticFields,
  type StaticKind,
} from "@/lib/static-payload";
import { checkQrStyle, DEFAULT_QR_STYLE, isDefaultQrStyle, type QrStyle } from "@/lib/qr-style";
import {
  planStaticArtwork,
  staticSvg,
  type LogoState,
  type StaticLogo,
} from "@/lib/static-artwork";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { ContactImport } from "../ContactImport";
import { ColourPicker } from "../ColourPicker";
import { LogoPicker, type PickerLogo } from "../LogoPicker";
import { loadStaticLogo, renderStaticPng } from "./browser-artwork";

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

/** Download a Blob, releasing its object URL once the click has used it. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  download(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The chosen logo and where loading it has got to, keyed by its URL. */
type LogoLoad = { url: string; state: LogoState };

/**
 * A static code, built entirely in the browser.
 *
 * Nothing is posted, saved or counted -- the content never reaches the
 * server, which is also why this path needs no session check or plan limit.
 * The payload rules live in `buildStaticPayload`, which the tests pin.
 *
 * Colours and a logo work as they do on a dynamic code: the same picker
 * components, the same contrast check, the same logo box and level H with a
 * logo. They are composed by `planStaticArtwork`, which is pure and tested,
 * and drawn here. The only request this form makes is for the logo image
 * itself, from the account's own library; the content stays on the page.
 */
export function StaticCodeForm({
  kind,
  logos,
  uploads,
}: {
  kind: StaticKind;
  /** The account's logo library, loaded on the server for this session. */
  logos: PickerLogo[];
  /** False when this deployment has no UploadThing token. */
  uploads: boolean;
}) {
  const [fields, setFields] = useState<StaticFields>({ security: "WPA", currency: "USD" });
  const [style, setStyle] = useState<QrStyle>(DEFAULT_QR_STYLE);
  const [logo, setLogo] = useState<PickerLogo | null>(null);
  const [load, setLoad] = useState<LogoLoad | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Logos already brought in, so switching back to one is instant.
  const loaded = useRef(new Map<string, StaticLogo>());

  const result = buildStaticPayload(kind, fields);
  const content = result.ok ? result.content : null;
  // Say nothing until the person has typed something to be wrong about.
  const touched = Object.entries(fields).some(
    ([k, v]) => v && k !== "security" && k !== "currency" && v !== "false"
  );

  useEffect(() => {
    if (!logo) return;
    const url = logo.url;
    const cached = loaded.current.get(url);
    let live = true;
    (cached ? Promise.resolve(cached) : loadStaticLogo(url))
      .then((ready) => {
        loaded.current.set(url, ready);
        if (live) setLoad({ url, state: { status: "ready", logo: ready } });
      })
      .catch((error) => {
        console.error("[static] logo could not be loaded", error);
        if (live) setLoad({ url, state: { status: "failed" } });
      });
    return () => {
      live = false;
    };
  }, [logo, attempt]);

  // Only a load for the logo chosen now counts; until it lands, it is loading.
  const logoState: LogoState = useMemo(
    () =>
      !logo
        ? { status: "none" }
        : load && load.url === logo.url
          ? load.state
          : { status: "loading" },
    [logo, load]
  );
  const logoFailed = logoState.status === "failed";

  const plan = useMemo(
    () => (content ? planStaticArtwork(content, style, logoState) : null),
    [content, style, logoState]
  );
  const artwork = plan?.ok ? plan.artwork : null;

  // The preview is the SVG itself, so what is shown is exactly what the SVG
  // download holds, and the PNG is painted from the same geometry.
  const preview = useMemo(
    () =>
      artwork
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(staticSvg(artwork, 512))}`
        : null,
    [artwork]
  );
  const styleOk = checkQrStyle(style).ok;
  const canDownload = Boolean(plan?.ok && plan.downloadable);

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

  function downloadSvg() {
    if (!artwork || !canDownload) return;
    setDownloadError(null);
    downloadBlob(new Blob([staticSvg(artwork, 1024)], { type: "image/svg+xml" }), `${base}.svg`);
  }

  async function downloadPng() {
    if (!artwork || !canDownload) return;
    setDownloadError(null);
    try {
      downloadBlob(await renderStaticPng(artwork, 1024), `${base}.png`);
    } catch (error) {
      console.error("[static] PNG could not be drawn", error);
      setDownloadError(
        "The PNG could not be drawn in this browser. Download the SVG instead, or try again."
      );
    }
  }

  function chooseLogo(_id: string, chosen: PickerLogo | null) {
    setLogo(chosen);
    setDownloadError(null);
    // Choosing a logo again is a retry: show it loading, not the old failure.
    setLoad((previous) => (previous?.state.status === "failed" ? null : previous));
  }

  function retryLogo() {
    setLoad(null);
    setAttempt((n) => n + 1);
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
        ) : plan && !plan.ok ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {plan.reason}
          </p>
        ) : null}

        <div className="space-y-6 border-t border-[var(--paper-rule)] pt-6">
          <div>
            <ColourPicker style={style} onChange={setStyle} idPrefix="static-qr" />
            {isDefaultQrStyle(style) ? null : (
              <button
                type="button"
                onClick={() => setStyle(DEFAULT_QR_STYLE)}
                className={`${secondaryButtonClass} mt-3`}
              >
                Reset to black on white
              </button>
            )}
          </div>

          {/*
            As on a dynamic code: shown when there is anything to pick or a
            way to add something, never as a fieldset holding only "None".
          */}
          {uploads || logos.length > 0 ? (
            <LogoPicker
              logos={logos}
              uploads={uploads}
              idPrefix="static-logo"
              name="staticLogoId"
              onChange={chooseLogo}
            />
          ) : null}
        </div>

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
            disabled={!canDownload}
            className={primaryButtonClass}
          >
            Download PNG
          </button>
          <button
            type="button"
            onClick={downloadSvg}
            disabled={!canDownload}
            className={secondaryButtonClass}
          >
            Download SVG
          </button>
        </div>

        {/*
          Every reason the artwork differs from what was chosen, or cannot be
          downloaded yet, is said here beside the buttons it affects.
        */}
        <div aria-live="polite" className="mt-3 max-w-[18rem] space-y-2">
          {plan?.ok && plan.notice ? (
            <p
              key={plan.notice}
              className={`text-xs leading-relaxed ${
                logoFailed || logoState.status === "ready"
                  ? "text-[var(--struck-ink)]"
                  : "text-[var(--paper-soft)]"
              }`}
            >
              {plan.notice}{" "}
              {logoFailed ? (
                <button
                  type="button"
                  onClick={retryLogo}
                  className="underline underline-offset-4"
                >
                  Try again
                </button>
              ) : null}
            </p>
          ) : null}
          {artwork && !styleOk ? (
            <p className="text-xs leading-relaxed text-[var(--struck-ink)]">
              Pick colours that pass the contrast check to download.
            </p>
          ) : null}
          {downloadError ? (
            <p role="alert" className="text-xs leading-relaxed text-[var(--struck-ink)]">
              {downloadError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
