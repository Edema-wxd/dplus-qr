import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAdmin, recordAdminAudit, type AdminAuditEntry } from "@/lib/admin";

export type Staff = { id: string; email: string };

/**
 * The gate on every admin page.
 *
 * Anyone who is not a signed-in admin gets the site's ordinary 404, signed-out
 * visitors included, so the admin is not discoverable by probing it. `/admin`
 * is left out of the `proxy.ts` matcher for the same reason: the proxy would
 * answer a signed-out visitor with a redirect to sign-in, which says there is
 * something here. The proxy guards pages; this check is the real one and runs
 * on every request.
 */
export async function requireStaff(): Promise<Staff> {
  // Before the session read: `auth` throws on first use without its env vars,
  // and without this `next build` would try to prerender these pages.
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user || !(await isAdmin(user.id))) notFound();
  return { id: user.id, email: user.email };
}

/**
 * The same check for a Server Action, which is an endpoint anyone can post
 * to whatever page it was rendered on. Returns null rather than throwing a
 * 404, so the action can answer with a plain refusal.
 */
export async function staffForAction(): Promise<Staff | null> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user || !(await isAdmin(user.id))) return null;
  return { id: user.id, email: user.email };
}

/**
 * Record what a staff member looked at, after the response has gone. An audit
 * write that failed must not take the page down with it, and a page view
 * should not wait on one.
 */
export function audit(staff: Staff, entry: Omit<AdminAuditEntry, "actorId">): void {
  after(async () => {
    try {
      await recordAdminAudit({ ...entry, actorId: staff.id });
    } catch (error) {
      console.error("[admin] could not record audit entry", error);
    }
  });
}
