"use client";

import { useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PageKind } from "@/lib/qr-types";
import { SOCIAL_NETWORKS, type FileRef } from "@/lib/page-content";
import { EVENT_OFFSETS } from "@/lib/page-helpers";
import { useUploadThing } from "./uploadthing";
import { inputClass, secondaryButtonClass } from "./DashShell";

/**
 * The editor for a hosted page's content, used both when a code is created
 * and when its page is edited later.
 *
 * Controlled: the surrounding form holds the draft as one plain object and
 * posts it as a single JSON field, `content`. Every change is a functional
 * update, so an upload that finishes after further typing adds its file to
 * the draft as it is then, not as it was when the upload started. Nothing
 * here is trusted: the server resolves file ids against the account's own
 * uploads and parses the whole thing against the kind's schema.
 */

export type Draft = Record<string, unknown>;

type Row = Record<string, unknown>;

/** A fresh draft per kind, with the lists a page needs at least one row of. */
export function emptyDraft(kind: PageKind): Draft {
  switch (kind) {
    case "links":
      return { links: [{ label: "", url: "" }] };
    case "profile":
      return { links: [] };
    case "social":
      return { profiles: [{ network: "instagram", url: "" }] };
    case "images":
      return { images: [] };
    case "menu":
      return { currency: "₦", sections: [{ name: "", items: [{ name: "", description: "", price: "" }] }] };
    case "playlist":
      return { tracks: [] };
    case "event":
      return { utcOffset: "+01:00" };
    case "feedback":
      return { question: "How was your visit today?" };
    default:
      return {};
  }
}

type Endpoint = "pageImage" | "pagePdf" | "pageVideo" | "pageAudio";

const ACCEPT: Record<Endpoint, string> = {
  pageImage: "image/png,image/jpeg,image/webp,image/gif",
  pagePdf: "application/pdf",
  pageVideo: "video/mp4,video/webm,video/quicktime",
  pageAudio: "audio/*",
};

const LIMITS: Record<Endpoint, string> = {
  pageImage: "PNG, JPEG, WebP or GIF, up to 4MB each.",
  pagePdf: "A PDF up to 16MB.",
  pageVideo: "MP4, WebM or MOV, up to 64MB.",
  pageAudio: "MP3 or other audio, up to 16MB each.",
};

function list(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

export function ContentEditor({
  kind,
  value: draft,
  uploads,
  onChange,
}: {
  kind: PageKind;
  value: Draft;
  /** False when this deployment has no UploadThing token. */
  uploads: boolean;
  onChange: Dispatch<SetStateAction<Draft>>;
}) {
  const prefix = useId();

  const str = (name: string) => (typeof draft[name] === "string" ? (draft[name] as string) : "");
  const set = (name: string, value: unknown) => onChange((prev) => ({ ...prev, [name]: value }));
  const append = (name: string, items: Row[], max: number) =>
    onChange((prev) => ({ ...prev, [name]: [...list(prev[name]), ...items].slice(0, max) }));
  const rows = (name: string) => list(draft[name]);
  const fileOf = (name: string) => (draft[name] as FileRef | null | undefined) ?? null;

  const text = (name: string, label: string, opts: TextOpts = {}) => (
    <TextField
      id={`${prefix}-${name}`}
      label={label}
      value={str(name)}
      onChange={(value) => set(name, value)}
      {...opts}
    />
  );

  const file = (name: string, label: string, endpoint: Endpoint, optional = true) => (
    <FileField
      label={optional ? `${label} (optional)` : label}
      endpoint={endpoint}
      uploads={uploads}
      value={fileOf(name)}
      onChange={(value) => set(name, value)}
    />
  );

  const title = text("title", "Title", { required: true });
  const description = text("description", "Description (optional)", { multiline: true });
  const url = { type: "text", inputMode: "url", autoCapitalize: "none", spellCheck: false } as const;
  const phone = { type: "tel", inputMode: "tel", placeholder: "+234 801 234 5678" } as const;

  switch (kind) {
    case "pdf":
      return (
        <Stack>
          {title}
          {description}
          {file("file", "PDF", "pagePdf", false)}
        </Stack>
      );

    case "images":
      return (
        <Stack>
          {title}
          {description}
          <FileList
            label="Images"
            endpoint="pageImage"
            uploads={uploads}
            value={rows("images") as unknown as FileRef[]}
            onChange={(value) => set("images", value)}
            onAdd={(files) => append("images", files, 20)}
          />
        </Stack>
      );

    case "video":
      return (
        <Stack>
          {title}
          {description}
          {text("link", "YouTube or Vimeo link", {
            input: url,
            placeholder: "youtube.com/watch?v=…",
            hint: "Or upload a file below instead.",
          })}
          {file("file", "Video file", "pageVideo")}
        </Stack>
      );

    case "profile":
      return (
        <Stack>
          {text("name", "Your name", { required: true })}
          <Pair>
            {text("title", "Job title (optional)")}
            {text("company", "Company (optional)")}
          </Pair>
          {file("photo", "Photo", "pageImage")}
          {text("bio", "About you (optional)", { multiline: true })}
          <Pair>
            {text("mobile", "Phone (optional)", { input: phone })}
            {text("email", "Email (optional)", { input: { type: "email" } })}
          </Pair>
          {text("website", "Website (optional)", { input: url })}
          {text("address", "Address (optional)", { multiline: true })}
          <LinkRows
            label="More links (optional)"
            rows={rows("links")}
            max={10}
            onChange={(value) => set("links", value)}
          />
        </Stack>
      );

    case "links":
      return (
        <Stack>
          {title}
          {description}
          {file("image", "Header image", "pageImage")}
          <LinkRows label="Links" rows={rows("links")} max={20} onChange={(value) => set("links", value)} />
        </Stack>
      );

    case "social":
      return (
        <Stack>
          {title}
          {description}
          {file("image", "Profile image", "pageImage")}
          <Repeater
            label="Profiles"
            rows={rows("profiles")}
            max={15}
            blank={{ network: "instagram", url: "" }}
            addLabel="Add a profile"
            onChange={(value) => set("profiles", value)}
            render={(row, change, i) => (
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <select
                  aria-label={`Network ${i + 1}`}
                  value={String(row.network ?? "instagram")}
                  onChange={(e) => change({ ...row, network: e.target.value })}
                  className={inputClass}
                >
                  {Object.entries(SOCIAL_NETWORKS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Profile link ${i + 1}`}
                  value={String(row.url ?? "")}
                  onChange={(e) => change({ ...row, url: e.target.value })}
                  placeholder="instagram.com/yourname"
                  className={inputClass}
                  {...url}
                />
              </div>
            )}
          />
        </Stack>
      );

    case "app":
      return (
        <Stack>
          {text("name", "App name", { required: true })}
          {description}
          {file("icon", "App icon", "pageImage")}
          {text("ios", "App Store link", { input: url, placeholder: "apps.apple.com/app/…" })}
          {text("android", "Google Play link", {
            input: url,
            placeholder: "play.google.com/store/apps/details?id=…",
          })}
          {text("website", "Website (optional)", {
            input: url,
            hint: "Shown to anyone scanning on a computer.",
          })}
          <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
            A phone that scans is sent straight to its own store. Anyone else sees both buttons.
          </p>
        </Stack>
      );

    case "mp3":
      return (
        <Stack>
          {title}
          {text("artist", "Artist (optional)")}
          {description}
          {file("cover", "Cover image", "pageImage")}
          {file("file", "Audio file", "pageAudio", false)}
        </Stack>
      );

    case "business":
      return (
        <Stack>
          {text("name", "Business name", { required: true })}
          {text("tagline", "Tagline (optional)")}
          {description}
          {file("cover", "Cover image", "pageImage")}
          <Pair>
            {text("phone", "Phone (optional)", { input: phone })}
            {text("email", "Email (optional)", { input: { type: "email" } })}
          </Pair>
          {text("website", "Website (optional)", { input: url })}
          {text("address", "Address (optional)", { multiline: true })}
          {text("hours", "Opening hours (optional)", {
            multiline: true,
            placeholder: "Mon to Fri, 9am to 6pm\nSat, 10am to 4pm",
          })}
        </Stack>
      );

    case "menu":
      return (
        <Stack>
          {text("name", "Restaurant name", { required: true })}
          {description}
          {text("currency", "Currency symbol", { hint: "Shown before every price.", input: { maxLength: 4 } })}
          <Repeater
            label="Sections"
            rows={rows("sections")}
            max={20}
            blank={{ name: "", items: [{ name: "", description: "", price: "" }] }}
            addLabel="Add a section"
            onChange={(value) => set("sections", value)}
            render={(section, change, i) => (
              <div className="space-y-3">
                <input
                  aria-label={`Section ${i + 1} name`}
                  value={String(section.name ?? "")}
                  onChange={(e) => change({ ...section, name: e.target.value })}
                  placeholder="Starters"
                  className={`${inputClass} font-medium`}
                />
                <Repeater
                  label="Items"
                  rows={Array.isArray(section.items) ? (section.items as Row[]) : []}
                  max={60}
                  blank={{ name: "", description: "", price: "" }}
                  addLabel="Add an item"
                  nested
                  onChange={(items) => change({ ...section, items })}
                  render={(item, changeItem, j) => (
                    <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
                      <input
                        aria-label={`Item ${j + 1} name`}
                        value={String(item.name ?? "")}
                        onChange={(e) => changeItem({ ...item, name: e.target.value })}
                        placeholder="Jollof rice"
                        className={inputClass}
                      />
                      <input
                        aria-label={`Item ${j + 1} price`}
                        value={String(item.price ?? "")}
                        onChange={(e) => changeItem({ ...item, price: e.target.value })}
                        placeholder="3,500"
                        inputMode="decimal"
                        className={inputClass}
                      />
                      <input
                        aria-label={`Item ${j + 1} description`}
                        value={String(item.description ?? "")}
                        onChange={(e) => changeItem({ ...item, description: e.target.value })}
                        placeholder="Description (optional)"
                        className={`${inputClass} sm:col-span-2`}
                      />
                    </div>
                  )}
                />
              </div>
            )}
          />
        </Stack>
      );

    case "feedback":
      return (
        <Stack>
          {text("name", "Business name", { required: true })}
          {text("question", "Question to ask", { required: true })}
          {text("reviewUrl", "Review link (optional)", {
            input: url,
            placeholder: "g.page/r/…/review",
            hint: "Customers who rate four or five stars are offered this, such as your Google review page.",
          })}
          {text("thanks", "Thank-you message (optional)", { placeholder: "Thank you, we read every answer." })}
          <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
            Answers appear on this code&rsquo;s page in your dashboard.
          </p>
        </Stack>
      );

    case "event":
      return (
        <Stack>
          {text("title", "Event name", { required: true })}
          {text("organiser", "Organiser (optional)")}
          {description}
          {file("cover", "Cover image", "pageImage")}
          <Pair>
            {text("start", "Starts", { input: { type: "datetime-local" }, required: true })}
            {text("end", "Ends (optional)", { input: { type: "datetime-local" } })}
          </Pair>
          <div>
            <label htmlFor={`${prefix}-offset`} className="mb-1 block text-sm">
              Time zone
            </label>
            <select
              id={`${prefix}-offset`}
              value={str("utcOffset") || "+01:00"}
              onChange={(e) => set("utcOffset", e.target.value)}
              className={inputClass}
            >
              {EVENT_OFFSETS.map((offset) => (
                <option key={offset} value={offset}>
                  UTC{offset}
                  {offset === "+01:00" ? " (Lagos, WAT)" : offset === "+00:00" ? " (Accra, GMT)" : ""}
                </option>
              ))}
            </select>
          </div>
          {text("location", "Location (optional)", { multiline: true })}
          {text("link", "Tickets or more information (optional)", { input: url })}
        </Stack>
      );

    case "coupon":
      return (
        <Stack>
          {text("business", "Business name", { required: true })}
          {text("headline", "The offer", { required: true, placeholder: "20% off your next order" })}
          {description}
          {file("cover", "Image", "pageImage")}
          <Pair>
            {text("code", "Coupon code (optional)", { input: { autoCapitalize: "characters" } })}
            {text("validUntil", "Valid until (optional)", { input: { type: "date" } })}
          </Pair>
          {text("terms", "Terms (optional)", { multiline: true })}
          {text("link", "Where to redeem it (optional)", { input: url })}
        </Stack>
      );

    case "playlist":
      return (
        <Stack>
          {title}
          {description}
          {file("cover", "Cover image", "pageImage")}
          <TrackList
            uploads={uploads}
            rows={rows("tracks")}
            onChange={(value) => set("tracks", value)}
            onAdd={(files) =>
              append(
                "tracks",
                files.map((file) => ({ title: file.name.replace(/\.[a-z0-9]+$/i, ""), file })),
                30
              )
            }
          />
        </Stack>
      );

    case "barcode":
      return (
        <Stack>
          {text("gtin", "GTIN", {
            required: true,
            input: { inputMode: "numeric", className: `${inputClass} font-mono` },
            hint: "The 8, 12, 13 or 14 digit number under your product's barcode, check digit included.",
          })}
          {text("name", "Product name", { required: true })}
          {text("brand", "Brand (optional)")}
          {description}
          {file("image", "Product image", "pageImage")}
          <Pair>
            {text("batch", "Batch or lot (optional)", { input: { className: `${inputClass} font-mono` } })}
            {text("serial", "Serial number (optional)", { input: { className: `${inputClass} font-mono` } })}
          </Pair>
          {text("expiry", "Expiry date (optional)", { input: { type: "date" } })}
          {text("link", "Product website (optional)", { input: url })}
        </Stack>
      );
  }
}

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

function Pair({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

type TextOpts = {
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  input?: React.InputHTMLAttributes<HTMLInputElement>;
};

function TextField({
  id,
  label,
  value,
  onChange,
  multiline,
  required,
  placeholder,
  hint,
  input,
}: TextOpts & { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      ) : (
        <input
          id={id}
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          {...input}
        />
      )}
      {hint ? <p className="mt-1 text-xs text-[var(--paper-soft)]">{hint}</p> : null}
    </div>
  );
}

/**
 * A list of rows the owner can add to, remove from and reorder. Reordering is
 * by buttons rather than drag, so it works from a keyboard and on a phone.
 */
function Repeater({
  label,
  rows,
  max,
  blank,
  addLabel,
  nested,
  onChange,
  render,
}: {
  label: string;
  rows: Row[];
  max: number;
  blank: Row;
  addLabel: string;
  nested?: boolean;
  onChange: (rows: Row[]) => void;
  render: (row: Row, change: (row: Row) => void, index: number) => React.ReactNode;
}) {
  const replace = (index: number, row: Row) =>
    onChange(rows.map((existing, i) => (i === index ? row : existing)));
  const move = (index: number, by: number) => {
    const next = [...rows];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row!);
    onChange(next);
  };
  const small =
    "rounded px-1.5 py-0.5 text-xs text-[var(--paper-soft)] hover:text-[var(--paper-ink)] disabled:opacity-40";

  return (
    <fieldset className={nested ? "" : "rounded-lg border border-[var(--paper-rule)] p-3 sm:p-4"}>
      <legend className={nested ? "sr-only" : "px-1 text-sm"}>{label}</legend>
      <ol className="space-y-3">
        {rows.map((row, i) => (
          <li
            key={i}
            className={nested ? "border-l-2 border-[var(--paper-rule)] pl-3" : "rounded-md bg-[var(--paper)] p-3"}
          >
            {render(row, (next) => replace(i, next), i)}
            <div className="mt-2 flex justify-end gap-1">
              <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)}>
                Move up
              </button>
              <button
                type="button"
                className={small}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                Move down
              </button>
              <button
                type="button"
                className={small}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      {rows.length < max ? (
        <button
          type="button"
          onClick={() => onChange([...rows, structuredClone(blank)])}
          className={`${secondaryButtonClass} mt-3 text-xs`}
        >
          {addLabel}
        </button>
      ) : null}
    </fieldset>
  );
}

function LinkRows({
  label,
  rows,
  max,
  onChange,
}: {
  label: string;
  rows: Row[];
  max: number;
  onChange: (rows: Row[]) => void;
}) {
  return (
    <Repeater
      label={label}
      rows={rows}
      max={max}
      blank={{ label: "", url: "" }}
      addLabel="Add a link"
      onChange={onChange}
      render={(row, change, i) => (
        <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <input
            aria-label={`Link ${i + 1} label`}
            value={String(row.label ?? "")}
            onChange={(e) => change({ ...row, label: e.target.value })}
            placeholder="Shop"
            className={inputClass}
          />
          <input
            aria-label={`Link ${i + 1} address`}
            value={String(row.url ?? "")}
            onChange={(e) => change({ ...row, url: e.target.value })}
            placeholder="your-site.com/shop"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
          />
        </div>
      )}
    />
  );
}

/** Upload through one of the page-file endpoints; resolves to what the server recorded. */
function useUpload(endpoint: Endpoint, onDone: (files: FileRef[]) => void) {
  const [error, setError] = useState<string | null>(null);
  const { startUpload, isUploading } = useUploadThing(endpoint, {
    onClientUploadComplete: (results) => {
      const files = results
        .map((result) => result.serverData)
        .filter((data): data is FileRef => Boolean(data));
      onDone(files);
      setError(null);
    },
    onUploadError: (uploadError) => {
      setError(uploadError.message || "That upload did not finish. Please try again.");
    },
  });
  return { startUpload, isUploading, error, setError };
}

function UploadButton({
  endpoint,
  multiple,
  busy,
  onFiles,
  children,
}: {
  endpoint: Endpoint;
  multiple?: boolean;
  busy: boolean;
  onFiles: (files: File[]) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT[endpoint]}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => ref.current?.click()}
        className={`${secondaryButtonClass} text-xs`}
      >
        {busy ? "Uploading…" : children}
      </button>
    </>
  );
}

function UploadNote({ uploads, endpoint, error }: { uploads: boolean; endpoint: Endpoint; error: string | null }) {
  if (error) {
    return (
      <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
        {error}
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-[var(--paper-soft)]">
      {uploads ? LIMITS[endpoint] : "File uploads are not available yet."}
    </p>
  );
}

function FileField({
  label,
  endpoint,
  uploads,
  value,
  onChange,
}: {
  label: string;
  endpoint: Endpoint;
  uploads: boolean;
  value: FileRef | null;
  onChange: (value: FileRef | null) => void;
}) {
  const { startUpload, isUploading, error } = useUpload(endpoint, (files) => {
    if (files[0]) onChange(files[0]);
  });

  return (
    <div>
      <p className="mb-1 block text-sm">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        {value ? <FileChip file={value} onRemove={() => onChange(null)} /> : null}
        {uploads ? (
          <UploadButton endpoint={endpoint} busy={isUploading} onFiles={(files) => startUpload(files.slice(0, 1))}>
            {value ? "Replace" : "Upload"}
          </UploadButton>
        ) : null}
      </div>
      <UploadNote uploads={uploads} endpoint={endpoint} error={error} />
    </div>
  );
}

function FileList({
  label,
  endpoint,
  uploads,
  value,
  onChange,
  onAdd,
}: {
  label: string;
  endpoint: Endpoint;
  uploads: boolean;
  value: FileRef[];
  onChange: (value: FileRef[]) => void;
  onAdd: (files: FileRef[]) => void;
}) {
  const { startUpload, isUploading, error } = useUpload(endpoint, onAdd);

  return (
    <div>
      <p className="mb-1 block text-sm">{label}</p>
      <ul className="flex flex-wrap gap-3">
        {value.map((file, i) => (
          <li key={file.fileId}>
            <FileChip file={file} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      {uploads && value.length < 20 ? (
        <div className="mt-3">
          <UploadButton endpoint={endpoint} multiple busy={isUploading} onFiles={(files) => startUpload(files)}>
            {value.length ? "Add more" : "Upload"}
          </UploadButton>
        </div>
      ) : null}
      <UploadNote uploads={uploads} endpoint={endpoint} error={error} />
    </div>
  );
}

function TrackList({
  uploads,
  rows,
  onChange,
  onAdd,
}: {
  uploads: boolean;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  onAdd: (files: FileRef[]) => void;
}) {
  const { startUpload, isUploading, error } = useUpload("pageAudio", onAdd);

  return (
    <div>
      <Repeater
        label="Tracks"
        rows={rows}
        max={0}
        blank={{}}
        addLabel=""
        onChange={onChange}
        render={(row, change, i) => (
          <div className="space-y-2">
            <input
              aria-label={`Track ${i + 1} title`}
              value={String(row.title ?? "")}
              onChange={(e) => change({ ...row, title: e.target.value })}
              className={inputClass}
            />
            <p className="truncate text-xs text-[var(--paper-soft)]">
              {(row.file as FileRef | undefined)?.name}
            </p>
          </div>
        )}
      />
      {uploads && rows.length < 30 ? (
        <div className="mt-3">
          <UploadButton endpoint="pageAudio" multiple busy={isUploading} onFiles={(files) => startUpload(files)}>
            Upload tracks
          </UploadButton>
        </div>
      ) : null}
      <UploadNote uploads={uploads} endpoint="pageAudio" error={error} />
    </div>
  );
}

function FileChip({ file, onRemove }: { file: FileRef; onRemove: () => void }) {
  const image = file.mime.startsWith("image/");
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-[var(--paper-rule)] bg-white p-1.5 pr-2 text-xs">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" className="h-10 w-10 rounded object-cover" />
      ) : null}
      <span className="max-w-[14rem] truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
          <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
    </span>
  );
}
