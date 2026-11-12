"use client";

import Link from "next/link";
import { useActionState, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { applyImport, parseMarkdownFile, toMarkdownFile, MARKDOWN_TEMPLATE } from "@/lib/blog-frontmatter";
import { renderMarkdown } from "@/lib/blog-markdown";
import {
  BLOG_LIMITS,
  BLOG_TARGETS,
  EMPTY_POST,
  isPublic,
  pickFields,
  postState,
  slugify,
  type FaqItem,
  type Post,
  type PostFields,
  type Source,
  type Step,
} from "@/lib/blog-schema";
import { auditPost, searchDescription, searchTitle } from "@/lib/blog-seo";
import { ActionNote, confirmFirst, dangerButtonClass } from "../ActionNote";
import type { AdminFormState } from "../actions";
import { deletePostAction, savePostAction } from "../blog-actions";
import { ListInput, Panel, RowList, TextField, help, label } from "./fields";
import { MarkdownField } from "./MarkdownField";
import { Checklist, ImageField, SerpPreview, SocialPreview } from "./previews";

const L = BLOG_LIMITS;
const T = BLOG_TARGETS;

/** A stored ISO time as a `datetime-local` value, in the browser's own time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Lagos time, the same on the server and in the browser, so the status line never differs between them. */
function lagos(iso: string): string {
  return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
}

const subscribeNever = () => () => {};

/** The one place a date input may read the browser's clock and time zone: after hydration. */
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

type ImportNote = { file: string; filled: string[]; warnings: string[]; undo: { fields: PostFields; publishAt: string } };

/**
 * Write, import, check and publish one post.
 *
 * The editor keeps the whole post in one piece of state and sends it as one
 * JSON field, validated on the server by the schema the checklist and the
 * counters here already use. Status and dates come from the server's copy
 * (`post`), which revalidates after every save, so the publish panel always
 * says what is actually live.
 */
export function PostEditor({ post, uploads }: { post: Post | null; uploads: boolean }) {
  const mounted = useMounted();
  const [fields, setFields] = useState<PostFields>(() => (post ? pickFields(post) : EMPTY_POST));
  const [slugTouched, setSlugTouched] = useState(post !== null);
  const [publishAt, setPublishAt] = useState<string | null>(null);
  const [markUpdated, setMarkUpdated] = useState(false);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [importNote, setImportNote] = useState<ImportNote | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(savePostAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<AdminFormState, FormData>(deletePostAction, {});

  // A saved form is clean again. Adjusted during render, React's pattern for
  // state that follows another value, rather than in an effect.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.notice) {
      setDirty(false);
      setMarkUpdated(false);
    }
  }

  const form = useRef<HTMLFormElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const deferredBody = useDeferredValue(fields.bodyMd);
  const rendered = useMemo(() => renderMarkdown(deferredBody), [deferredBody]);
  const checks = useMemo(() => auditPost(fields, rendered), [fields, rendered]);

  const status = post ? postState(post) : "draft";
  const live = post ? isPublic(post) : false;
  const publishLocal = publishAt ?? (mounted ? toLocalInput(post?.publishedAt ?? null) : "");
  const future = mounted && publishLocal !== "" && new Date(publishLocal) > new Date();

  function set<K extends keyof PostFields>(key: K, value: PostFields[K]) {
    setFields((current) => {
      const next = { ...current, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugify(value as string);
      return next;
    });
    setDirty(true);
  }

  // ⌘S saves, from anywhere on the page. No animation, no confirmation: it is
  // pressed constantly and should feel like nothing happened but the toast.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        form.current?.requestSubmit(saveButton.current ?? undefined);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  async function importFile(file: File) {
    setImportError(null);
    const result = parseMarkdownFile(await file.text());
    if (!result.ok) {
      setImportError(`${file.name}: ${result.error}`);
      return;
    }
    const before = { fields, publishAt: publishLocal };
    const next = applyImport(fields, result.fields);
    if (!result.fields.slug && !slugTouched) next.slug = slugify(next.title);
    setFields(next);
    if (result.publishedAt) setPublishAt(toLocalInput(result.publishedAt));
    setVersion((v) => v + 1);
    setDirty(true);
    setImportNote({ file: file.name, filled: result.filled, warnings: result.warnings, undo: before });
  }

  function undoImport() {
    if (!importNote) return;
    setFields(importNote.undo.fields);
    setPublishAt(importNote.undo.publishAt);
    setVersion((v) => v + 1);
    setImportNote(null);
  }

  const submit = (formData: FormData) => {
    formData.set("post", JSON.stringify(fields));
    // Sent only when staff changed it, so saving never nudges an existing date.
    formData.set("publishAt", publishAt ? new Date(publishAt).toISOString() : "");
    formAction(formData);
  };

  const title = searchTitle(fields);
  const description = searchDescription(fields);

  return (
    <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <form ref={form} action={submit} id="post-form" className="min-w-0 space-y-6">
        {post ? <input type="hidden" name="id" value={post.id} /> : null}

        <div>
          <label htmlFor="post-title" className="sr-only">
            Title
          </label>
          <textarea
            id="post-title"
            rows={2}
            value={fields.title}
            onChange={(event) => set("title", event.target.value.replace(/\n/g, " "))}
            placeholder="Title of the post"
            className="block w-full resize-none border-0 border-b border-[var(--paper-rule)] bg-transparent px-0 pb-3 font-sarlotte text-[2rem] leading-[1.08] tracking-[-0.015em] text-[var(--paper-ink)] [field-sizing:content] placeholder:text-[var(--paper-soft)] focus:border-[var(--pin-ink)] focus:outline-none sm:text-[2.4rem]"
          />
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <p className={help}>The headline readers see. It is also the search title unless you set one.</p>
            <span className={`dash-num shrink-0 text-xs ${fields.title.length > L.title ? "text-[var(--struck-ink)]" : "text-[var(--paper-soft)]"}`}>
              {fields.title.length}/{L.title}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="post-slug" className={label}>
            Address
          </label>
          <div className="flex items-stretch overflow-hidden rounded-md border border-[var(--paper-rule)] bg-white focus-within:border-[var(--pin-ink)]">
            <span className="flex items-center border-r border-[var(--paper-rule)] bg-[var(--paper-raised)] px-3 font-mono text-[13px] text-[var(--paper-soft)]">
              /blog/
            </span>
            <input
              id="post-slug"
              value={fields.slug}
              onChange={(event) => {
                setSlugTouched(true);
                set("slug", event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              onBlur={() => {
                const tidy = slugify(fields.slug);
                if (tidy !== fields.slug) set("slug", tidy);
              }}
              placeholder="made-from-the-title"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-[13px] text-[var(--paper-ink)] focus:outline-none"
            />
          </div>
          <p className={help}>
            {post && post.status === "published"
              ? "Changing it keeps the old address working: it redirects here."
              : "Lower-case words and hyphens. Short and keyword-led reads best in search."}
          </p>
        </div>

        <TextField
          id="post-excerpt"
          name="Summary"
          value={fields.excerpt}
          onChange={(value) => set("excerpt", value)}
          max={L.excerpt}
          target={{ min: 80, max: 220 }}
          multiline
          rows={2}
          hint="One or two sentences under the headline, and on the blog's index. The search description falls back to it."
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-dashed border-[var(--paper-rule)] px-4 py-3">
          <button type="button" className={secondaryButtonClass} onClick={() => importInput.current?.click()}>
            Import a .md file
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
            Fills every field its frontmatter names, and the body. Or drop the file on the body.{" "}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-[var(--paper-ink)]"
              onClick={() => download("post-template.md", MARKDOWN_TEMPLATE)}
            >
              Download the template
            </button>
          </p>
        </div>

        {importError ? (
          <p role="alert" className="text-sm text-[var(--struck-ink)]">
            {importError}
          </p>
        ) : null}
        {importNote ? (
          <div role="status" className="rounded-md border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm leading-relaxed">
            <p>
              <span className="font-medium">Filled from {importNote.file}:</span> {importNote.filled.join(", ") || "nothing"}.
            </p>
            {importNote.warnings.map((warning) => (
              <p key={warning} className="mt-1 text-[var(--pending-ink)]">
                {warning}
              </p>
            ))}
            <div className="mt-2 flex gap-4 text-xs">
              <button type="button" onClick={undoImport} className="underline underline-offset-4">
                Undo the import
              </button>
              <button type="button" onClick={() => setImportNote(null)} className="text-[var(--paper-soft)] underline underline-offset-4">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <MarkdownField
          value={fields.bodyMd}
          onChange={(value) => set("bodyMd", value)}
          rendered={rendered}
          uploads={uploads}
          onImportFile={(file) => void importFile(file)}
          title={fields.title}
          excerpt={fields.excerpt}
        />
      </form>

      <aside aria-label="Publishing and search" className="min-w-0">
        <section aria-labelledby="publish-heading" className="pb-5">
          <div className="flex items-center justify-between gap-3">
            <h2 id="publish-heading" className="font-sarlotte text-[1.4rem] leading-none">
              Publish
            </h2>
            {dirty ? (
              <span className="flex items-center gap-1.5 text-xs text-[var(--paper-soft)]">
                <span aria-hidden className="size-1.5 rounded-full bg-[var(--pending-ink)]" />
                Unsaved changes
              </span>
            ) : null}
          </div>

          <p className="mt-3 flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className={`h-1 w-6 rounded-full ${
                status === "published" ? "bg-[var(--live-ink)]" : status === "scheduled" ? "bg-[var(--pending-ink)]" : "bg-[var(--paper-rule)]"
              }`}
            />
            {status === "published" && post?.publishedAt
              ? `Published ${lagos(post.publishedAt)}`
              : status === "scheduled" && post?.publishedAt
                ? `Scheduled for ${lagos(post.publishedAt)}`
                : post
                  ? "Draft"
                  : "New draft, not saved yet"}
          </p>

          <div className="mt-4">
            <label htmlFor="post-publish-at" className={label}>
              Publish date
            </label>
            {mounted ? (
              <input
                id="post-publish-at"
                type="datetime-local"
                value={publishLocal}
                onChange={(event) => {
                  setPublishAt(event.target.value);
                  setDirty(true);
                }}
                className={inputClass}
              />
            ) : (
              <div className={`${inputClass} h-[38px]`} aria-hidden />
            )}
            <p className={help}>
              Empty publishes now. A future date schedules it; it goes live on its own. In your computer&rsquo;s time
              zone.
            </p>
          </div>

          {post?.status === "published" ? (
            <label className="mt-4 flex items-start gap-2.5 text-sm leading-snug">
              <input
                type="checkbox"
                name="markUpdated"
                form="post-form"
                checked={markUpdated}
                onChange={(event) => setMarkUpdated(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--paper-ink)]"
              />
              <span>
                Mark as updated today
                <span className={`${help} block`}>
                  For a real change to what the post says. Readers and search engines see the new date; leave it off for
                  typo fixes.
                </span>
              </span>
            </label>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {post?.status === "published" ? (
              <>
                <button type="submit" form="post-form" name="intent" value="publish" ref={saveButton} disabled={pending} className={primaryButtonClass}>
                  {pending ? "Saving…" : "Update"}
                </button>
                <button
                  type="submit"
                  form="post-form"
                  name="intent"
                  value="unpublish"
                  disabled={pending}
                  className={secondaryButtonClass}
                  onClick={confirmFirst(
                    live
                      ? "Unpublish this post? Its address will show the site's 404 until you publish it again."
                      : "Cancel the schedule and make this a draft again?"
                  )}
                >
                  Unpublish
                </button>
              </>
            ) : (
              <>
                <button type="submit" form="post-form" name="intent" value="publish" disabled={pending} className={primaryButtonClass}>
                  {pending ? "Saving…" : future ? "Schedule" : "Publish"}
                </button>
                <button type="submit" form="post-form" name="intent" value="save" ref={saveButton} disabled={pending} className={secondaryButtonClass}>
                  Save draft
                </button>
              </>
            )}
          </div>
          <ActionNote state={state} id="post-form" />
          <p className={`${help} mt-3`}>⌘S saves{post?.status === "published" ? " and updates the live post" : " the draft"}.</p>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {post ? (
              <Link href={`/admin/blog/${post.id}/preview`} target="_blank" className="underline underline-offset-4">
                Preview saved version
              </Link>
            ) : null}
            {post && live ? (
              <Link href={`/blog/${post.slug}`} target="_blank" className="underline underline-offset-4">
                View live
              </Link>
            ) : null}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() =>
                download(
                  `${fields.slug || "post"}.md`,
                  toMarkdownFile({
                    ...fields,
                    publishedAt: post?.publishedAt ?? null,
                    contentUpdatedAt: post?.contentUpdatedAt ?? null,
                  })
                )
              }
            >
              Download .md
            </button>
          </div>
        </section>

        <Panel title="Checklist" description="What helps a post be found, answered from and quoted. Guidance only: nothing here stops a publish.">
          <Checklist checks={checks} />
        </Panel>

        <Panel title="Search" description="How the post appears in Google and Bing.">
          <SerpPreview title={title} description={description} slug={fields.slug} />
          <TextField
            id="post-seo-title"
            name="Search title"
            value={fields.seoTitle}
            onChange={(value) => set("seoTitle", value)}
            max={L.seoTitle}
            target={T.seoTitle}
            placeholder={`${fields.title || "Title"} · QRiate+`}
            hint="Empty uses the headline with the product name."
          />
          <TextField
            id="post-meta-description"
            name="Search description"
            value={fields.metaDescription}
            onChange={(value) => set("metaDescription", value)}
            max={L.metaDescription}
            target={T.metaDescription}
            multiline
            rows={3}
            hint="Empty uses the summary."
          />
          <TextField
            id="post-focus-keyword"
            name="Focus keyword"
            value={fields.focusKeyword}
            onChange={(value) => set("focusKeyword", value)}
            max={L.focusKeyword}
            placeholder="minimum qr code size"
            hint="The phrase you most want this post found for. The checklist looks for it."
          />
          <ListInput
            key={`keywords-${version}`}
            id="post-keywords"
            name="More keywords"
            value={fields.keywords}
            onChange={(value) => set("keywords", value)}
            placeholder="qr code on packaging, print size"
            hint="Separate with commas."
          />
        </Panel>

        <Panel
          title="Answer engines"
          description="What Google's answer boxes, voice assistants, ChatGPT and Perplexity quote. Shown at the top and bottom of the post."
        >
          <TextField
            id="post-answer"
            name="Short answer"
            value={fields.answer}
            onChange={(value) => set("answer", value)}
            max={L.answer}
            target={T.answerWords}
            countWordsInstead
            multiline
            rows={4}
            hint="A direct answer to the question in the title, in 40 to 60 words, that makes sense on its own."
          />
          <div>
            <p className={label}>Key takeaways</p>
            <RowList<{ text: string }>
              idPrefix="post-takeaway"
              rows={fields.takeaways.map((text) => ({ text }))}
              onChange={(rows) => set("takeaways", rows.map((row) => row.text))}
              fields={[{ key: "text", label: "Takeaway" }]}
              blank={{ text: "" }}
              addLabel="Add a takeaway"
              max={L.takeaways}
              itemName="Takeaway"
            />
          </div>
          <div>
            <p className={label}>Questions</p>
            <RowList<FaqItem>
              idPrefix="post-faq"
              rows={fields.faq}
              onChange={(rows) => set("faq", rows)}
              fields={[
                { key: "q", label: "Question", placeholder: "Does a dynamic code need to be bigger?" },
                { key: "a", label: "Answer", multiline: true },
              ]}
              blank={{ q: "", a: "" }}
              addLabel="Add a question"
              max={L.faq}
              itemName="Question"
            />
          </div>
          <div>
            <p className={label}>Steps</p>
            <p className={`${help} -mt-0.5 mb-2`}>For a how-to post. Shown as numbered steps and marked up as one.</p>
            <RowList<Step>
              idPrefix="post-step"
              rows={fields.steps}
              onChange={(rows) => set("steps", rows)}
              fields={[
                { key: "name", label: "Step" },
                { key: "text", label: "What to do", multiline: true },
              ]}
              blank={{ name: "", text: "" }}
              addLabel="Add a step"
              max={L.steps}
              itemName="Step"
            />
          </div>
        </Panel>

        <Panel
          title="Sources"
          description="Where the facts come from. Cited posts are quoted more by generative engines, and readers trust them more."
        >
          <RowList<Source>
            idPrefix="post-source"
            rows={fields.sources}
            onChange={(rows) => set("sources", rows)}
            fields={[
              { key: "title", label: "Title" },
              { key: "url", label: "Address", type: "url", placeholder: "https://" },
              { key: "publisher", label: "Publisher (optional)" },
            ]}
            blank={{ title: "", url: "", publisher: "" }}
            addLabel="Add a source"
            max={L.sources}
            itemName="Source"
          />
        </Panel>

        <Panel title="Images and sharing" description="The cover leads the post. Shares use a generated card unless you set a social image.">
          <ImageField
            id="post-cover"
            name="Cover image"
            value={fields.coverUrl}
            onChange={(value) => set("coverUrl", value)}
            uploads={uploads}
            hint="Optional. 16:9 reads best. PNG, JPEG or WebP."
          />
          {fields.coverUrl ? (
            <TextField
              id="post-cover-alt"
              name="Cover description"
              value={fields.coverAlt}
              onChange={(value) => set("coverAlt", value)}
              max={L.coverAlt}
              hint="What the image shows, for people who cannot see it. Needed to publish."
            />
          ) : null}
          <SocialPreview
            title={fields.ogTitle || fields.seoTitle || fields.title}
            description={fields.ogDescription || description}
            image={fields.ogImageUrl}
            category={fields.category}
          />
          <TextField
            id="post-og-title"
            name="Social title"
            value={fields.ogTitle}
            onChange={(value) => set("ogTitle", value)}
            max={L.ogTitle}
            hint="Empty uses the search title."
          />
          <TextField
            id="post-og-description"
            name="Social description"
            value={fields.ogDescription}
            onChange={(value) => set("ogDescription", value)}
            max={L.ogDescription}
            multiline
            rows={2}
            hint="Empty uses the search description."
          />
          <ImageField
            id="post-og-image"
            name="Social image"
            value={fields.ogImageUrl}
            onChange={(value) => set("ogImageUrl", value)}
            uploads={uploads}
            hint="Optional, 1200 × 630. Empty uses the generated card."
          />
        </Panel>

        <Panel title="Author and topics" description="A named author and clear topics help search engines judge who the advice comes from and what it covers.">
          <TextField id="post-author" name="Author" value={fields.authorName} onChange={(value) => set("authorName", value)} max={L.authorName} />
          <TextField id="post-author-role" name="Author's role" value={fields.authorRole} onChange={(value) => set("authorRole", value)} max={L.authorRole} placeholder="Print production lead, De Sign Plus" />
          <TextField
            id="post-author-url"
            name="Author's page (optional)"
            type="url"
            inputMode="url"
            value={fields.authorUrl}
            onChange={(value) => set("authorUrl", value)}
            max={L.url}
            placeholder="https://"
          />
          <TextField id="post-category" name="Section" value={fields.category} onChange={(value) => set("category", value)} max={L.category} placeholder="Printing" hint="One word or two. Shown on the blog's board." />
          <ListInput key={`tags-${version}`} id="post-tags" name="Tags" value={fields.tags} onChange={(value) => set("tags", value)} placeholder="packaging, labels" hint="Separate with commas. Posts sharing a tag are suggested after each other." />
          <ListInput key={`about-${version}`} id="post-about" name="Topics" value={fields.about} onChange={(value) => set("about", value)} placeholder="QR code, Packaging, Lagos" hint="The things the post is about, as a search engine would name them." />
        </Panel>

        <Panel title="Advanced" defaultOpen={false}>
          <TextField
            id="post-canonical"
            name="Canonical address"
            type="url"
            inputMode="url"
            value={fields.canonicalUrl}
            onChange={(value) => set("canonicalUrl", value)}
            max={L.url}
            placeholder="https://"
            hint="Only if this post first appeared on another site. It is then left out of this site's sitemap."
          />
          <label className="flex items-start gap-2.5 text-sm leading-snug">
            <input
              type="checkbox"
              checked={fields.noindex}
              onChange={(event) => set("noindex", event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--paper-ink)]"
            />
            <span>
              Keep out of search results
              <span className={`${help} block`}>The post stays public at its address; search engines are asked not to list it.</span>
            </span>
          </label>
        </Panel>

        {post?.status === "draft" ? (
          <form action={deleteAction} className="border-t border-[var(--paper-rule)] pt-5">
            <input type="hidden" name="id" value={post.id} />
            <button
              type="submit"
              disabled={deleting}
              className={dangerButtonClass}
              onClick={confirmFirst("Delete this draft? It cannot be brought back.")}
            >
              {deleting ? "Deleting…" : "Delete draft"}
            </button>
            <ActionNote state={deleteState} id="post-delete" />
          </form>
        ) : null}
      </aside>
    </div>
  );
}
