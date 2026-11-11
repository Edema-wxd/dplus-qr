import type { Metadata } from "next";
import Link from "next/link";
import { primaryButtonClass } from "@/components/controls";
import { listPostsForStaff } from "@/lib/blog";
import { renderMarkdown } from "@/lib/blog-markdown";
import { POST_STATE_LABELS, postState, type PostState } from "@/lib/blog-schema";
import { auditPost } from "@/lib/blog-seo";
import { audit, requireStaff } from "../guard";
import { AdminShell, tableClass, tdClass, thClass } from "../AdminShell";
import { ImportPosts } from "./ImportPosts";

export const metadata: Metadata = { title: "Blog posts" };
export const instant = false;

const STATE_BAR: Record<PostState, string> = {
  draft: "bg-[var(--paper-rule)]",
  scheduled: "bg-[var(--pending-ink)]",
  published: "bg-[var(--live-ink)]",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-NG", { dateStyle: "medium", timeZone: "Africa/Lagos" }) : "—";

/**
 * Every post, drafts and scheduled ones included, newest first, with how far
 * each is through the checklist. New posts are written here or imported from
 * `.md` files; each opens to the editor.
 */
export default async function AdminBlog() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/blog" });

  const posts = await listPostsForStaff();
  const rows = posts.map((post) => {
    const rendered = renderMarkdown(post.bodyMd);
    const checks = auditPost(post, rendered);
    return { post, state: postState(post), words: rendered.words, passing: checks.filter((c) => c.pass).length, total: checks.length };
  });
  const counts = {
    published: rows.filter((row) => row.state === "published").length,
    scheduled: rows.filter((row) => row.state === "scheduled").length,
    draft: rows.filter((row) => row.state === "draft").length,
  };

  return (
    <AdminShell
      heading="Blog"
      current="/admin/blog"
      meta={
        posts.length > 0
          ? `${counts.published} published, ${counts.scheduled} scheduled, ${counts.draft} ${counts.draft === 1 ? "draft" : "drafts"}. Public at /blog.`
          : "Posts appear at /blog once published."
      }
      actions={
        <Link href="/admin/blog/new" className={`${primaryButtonClass} no-underline`}>
          New post
        </Link>
      }
    >
      <ImportPosts />

      {posts.length === 0 ? (
        <div className="mt-8 max-w-xl rounded-lg border border-[var(--paper-rule)] bg-white px-5 py-6">
          <p className="font-sarlotte text-[1.4rem] leading-tight">No posts yet</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--paper-soft)]">
            Write the first one, or import posts you have written elsewhere as .md files. Each import arrives as a
            draft for you to check and publish.
          </p>
          <Link href="/admin/blog/new" className={`${primaryButtonClass} mt-4 no-underline`}>
            Write a post
          </Link>
        </div>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
          <table className={`${tableClass} min-w-[52rem]`}>
            <thead className="border-b border-[var(--paper-rule)]">
              <tr>
                <th scope="col" className={thClass}>Post</th>
                <th scope="col" className={thClass}>State</th>
                <th scope="col" className={thClass}>Publish date</th>
                <th scope="col" className={thClass}>Last edit</th>
                <th scope="col" className={`${thClass} text-right`}>Words</th>
                <th scope="col" className={`${thClass} text-right`}>Checklist</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ post, state, words, passing, total }) => (
                <tr key={post.id} className="border-b border-[var(--paper-rule)] last:border-b-0">
                  <td className={tdClass}>
                    <Link href={`/admin/blog/${post.id}`} className="block font-medium underline underline-offset-4">
                      {post.title}
                    </Link>
                    <span className="block font-mono text-xs text-[var(--paper-soft)]">/blog/{post.slug}</span>
                  </td>
                  <td className={`${tdClass} whitespace-nowrap`}>
                    <span className="inline-flex items-center gap-2">
                      <span aria-hidden className={`h-1 w-5 rounded-full ${STATE_BAR[state]}`} />
                      {POST_STATE_LABELS[state]}
                    </span>
                  </td>
                  <td className={`${tdClass} dash-num whitespace-nowrap`}>{when(post.publishedAt)}</td>
                  <td className={`${tdClass} dash-num whitespace-nowrap`}>{when(post.updatedAt)}</td>
                  <td className={`${tdClass} dash-num text-right`}>{words.toLocaleString("en-NG")}</td>
                  <td className={`${tdClass} dash-num whitespace-nowrap text-right`}>
                    {passing} of {total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
