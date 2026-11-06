import { notFound } from "next/navigation";
import { after, connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAdmin, recordAdminAudit, type AdminAuditEntry } from "@/lib/admin";

export type Staff = { id: string; email: string };

/**
 * The gate on every admin page.
 *
 * Anyone who is not a signed-in admin gets the site's ordinary 404, signed-out
 * visitors included, so the admin is not discoverable by probing it.
 * `proxy.ts` normally answers them before this runs, with the exact response
 * a missing page gets, because by the time this runs the page has already
 * streamed its title and loading screen. It also refreshes the session, which
 * this check could not do from inside a page. This check is still the real
 * one: it runs on every request, and it decides whenever the proxy cannot.
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

/**
 * Record a change staff made, before answering. Awaited, unlike `audit`, so
 * the row lands with the change; but a failed write does not fail the
 * request: the change has been made, and failing now would only make staff
 * repeat it. Logged loudly instead, so the gap can be filled by hand.
 */
export async function recordChange(
  staff: Staff,
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    await recordAdminAudit({ actorId: staff.id, action, targetType, targetId, detail });
  } catch (error) {
    console.error("[admin] change made but audit row not written", { action, targetId, error });
  }
}
