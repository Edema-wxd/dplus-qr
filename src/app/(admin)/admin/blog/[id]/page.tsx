import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPost } from "@/lib/blog";
import { POST_STATE_LABELS, postState } from "@/lib/blog-schema";
import { uploadsEnabled } from "@/lib/uploads";
import { audit, requireStaff } from "../../guard";
import { AdminShell } from "../../AdminShell";
import { PostEditor } from "../PostEditor";

export const metadata: Metadata = { title: "Edit post" };
export const instant = false;

export default async function AdminEditPost({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const id = z.coerce.number().int().positive().safeParse((await params).id);
  if (!id.success) notFound();

  const post = await getPost(id.data);
  if (!post) notFound();
  audit(staff, { action: "view", targetType: "blog_post", targetId: post.slug });

  return (
    <AdminShell
      heading="Edit post"
      current="/admin/blog"
      back={{ href: "/admin/blog", label: "All posts" }}
      meta={
        <>
          {POST_STATE_LABELS[postState(post)]}. Last saved{" "}
          {new Date(post.updatedAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}.
        </>
      }
    >
      {/* Keyed by the post, so moving between posts never carries one's edits into another. */}
      <PostEditor key={post.id} post={post} uploads={uploadsEnabled()} />
    </AdminShell>
  );
}
