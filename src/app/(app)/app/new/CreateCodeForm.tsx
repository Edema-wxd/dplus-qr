"use client";

import { useActionState, useState } from "react";
import { createCodeAction, type CreateCodeState } from "../actions";
import { isLinkKind, type DynamicKind, type LinkKind } from "@/lib/qr-types";
import { inputClass, primaryButtonClass } from "../DashShell";
import { LogoPicker, type PickerLogo } from "../LogoPicker";
import { ContentEditor, emptyDraft, type Draft } from "../ContentEditor";

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
 * whose draft is posted as one JSON field. Either way the name and logo are
 * the same, and the server action decides what is valid.
 */
export function CreateCodeForm({
  kind,
  logos,
  uploads,
}: {
  kind: DynamicKind;
  /** The account's logo library, offered so a logo is uploaded only once. */
  logos: PickerLogo[];
  uploads: boolean;
}) {
  const [state, action, pending] = useActionState(createCodeAction, {} as CreateCodeState);
  const [draft, setDraft] = useState<Draft>(() => (isLinkKind(kind) ? {} : emptyDraft(kind)));

  return (
    <form action={action} className="max-w-2xl space-y-6">
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

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Creating…" : "Create code"}
      </button>
    </form>
  );
}
