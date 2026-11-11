"use client";

import { useRef, useState } from "react";
import { useUploadThing } from "@/app/(app)/app/uploadthing";
import type { RenderedPost } from "@/lib/blog-markdown";
import { checkPicked, clientUploadMessage } from "@/lib/upload-limits";
import { applyFormat, insertBlock, type Edit, type Format } from "./format";

const tool =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] text-[var(--paper-soft)] transition-[color,background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-[var(--paper-raised)] hover:text-[var(--paper-ink)] active:scale-[0.97] disabled:opacity-50";

const TOOLS: { format: Format; label: string; title: string; content: React.ReactNode }[] = [
  { format: "h2", label: "Section heading", title: "Section heading (##)", content: "H2" },
  { format: "h3", label: "Subheading", title: "Subheading (###)", content: "H3" },
  { format: "bold", label: "Bold", title: "Bold (⌘B)", content: <span className="font-bold">B</span> },
  { format: "italic", label: "Italic", title: "Italic (⌘I)", content: <span className="font-serif italic">I</span> },
  { format: "link", label: "Link", title: "Link (⌘K)", content: "Link" },
  { format: "list", label: "Bulleted list", title: "Bulleted list", content: "• List" },
  { format: "numbered", label: "Numbered list", title: "Numbered list", content: "1. List" },
  { format: "quote", label: "Quote", title: "Quote", content: "Quote" },
  { format: "table", label: "Table", title: "Table", content: "Table" },
];

const SHORTCUTS: Record<string, Format> = { b: "bold", i: "italic", k: "link" };

/**
 * The post's body: Markdown, with a toolbar for what people reach for most,
 * the usual shortcuts, image upload, and a preview rendered by the same
 * function the published page uses.
 *
 * Toolbar edits go through the browser's own text insertion where it has
 * one, so ⌘Z undoes a bold or a heading like any typed change. Dropping a
 * `.md` file on the field imports it; dropping an image uploads it.
 */
export function MarkdownField({
  value,
  onChange,
  rendered,
  uploads,
  onImportFile,
  title,
  excerpt,
}: {
  value: string;
  onChange: (value: string) => void;
  rendered: RenderedPost;
  uploads: boolean;
  onImportFile: (file: File) => void;
  title: string;
  excerpt: string;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function apply(edit: Edit) {
    const el = textarea.current;
    if (!el) {
      onChange(edit.value);
      return;
    }
    const old = el.value;
    const next = edit.value;
    let start = 0;
    while (start < old.length && start < next.length && old[start] === next[start]) start += 1;
    let endOld = old.length;
    let endNew = next.length;
    while (endOld > start && endNew > start && old[endOld - 1] === next[endNew - 1]) {
      endOld -= 1;
      endNew -= 1;
    }
    el.focus();
    el.setSelectionRange(start, endOld);
    // execCommand keeps the edit on the textarea's own undo stack. It is
    // deprecated but still the only way to do that; where it is missing the
    // value is set directly and undo simply skips this step.
    const inserted = document.execCommand?.("insertText", false, next.slice(start, endNew));
    if (!inserted || el.value !== next) onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(edit.selection.start, edit.selection.end);
    });
  }

  function format(kind: Format) {
    const el = textarea.current;
    const selection = el ? { start: el.selectionStart, end: el.selectionEnd } : { start: value.length, end: value.length };
    apply(applyFormat(value, selection, kind));
  }

  const { startUpload, isUploading } = useUploadThing("blogImage", {
    onClientUploadComplete: (results) => {
      const data = results[0]?.serverData;
      if (!data) {
        setUploadError("That image could not be saved. Check it is a PNG, JPEG or WebP, then try again.");
        return;
      }
      setUploadError(null);
      // Read the text as it is now: staff may have kept typing while it uploaded.
      const el = textarea.current;
      const current = el?.value ?? value;
      const selection = el ? { start: el.selectionStart, end: el.selectionEnd } : { start: current.length, end: current.length };
      const alt = "Describe the image";
      const edit = insertBlock(current, selection, `![${alt}](${data.url})`);
      // Select the description, the part that still needs writing.
      apply({ value: edit.value, selection: { start: edit.selection.start + 2, end: edit.selection.start + 2 + alt.length } });
      setTab("write");
    },
    onUploadError: (error) => setUploadError(clientUploadMessage(error)),
  });

  function uploadImage(file: File | undefined) {
    if (!file) return;
    const { accepted, problem } = checkPicked("blogImage", [file], 1);
    setUploadError(problem);
    if (accepted.length) startUpload(accepted);
  }

  function onDrop(event: React.DragEvent) {
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    event.preventDefault();
    if (/\.(md|markdown|txt)$/i.test(file.name) || file.type === "text/markdown") {
      onImportFile(file);
    } else if (file.type.startsWith("image/")) {
      if (uploads) uploadImage(file);
      else setUploadError("Image uploads are not set up here. Paste an https image address instead.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--paper-rule)]">
        <div role="tablist" aria-label="Body" className="flex gap-1">
          {(["write", "preview"] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === name
                  ? "border-[var(--paper-ink)] text-[var(--paper-ink)]"
                  : "border-transparent text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
              }`}
            >
              {name === "write" ? "Write" : "Preview"}
            </button>
          ))}
        </div>
        <p className="dash-num pb-2 text-xs text-[var(--paper-soft)]">
          {rendered.words} words, {rendered.readingMinutes} min read
        </p>
      </div>

      {tab === "write" ? (
        <>
          <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 py-2">
            {TOOLS.map((item) => (
              <button
                key={item.format}
                type="button"
                className={tool}
                title={item.title}
                aria-label={item.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => format(item.format)}
              >
                {item.content}
              </button>
            ))}
            {uploads ? (
              <>
                <button
                  type="button"
                  className={tool}
                  title="Upload an image (PNG, JPEG or WebP, up to 4 MB)"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => imageInput.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? "Uploading…" : "Image"}
                </button>
                <input
                  ref={imageInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(event) => {
                    uploadImage(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </>
            ) : null}
          </div>

          <textarea
            ref={textarea}
            id="post-body"
            aria-label="Body, in Markdown"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              const kind = (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey ? SHORTCUTS[event.key.toLowerCase()] : undefined;
              if (kind) {
                event.preventDefault();
                format(kind);
              }
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("Files")) {
                event.preventDefault();
                setDragging(true);
              }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            spellCheck
            placeholder={"Start with the paragraph that answers the question in the title.\n\n## A heading for each part\n\nDrop a .md file here to import it."}
            className={`block h-[68vh] min-h-[24rem] w-full resize-y rounded-md border bg-white px-4 py-3 font-mono text-[14px] leading-[1.7] text-[var(--paper-ink)] placeholder:text-[var(--paper-soft)] transition-colors duration-150 focus:border-[var(--pin-ink)] ${
              dragging ? "border-dashed border-[var(--pin-ink)]" : "border-[var(--paper-rule)]"
            }`}
          />
          {uploadError ? (
            <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
              {uploadError}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-[var(--paper-soft)]">
              Markdown: ## for sections, **bold**, [links](https://…), - lists, &gt; quotes, tables. HTML is shown as text,
              never run. The title is the page&rsquo;s headline, so start sections at ##.
            </p>
          )}
        </>
      ) : (
        <div className="post-sheet mt-4 rounded-md border border-[var(--paper-rule)] px-5 py-8 sm:px-10">
          <h1 className="max-w-[22ch] font-sarlotte text-[clamp(2rem,4vw,2.8rem)] leading-[1] tracking-[-0.02em] text-balance">
            {title || "Untitled post"}
          </h1>
          {excerpt ? <p className="mt-4 max-w-[46ch] text-[18px] leading-[1.55] text-[var(--paper-soft)]">{excerpt}</p> : null}
          {rendered.html.trim() ? (
            <div className="post-body mt-10 max-w-[46rem]" dangerouslySetInnerHTML={{ __html: rendered.html }} />
          ) : (
            <p className="mt-10 text-[var(--paper-soft)]">Nothing written yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
