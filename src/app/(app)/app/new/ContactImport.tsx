"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  fromPickedContact,
  looksLikeVCard,
  parseVCard,
  type ContactFields,
  type PickedContact,
} from "@/lib/vcard-import";
import { secondaryButtonClass } from "../DashShell";

type ContactsManager = {
  getProperties(): Promise<string[]>;
  select(properties: string[], options: { multiple: boolean }): Promise<PickedContact[]>;
};

function contacts(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { contacts?: ContactsManager }).contacts ?? null;
}

const noSubscribe = () => () => {};

/** The largest file read. A single contact card is a few kilobytes. */
const MAX_FILE_BYTES = 1024 * 1024;

/**
 * Fill the vCard form from an existing contact.
 *
 * "Choose from contacts" opens the phone's own contact book through the
 * Contact Picker API, which only Chrome on Android ships. It is offered only
 * where it exists, decided after hydration so the server and the first
 * client render agree. Everywhere else, including Safari and every desktop,
 * a `.vcf` file does the same job: iPhone Contacts shares one, macOS
 * Contacts exports one, and so does Google Contacts.
 *
 * Nothing leaves the browser. The picked contact only fills the form.
 */
export function ContactImport({ onImport }: { onImport: (fields: ContactFields) => void }) {
  const pickerAvailable = useSyncExternalStore(
    noSubscribe,
    () => contacts() !== null,
    () => false
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);

  async function pick() {
    const manager = contacts();
    if (!manager) return;
    try {
      const supported = await manager.getProperties();
      const wanted = ["name", "email", "tel", "address"].filter((p) => supported.includes(p));
      const [contact] = await manager.select(wanted, { multiple: false });
      // Dismissing the picker resolves with nothing: not an error.
      if (!contact) return;
      onImport(fromPickedContact(contact));
      setNote({ error: false, text: "Filled in from your contacts. Check it before downloading." });
    } catch {
      setNote({ error: true, text: "Your contacts could not be opened. Try a .vcf file instead." });
    }
  }

  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setNote({ error: true, text: "That file is too large to be a contact card." });
      return;
    }
    const text = await file.text();
    if (!looksLikeVCard(text)) {
      setNote({ error: true, text: "That file is not a contact card (.vcf)." });
      return;
    }
    onImport(parseVCard(text));
    setNote({
      error: false,
      text: `Filled in from ${file.name}. Check it before downloading.`,
    });
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--paper-rule)] bg-white p-4">
      <p className="text-sm">Already in your contacts?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {pickerAvailable ? (
          <button type="button" onClick={pick} className={secondaryButtonClass}>
            Choose from contacts
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,.vcard,text/vcard,text/x-vcard"
          onChange={readFile}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <button type="button" onClick={() => fileRef.current?.click()} className={secondaryButtonClass}>
          Import a .vcf file
        </button>
      </div>
      <p
        aria-live="polite"
        className={`mt-2 text-xs leading-relaxed ${
          note?.error ? "text-[var(--struck-ink)]" : "text-[var(--paper-soft)]"
        }`}
      >
        {note?.text ??
          (pickerAvailable
            ? "Pick someone from your phone, or import a contact card file."
            : "Export or share a contact from your contacts app as a .vcf file, then import it here. If there are several people in the file, the first is used.")}
      </p>
    </div>
  );
}
