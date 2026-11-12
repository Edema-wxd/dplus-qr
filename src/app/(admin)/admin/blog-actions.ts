"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { flash } from "@/lib/flash";
import {
  createPost,
  deletePost,
  getPost,
  publishPost,
  unpublishPost,
  updatePost,
} from "@/lib/blog";
import {
  BLOG_IMPORT_MAX_FILES,
  MARKDOWN_FILE_MAX_BYTES,
  importedFields,
  parseMarkdownFile,
} from "@/lib/blog-frontmatter";
import {
  BLOG_LIMITS,
  firstPostIssue,
  isPublic,
  postFieldsSchema,
  postSchema,
  slugify,
  type Post,
  type PostFields,
} from "@/lib/blog-schema";
import { recordChange, staffForAction } from "./guard";
import type { AdminFormState } from "./actions";

/**
 * Staff changes to the blog. Each action re-checks that the caller is an
 * admin, validates with the schema the editor already checked against, and
 * writes an audit row naming who changed what.
 *
 * A draft saves with whatever it has; publishing asks for more (a body, and a
 * description for any cover image), because that is when a reader sees it.
 */

const REFUSED: AdminFormState = { error: "Only staff can do that." };

const idSchema = z.coerce.number().int().positive();

/** An ISO timestamp from the editor (converted from the browser's local time), or empty for "now". */
const publishAtSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), { message: "Choose a valid publish date." })
  .transform((value) => (value === "" ? null : new Date(value).toISOString()));

const intentSchema = z.enum(["save", "publish", "unpublish"]);

function readPost(form: FormData): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(String(form.get("post") ?? "")) };
  } catch {
    return { ok: false, error: "The post could not be read. Reload the page and try again." };
  }
}

/**
 * What changed, for the audit row. Short fields are kept before and after;
 * the body is summarised by its length, so a 5,000-word post does not land
 * in the audit table twice on every save.
 */
function changes(before: PostFields | null, after: PostFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof PostFields)[]) {
    const was = before ? before[key] : undefined;
    const now = after[key];
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    out[key] =
      key === "bodyMd"
        ? { beforeLength: typeof was === "string" ? was.length : 0, afterLength: (now as string).length }
        : { before: was ?? null, after: now };
  }
  return out;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });

function revalidate(slugs: string[], id?: number) {
  revalidatePath("/blog");
  for (const slug of new Set(slugs)) revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin/blog");
  if (id) revalidatePath(`/admin/blog/${id}`);
}

/** What publishing needs on top of a draft. */
function readyToPublish(post: PostFields): string | null {
  const check = postSchema.safeParse(post);
  if (!check.success) return firstPostIssue(check.error);
  if (!post.bodyMd.trim()) return "Body: write the post before publishing it.";
  return null;
}

/**
 * Save the editor: a new post, or changes to one, and optionally publish,
 * schedule or unpublish it in the same step.
 */
export async function savePostAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const intent = intentSchema.safeParse(form.get("intent") ?? "save");
  if (!intent.success) return { error: "That is not something this form can do." };

  const raw = readPost(form);
  if (!raw.ok) return { error: raw.error };
  const parsed = postFieldsSchema.safeParse(raw.value);
  if (!parsed.success) return { error: firstPostIssue(parsed.error) };
  const fields = parsed.data;

  const publishAt = publishAtSchema.safeParse(form.get("publishAt") ?? "");
  if (!publishAt.success) return { error: publishAt.error.issues[0]?.message ?? "Choose a valid publish date." };

  if (intent.data === "publish") {
    const problem = readyToPublish(fields);
    if (problem) return { error: problem };
  }

  const markUpdated = form.get("markUpdated") === "on";
  const idInput = form.get("id");

  // A new post.
  if (!idInput) {
    let created;
    try {
      created = await createPost(fields, staff.id, { publishedAt: publishAt.data });
    } catch (error) {
      console.error("[admin] blog post create failed", error);
      return { error: "Could not save. Please try again." };
    }
    if (!created.ok) return { error: `Address: ${created.error}` };
    await recordChange(staff, "blog.create", "blog_post", created.slug, { id: created.id, after: changes(null, fields) });

    let flashKey: "post-created" | "post-published" | "post-scheduled" = "post-created";
    if (intent.data === "publish") {
      const published = await publishPost(created.id, staff.id, publishAt.data);
      if (published) {
        const live = isPublic(published);
        await recordChange(staff, live ? "blog.publish" : "blog.schedule", "blog_post", created.slug, {
          id: created.id,
          publishedAt: published.publishedAt,
        });
        flashKey = live ? "post-published" : "post-scheduled";
      }
    }
    revalidate([created.slug], created.id);
    await flash(flashKey);
    redirect(`/admin/blog/${created.id}`);
  }

  // Changes to an existing post.
  const id = idSchema.safeParse(idInput);
  if (!id.success) return { error: "That post does not exist." };
  const before = await getPost(id.data);
  if (!before) return { error: "That post no longer exists. It may have been deleted in another tab." };

  let saved;
  try {
    saved = await updatePost(id.data, fields, staff.id, {
      markUpdated: markUpdated && before.status === "published",
      publishedAt: publishAt.data,
    });
  } catch (error) {
    console.error("[admin] blog post save failed", error);
    return { error: "Could not save. Please try again." };
  }
  if (!saved.ok) return { error: `Address: ${saved.error}` };

  const diff = changes(before, fields);
  if (Object.keys(diff).length > 0 || markUpdated) {
    await recordChange(staff, "blog.update", "blog_post", fields.slug, {
      id: id.data,
      markedUpdated: markUpdated || undefined,
      changes: diff,
    });
  }

  let after: Post | null = null;
  let notice = "Saved.";

  if (intent.data === "publish") {
    after = await publishPost(id.data, staff.id, publishAt.data);
    if (after) {
      const live = isPublic(after);
      const wasLive = isPublic(before);
      if (!wasLive || before.status !== "published") {
        await recordChange(staff, live ? "blog.publish" : "blog.schedule", "blog_post", fields.slug, {
          id: id.data,
          publishedAt: after.publishedAt,
        });
      }
      notice = live
        ? wasLive
          ? `Updated. The live post at /blog/${fields.slug} shows the changes.`
          : `Published. It is live at /blog/${fields.slug}.`
        : `Scheduled. It goes live ${when(after.publishedAt!)}.`;
    }
  } else if (intent.data === "unpublish") {
    after = await unpublishPost(id.data, staff.id);
    if (after) {
      await recordChange(staff, "blog.unpublish", "blog_post", fields.slug, { id: id.data });
      notice = "Unpublished. It is a draft again, and its address shows the site's 404.";
    }
  } else if (before.status === "published") {
    notice = isPublic(before) ? "Saved. The live post shows the changes." : "Saved. It is still scheduled.";
  }

  revalidate([before.slug, fields.slug], id.data);
  return { notice };
}

/** Drafts only. A published post is unpublished first, so nothing live disappears by one click. */
export async function deletePostAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const id = idSchema.safeParse(form.get("id"));
  if (!id.success) return { error: "That post does not exist." };
  const post = await getPost(id.data);
  if (!post) return { error: "That post no longer exists." };
  if (post.status !== "draft") return { error: "Unpublish the post before deleting it." };

  let deleted = false;
  try {
    deleted = await deletePost(id.data);
  } catch (error) {
    console.error("[admin] blog post delete failed", error);
    return { error: "Could not delete. Please try again." };
  }
  if (!deleted) return { error: "Only a draft can be deleted. Unpublish it first." };

  await recordChange(staff, "blog.delete", "blog_post", post.slug, { id: id.data, title: post.title });
  revalidate([post.slug]);
  await flash("post-deleted");
  redirect("/admin/blog");
}

export type ImportResult = {
  file: string;
  ok: boolean;
  id?: number;
  title?: string;
  slug?: string;
  error?: string;
  notes?: string[];
};

export type ImportState = { error?: string; results?: ImportResult[] };

/** File names as staff gave them, made into an address when the file has no title. */
function nameWithoutExtension(name: string): string {
  return name.replace(/\.(md|markdown|mdx|txt)$/i, "");
}

/**
 * Bring in `.md` files, each as a new draft. Nothing is published: staff open
 * each draft, check what the file filled, and publish from the editor. An
 * address already taken gets a number on the end, and the result says so.
 */
export async function importPostsAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const staff = await staffForAction();
  if (!staff) return { error: "Only staff can do that." };

  const files = form.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) return { error: "Choose one or more .md files." };
  if (files.length > BLOG_IMPORT_MAX_FILES) return { error: `Import up to ${BLOG_IMPORT_MAX_FILES} files at a time.` };

  const results: ImportResult[] = [];
  for (const file of files) {
    if (file.size > MARKDOWN_FILE_MAX_BYTES) {
      results.push({ file: file.name, ok: false, error: `Over ${MARKDOWN_FILE_MAX_BYTES / 1024} KB.` });
      continue;
    }
    const parsed = parseMarkdownFile(await file.text());
    if (!parsed.ok) {
      results.push({ file: file.name, ok: false, error: parsed.error });
      continue;
    }

    const fields = importedFields(parsed.fields);
    if (!fields.title) fields.title = nameWithoutExtension(file.name).replace(/[-_]+/g, " ").trim().slice(0, BLOG_LIMITS.title);
    fields.slug = slugify(fields.slug || fields.title) || slugify(nameWithoutExtension(file.name)) || "post";

    const checked = postFieldsSchema.safeParse(fields);
    if (!checked.success) {
      results.push({ file: file.name, ok: false, title: fields.title, error: firstPostIssue(checked.error) });
      continue;
    }

    const notes = [...parsed.warnings];
    let created;
    const base = checked.data.slug.slice(0, BLOG_LIMITS.slug - 3);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const slug = attempt === 1 ? checked.data.slug : `${base}-${attempt}`;
      try {
        created = await createPost({ ...checked.data, slug }, staff.id, {
          publishedAt: parsed.publishedAt,
          contentUpdatedAt: parsed.contentUpdatedAt,
        });
      } catch (error) {
        console.error("[admin] blog import failed", error);
        created = { ok: false as const, error: "Could not save this one. Try it again on its own." };
        break;
      }
      if (created.ok || !created.clash) break;
    }

    if (!created || !created.ok) {
      results.push({ file: file.name, ok: false, title: checked.data.title, error: created?.error ?? "Could not save." });
      continue;
    }
    if (created.slug !== checked.data.slug) {
      notes.push(`/blog/${checked.data.slug} was taken, so it is at /blog/${created.slug}.`);
    }
    await recordChange(staff, "blog.import", "blog_post", created.slug, {
      id: created.id,
      file: file.name,
      filled: parsed.filled,
    });
    results.push({ file: file.name, ok: true, id: created.id, title: checked.data.title, slug: created.slug, notes });
  }

  if (results.some((result) => result.ok)) revalidate([]);
  return { results };
}
