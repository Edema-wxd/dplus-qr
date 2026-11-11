import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Article } from "@/app/blog/_components/Article";
import { BlogHeader } from "@/app/blog/_components/BlogChrome";
import { getPost } from "@/lib/blog";
import { renderMarkdown } from "@/lib/blog-markdown";
import { postState } from "@/lib/blog-schema";
import { audit, requireStaff } from "../../../guard";

export const metadata: Metadata = { title: "Post preview" };
export const instant = false;

/**
 * The saved post exactly as the public page renders it, with the same
 * `Article`, whatever its state. Staff only; the root layout's `noindex`
 * keeps it out of search, and `/admin` is never in the sitemap.
 */
export default async function AdminPostPreview({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const id = z.coerce.number().int().positive().safeParse((await params).id);
  if (!id.success) notFound();

  const post = await getPost(id.data);
  if (!post) notFound();
  audit(staff, { action: "view", targetType: "blog_post", targetId: `${post.slug}/preview` });

  const state = postState(post);
  const rendered = renderMarkdown(post.bodyMd);

  return (
    <div className="lp min-h-dvh">
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 bg-(--amber) px-5 py-2.5 text-sm text-(--ink) sm:px-10"
      >
        <span>
          {state === "published"
            ? "Preview of the saved post. It is live."
            : state === "scheduled"
              ? "Preview of a scheduled post. Readers cannot see it yet."
              : "Preview of a draft. Readers cannot see it."}
        </span>
        <Link href={`/admin/blog/${post.id}`} className="underline underline-offset-4" data-plain>
          Back to the editor
        </Link>
      </div>
      <BlogHeader current="post" />
      <Article post={post} rendered={rendered} />
    </div>
  );
}
