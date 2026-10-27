"use client";

import { useActionState, useState } from "react";
import { createCodeAction, type CreateCodeState } from "../actions";
import { isLinkKind, type DynamicKind, type LinkKind } from "@/lib/qr-types";
import { inputClass, primaryButtonClass } from "@/components/controls";
import { LogoPicker, type PickerLogo } from "../LogoPicker";
import { ContentEditor, emptyDraft, type Draft } from "../ContentEditor";
import { CustomLinkField } from "./CustomLinkField";
import { DesignFields, DesignPreview } from "../DesignPanel";
import { DEFAULT_QR_STYLE, checkQrStyle, type QrStyle } from "@/lib/qr-style";
import type { QrMatrix } from "@/lib/qr-artwork";

/** What the destination field asks for, per link type. */
const LINK_FIELD: Record<LinkKind, { label: string; placeholder: string; hint: string }> = {
  url: {
    label: "Points to",
    placeholder: "your-site.com/page",
    hint: "A web address, with or without https://. You can change this at any time without reprinting.",
  },
  instagram: {
    label: "Instagram handle or link",
    placeholder: "@yourbusiness",
    hint: "Opens your profile in the Instagram app. You can change it later without reprinting.",
  },
  facebook: {
    label: "Facebook page name or link",
    placeholder: "facebook.com/yourbusiness",
    hint: "Opens your page on Facebook. You can change it later without reprinting.",
  },
};

/**
 * Create a dynamic code of one chosen type.
 *
 * A link type asks for a destination; a page type opens the content editor,
 * whose draft is posted as one JSON field. Either way the name, logo and
 * design are the same, and the server action decides what is valid.
 *
 * The design preview draws a sample link's matrix, since the code's own short
 * code is not allocated until it is saved. The arrangement of dots differs
 * from the final code's; the design, colours and logo placement do not.
 */
export function CreateCodeForm({
  kind,
  logos,
  uploads,
  customLinks,
  sample,
}: {
  kind: DynamicKind;
  /** The account's logo library, offered so a logo is uploaded only once. */
  logos: PickerLogo[];
  uploads: boolean;
  /** Whether the plan includes custom links, and why not when it does not. */
  customLinks: { ok: true } | { ok: false; reason: string };
  /** A sample code link encoded at both levels, for the preview with and without a logo. */
  sample: { Q: QrMatrix; H: QrMatrix };
}) {
  const [state, action, pending] = useActionState(createCodeAction, {} as CreateCodeState);
  const [draft, setDraft] = useState<Draft>(() => (isLinkKind(kind) ? {} : emptyDraft(kind)));
  const [style, setStyle] = useState<QrStyle>(DEFAULT_QR_STYLE);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const scannable = checkQrStyle(style).ok;

  return (
    <form action={action} className="grid gap-10 lg:grid-cols-[minmax(0,42rem)_minmax(0,17rem)] lg:gap-12">
      <div className="min-w-0 space-y-6">
        <input type="hidden" name="kind" value={kind} />

        <div>
          <label htmlFor="new-code-name" className="mb-1 block text-sm">
            Name
          </label>
          <input
            id="new-code-name"
            name="name"
            required
            maxLength={80}
            autoFocus
            placeholder="Wrap label, 5,000 run"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-[var(--paper-soft)]">
            For you, not your customers. Name it after the thing it is printed on.
          </p>
        </div>

        {isLinkKind(kind) ? (
          <div>
            <label htmlFor="new-code-destination" className="mb-1 block text-sm">
              {LINK_FIELD[kind].label}
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
              placeholder={LINK_FIELD[kind].placeholder}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-[var(--paper-soft)]">{LINK_FIELD[kind].hint}</p>
          </div>
        ) : (
          <section aria-label="Page content" className="rounded-lg border border-[var(--paper-rule)] bg-white p-4 sm:p-5">
            <p className="mb-4 text-sm text-[var(--paper-soft)]">
              This is the page people see when they scan. You can edit it at any time after printing.
            </p>
            <ContentEditor kind={kind} value={draft} uploads={uploads} onChange={setDraft} />
            <input type="hidden" name="content" value={JSON.stringify(draft)} />
          </section>
        )}

        <CustomLinkField
          allowed={customLinks.ok}
          reason={customLinks.ok ? undefined : customLinks.reason}
        />

        {/*
          Shown when there is anything to pick or a way to add something. With
          neither, it would be a fieldset holding only "None".
        */}
        {uploads || logos.length > 0 ? (
          <LogoPicker
            logos={logos}
            uploads={uploads}
            idPrefix="new-code-logo"
            onChange={(_logoId, url) => setLogoUrl(url)}
          />
        ) : null}

        <section aria-labelledby="new-code-design" className="rounded-lg border border-[var(--paper-rule)] bg-white p-4 sm:p-5">
          <h2 id="new-code-design" className="mb-1 text-sm font-medium">
            Design
          </h2>
          <p className="mb-5 text-xs leading-relaxed text-[var(--paper-soft)]">
            Optional, and you can change it later. Every pattern and corner here is tested to scan.
          </p>
          {/*
            On a phone the preview column sits below the whole form, out of
            sight while designing, so a small copy rides along here.
          */}
          <div className="mb-5 w-36 lg:hidden">
            <DesignPreview
              matrix={logoUrl ? sample.H : sample.Q}
              style={style}
              logoUrl={logoUrl}
              px={120}
              title="Preview of your code"
              className="block h-auto w-full"
            />
          </div>
          <DesignFields style={style} onChange={setStyle} matrix={sample.Q} idPrefix="new-code-design" />
          <input type="hidden" name="style" value={JSON.stringify(style)} />
        </section>

        {state.error ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {state.error}
          </p>
        ) : null}

        <button type="submit" disabled={pending || !scannable} className={primaryButtonClass}>
          {pending ? "Creating…" : "Create code"}
        </button>
      </div>

      <aside aria-label="Preview" className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        <DesignPreview
          matrix={logoUrl ? sample.H : sample.Q}
          style={style}
          logoUrl={logoUrl}
          px={240}
          title="Preview of your code"
          className="mx-auto block h-auto w-full max-w-[240px]"
        />
        <p className="mt-2 text-xs leading-relaxed text-[var(--paper-soft)]">
          A preview with a sample link. Your code&apos;s own dots fall differently; its design will not.
        </p>
      </aside>
    </form>
  );
}
