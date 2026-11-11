"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { secondaryButtonClass } from "@/components/controls";
import {
  BLOG_IMPORT_MAX_FILES,
  BLOG_IMPORT_MAX_TOTAL_BYTES,
  MARKDOWN_FILE_MAX_BYTES,
  MARKDOWN_TEMPLATE,
} from "@/lib/blog-frontmatter";
import { formatBytes } from "@/lib/upload-limits";
import { importPostsAction, type ImportState } from "../blog-actions";

/**
 * Bring in posts written elsewhere: up to ten `.md` files at once, each
 * becoming a draft. Sizes are checked here before anything is sent, so staff
 * hear about an oversized file by name instead of a failed request.
 */
export function ImportPosts() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importPostsAction, {});
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const templateHref = `data:text/markdown;charset=utf-8,${encodeURIComponent(MARKDOWN_TEMPLATE)}`;

  function picked(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    const tooBig = list.filter((file) => file.size > MARKDOWN_FILE_MAX_BYTES);
    const total = list.reduce((sum, file) => sum + file.size, 0);
    if (list.length > BLOG_IMPORT_MAX_FILES) {
      setProblem(`Choose up to ${BLOG_IMPORT_MAX_FILES} files at a time.`);
    } else if (tooBig.length > 0) {
      setProblem(
        `${tooBig.map((file) => file.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over ${formatBytes(MARKDOWN_FILE_MAX_BYTES)}. Split long posts in two.`
      );
    } else if (total > BLOG_IMPORT_MAX_TOTAL_BYTES) {
      setProblem(`Those files come to ${formatBytes(total)}. Import them in smaller groups, up to ${formatBytes(BLOG_IMPORT_MAX_TOTAL_BYTES)} at a time.`);
    } else {
      setProblem(null);
      form.current?.requestSubmit();
      return;
    }
    if (input.current) input.current.value = "";
  }

  const results = state.results ?? [];
  const imported = results.filter((result) => result.ok).length;

  return (
    <div className="max-w-3xl">
      <form ref={form} action={action} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => input.current?.click()}>
          {pending ? "Importing…" : "Import .md files"}
        </button>
        <input
          ref={input}
          type="file"
          name="files"
          multiple
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => picked(event.target.files)}
        />
        <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
          Each file becomes a draft. Frontmatter fills the search and answer fields.{" "}
          <a href={templateHref} download="post-template.md" className="underline underline-offset-4 hover:text-[var(--paper-ink)]">
            Download the template
          </a>
        </p>
      </form>

      {problem || state.error ? (
        <p role="alert" className="mt-3 text-sm text-[var(--struck-ink)]">
          {problem ?? state.error}
        </p>
      ) : null}

      {results.length > 0 && !problem ? (
        <div role="status" className="mt-4 rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3">
          <p className="text-sm font-medium">
            {imported} of {results.length} {results.length === 1 ? "file" : "files"} imported as drafts
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {results.map((result, index) => (
              <li key={`${result.file}-${index}`} className="leading-snug">
                <span className="font-mono text-xs text-[var(--paper-soft)]">{result.file}</span>{" "}
                {result.ok && result.id ? (
                  <Link href={`/admin/blog/${result.id}`} className="underline underline-offset-4">
                    {result.title}
                  </Link>
                ) : (
                  <span className="text-[var(--struck-ink)]">{result.error}</span>
                )}
                {result.notes?.map((note) => (
                  <span key={note} className="block text-xs text-[var(--pending-ink)]">
                    {note}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
