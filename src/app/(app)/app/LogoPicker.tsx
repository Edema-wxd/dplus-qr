"use client";

import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveLogoAction } from "./actions";
import { useUploadThing } from "./uploadthing";
import { UPLOAD_LIMITS, checkPicked, clientUploadMessage } from "@/lib/upload-limits";
import { secondaryButtonClass } from "@/components/controls";
import { PRESET_LOGOS, PRESET_PREFIX, presetLogo } from "@/lib/preset-logos";

export type PickerLogo = { id: string; url: string; name: string };

/**
 * Choose a logo from the account's library, or upload a new one into it.
 *
 * The library is the point: a logo uploaded once is offered again every time
 * the owner makes or edits a code, so a business with one mark uploads it
 * once. A new upload joins the library and is selected straight away.
 *
 * Ready-made platform marks are offered first where `presets` is set (a
 * dynamic code's create form and its page), and need no upload. Bulk creation
 * and static codes take an uploaded logo only, so they leave it off.
 *
 * The choice is posted by the surrounding form as `name` (default `logoId`):
 * "" for no logo, an uploaded logo's id, or `preset:<name>`. So this works
 * inside any form without its own submit path.
 */
export function LogoPicker({
  logos: initial,
  defaultSelected = "",
  uploads,
  idPrefix: prefix,
  name = "logoId",
  presets = false,
  onChange,
}: {
  logos: PickerLogo[];
  defaultSelected?: string;
  /** False when this deployment has no UploadThing token. */
  uploads: boolean;
  /** Names the picker in its radio ids, which `useId` then makes unique. */
  idPrefix: string;
  name?: string;
  /** Offer the ready-made marks, posted as `preset:<name>`. */
  presets?: boolean;
  /**
   * Called with the chosen value ("" for none, `preset:<name>` for a mark)
   * and the uploaded logo itself, if it is one, so a caller
   * that draws in the browser has the URL of one uploaded a moment ago, before
   * this picker's own list has re-rendered with it.
   */
  onChange?: (logoId: string, logo: PickerLogo | null) => void;
}) {
  // Unique per instance, not just per picker kind. Next keeps up to three
  // visited pages mounted but hidden (Cache Components' `<Activity>`), so two
  // pickers can share the document: with a fixed id, a label's `htmlFor`
  // resolved to whichever radio came first, possibly on a hidden page, and a
  // click chose a logo for a code other than the one on screen.
  const idPrefix = `${prefix}${useId()}`;
  const [logos, setLogos] = useState(initial);
  // Only a tap here chooses a logo. The radios are `autoComplete="off"`
  // because a browser that restores a page's form state (Safari does when
  // iOS reloads a tab) matches controls by position, not by meaning: every
  // React form here posts to the same placeholder action, so a logo checked in
  // one form (another code's logo) could be restored into the new-code form,
  // and React adopts restored state on hydration. That is how a new code came
  // out with a logo nobody picked for it. "autocomplete=off" is what makes
  // both WebKit and Chromium skip a control when saving and restoring state.
  const [selected, setSelected] = useState(defaultSelected);
  const [error, setError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function select(logo: PickerLogo | null) {
    choose(logo?.id ?? "", logo);
  }

  function choose(value: string, logo: PickerLogo | null) {
    setSelected(value);
    onChange?.(value, logo);
  }

  const { startUpload, isUploading } = useUploadThing("logo", {
    onClientUploadComplete: (results) => {
      const data = results[0]?.serverData;
      // The server records a logo only once it decodes as an image, and a
      // refusal there cannot carry a message back; no data is how it shows.
      if (!data) {
        setError("That logo could not be saved. Check it is a PNG, JPEG or WebP image, then try again.");
        return;
      }
      const added = { id: data.logoId, url: data.url, name: data.name };
      setLogos((previous) => [added, ...previous.filter((logo) => logo.id !== data.logoId)]);
      select(added);
      setError(null);
      toast.success("Logo uploaded", {
        id: "logo-library",
        description: "It is selected, and stays in your library for your next code.",
      });
    },
    onUploadError: (uploadError) => {
      setError(clientUploadMessage(uploadError));
    },
  });

  function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const { accepted, problem } = checkPicked("logo", [file], 1);
    setError(problem);
    if (accepted.length) startUpload(accepted);
  }

  function remove(logo: PickerLogo) {
    startRemoving(async () => {
      const result = await archiveLogoAction(logo.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLogos((previous) => previous.filter((item) => item.id !== logo.id));
      if (selected === logo.id) select(null);
      toast.success("Logo removed from your library", {
        id: "logo-library",
        description: "Codes already drawn with it keep it.",
      });
    });
  }

  const option =
    "flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-[var(--paper-rule)] bg-white p-1.5 text-xs text-[var(--paper-soft)] transition-colors duration-150 hover:border-[var(--paper-soft)] peer-checked:border-[var(--paper-ink)] peer-checked:ring-1 peer-checked:ring-[var(--paper-ink)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2";

  return (
    <fieldset>
      <legend className="mb-2 block text-sm">Logo</legend>

      {presets ? (
        <>
          <p className="mb-1.5 text-xs text-[var(--paper-soft)]">Ready-made</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESET_LOGOS.map((id) => {
              const mark = presetLogo(id);
              const value = `${PRESET_PREFIX}${id}`;
              return (
                <div key={id}>
                  <input
                    type="radio"
                    id={`${idPrefix}-preset-${id}`}
                    name={name}
                    value={value}
                    checked={selected === value}
                    onChange={() => choose(value, null)}
                    autoComplete="off"
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={`${idPrefix}-preset-${id}`}
                    title={mark.label}
                    className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-[var(--paper-rule)] bg-white transition-colors duration-150 hover:border-[var(--paper-soft)] peer-checked:border-[var(--paper-ink)] peer-checked:ring-1 peer-checked:ring-[var(--paper-ink)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                  >
                    <svg viewBox="0 0 32 32" width="30" height="30" role="img" aria-label={mark.label}>
                      <circle cx="16" cy="16" r="16" fill={mark.hex} />
                      <svg x="6.4" y="6.4" width="19.2" height="19.2" viewBox="0 0 24 24">
                        <path d={mark.path} fill="#FFFFFF" />
                      </svg>
                    </svg>
                  </label>
                </div>
              );
            })}
          </div>

          <p className="mb-1.5 text-xs text-[var(--paper-soft)]">Your own</p>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <div>
          <input
            type="radio"
            id={`${idPrefix}-none`}
            name={name}
            value=""
            checked={selected === ""}
            onChange={() => select(null)}
            autoComplete="off"
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
              onChange={() => select(logo)}
              autoComplete="off"
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
            ? `PNG, JPEG or WebP, up to ${UPLOAD_LIMITS.logo.maxFileSize}. A logo you upload stays in your library for your next code. A square mark on a plain background reads best at small sizes.`
            : logos.length > 0
              ? "Pick a logo from your library."
              : "Logo uploads are not available yet."}
        </p>
      )}
    </fieldset>
  );
}
