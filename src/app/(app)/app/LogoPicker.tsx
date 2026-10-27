"use client";

import { useRef, useState, useTransition } from "react";
import { archiveLogoAction } from "./actions";
import { useUploadThing } from "./uploadthing";
import { secondaryButtonClass } from "@/components/controls";

export type PickerLogo = { id: string; url: string; name: string };

/**
 * Choose a logo from the account's library, or upload a new one into it.
 *
 * The library is the point: a logo uploaded once is offered again every time
 * the owner makes or edits a code, so a business with one mark uploads it
 * once. A new upload joins the library and is selected straight away.
 *
 * The choice is posted by the surrounding form as `name` (default `logoId`),
 * with "" meaning no logo, so this works inside any form without its own
 * submit path.
 */
export function LogoPicker({
  logos: initial,
  defaultSelected = "",
  uploads,
  idPrefix,
  name = "logoId",
  onChange,
}: {
  logos: PickerLogo[];
  defaultSelected?: string;
  /** False when this deployment has no UploadThing token. */
  uploads: boolean;
  /** Keeps radio ids unique when two pickers could share a page. */
  idPrefix: string;
  name?: string;
  /** Called with the chosen id ("" for none) and that logo's URL, for a live preview. */
  onChange?: (logoId: string, url: string | null) => void;
}) {
  const [logos, setLogos] = useState(initial);
  const [selected, setSelected] = useState(defaultSelected);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function select(id: string, url: string | null = null) {
    setSelected(id);
    onChange?.(id, url);
  }

  const { startUpload, isUploading } = useUploadThing("logo", {
    onClientUploadComplete: (results) => {
      const data = results[0]?.serverData;
      if (!data) return;
      setLogos((previous) => [
        { id: data.logoId, url: data.url, name: data.name },
        ...previous.filter((logo) => logo.id !== data.logoId),
      ]);
      select(data.logoId, data.url);
      setError(null);
    },
    onUploadError: (uploadError) => {
      setError(uploadError.message || "That upload did not finish. Please try again.");
    },
  });

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    startUpload([file]);
  }

  function remove(logo: PickerLogo) {
    startRemoving(async () => {
      const result = await archiveLogoAction(logo.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLogos((previous) => previous.filter((item) => item.id !== logo.id));
      if (selected === logo.id) select("");
    });
  }

  const option =
    "flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-[var(--paper-rule)] bg-white p-1.5 text-xs text-[var(--paper-soft)] transition-colors duration-150 hover:border-[var(--paper-soft)] peer-checked:border-[var(--paper-ink)] peer-checked:ring-1 peer-checked:ring-[var(--paper-ink)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2";

  return (
    <fieldset>
      <legend className="mb-2 block text-sm">Logo</legend>

      <div className="flex flex-wrap gap-2">
        <div>
          <input
            type="radio"
            id={`${idPrefix}-none`}
            name={name}
            value=""
            checked={selected === ""}
            onChange={() => select("")}
            className="peer sr-only"
          />
          <label htmlFor={`${idPrefix}-none`} className={option}>
            None
          </label>
        </div>

        {logos.map((logo) => (
          <div key={logo.id} className="relative">
            <input
              type="radio"
              id={`${idPrefix}-${logo.id}`}
              name={name}
              value={logo.id}
              checked={selected === logo.id}
              onChange={() => select(logo.id, logo.url)}
              className="peer sr-only"
            />
            <label htmlFor={`${idPrefix}-${logo.id}`} className={option}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logo.url}
                alt={logo.name}
                className="max-h-full max-w-full object-contain"
              />
            </label>
            <button
              type="button"
              onClick={() => remove(logo)}
              disabled={removing}
              aria-label={`Remove ${logo.name} from your library`}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--paper-rule)] bg-white text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>
        ))}

        {uploads ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className={`${secondaryButtonClass} h-16 px-3 text-xs`}
            >
              {isUploading ? "Uploading…" : "Upload"}
            </button>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {error}
        </p>
      ) : (
        <p className="mt-2 max-w-[48ch] text-xs leading-relaxed text-[var(--paper-soft)]">
          {uploads
            ? "PNG, JPEG or WebP, up to 1MB. A logo you upload stays in your library for your next code. A square mark on a plain background reads best at small sizes."
            : logos.length > 0
              ? "Pick a logo from your library."
              : "Logo uploads are not available yet."}
        </p>
      )}
    </fieldset>
  );
}
