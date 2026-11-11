import type { Metadata } from "next";
import { uploadsEnabled } from "@/lib/uploads";
import { audit, requireStaff } from "../../guard";
import { AdminShell } from "../../AdminShell";
import { PostEditor } from "../PostEditor";

export const metadata: Metadata = { title: "New post" };
export const instant = false;

export default async function AdminNewPost() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/blog/new" });

  return (
    <AdminShell heading="New post" current="/admin/blog" back={{ href: "/admin/blog", label: "All posts" }}>
      <PostEditor post={null} uploads={uploadsEnabled()} />
    </AdminShell>
  );
}
