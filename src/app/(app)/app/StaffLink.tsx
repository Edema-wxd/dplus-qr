import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { isAdmin } from "@/lib/admin";
import { StaffGroup } from "./DashNav";

/**
 * The sidebar's link to the staff admin, for admins only.
 *
 * Decided on the server, so the link is never sent to anyone else: a
 * customer's page carries no hint that `/admin` exists. Streamed behind
 * Suspense like the plan meter, and any failure renders nothing, since the
 * admin is still reachable by its address.
 */
export async function StaffLink() {
  await connection();
  return (await isStaff()) ? <StaffGroup /> : null;
}

async function isStaff(): Promise<boolean> {
  try {
    const { data: session } = await auth.getSession();
    return session?.user ? await isAdmin(session.user.id) : false;
  } catch (error) {
    console.error("[dash] could not check staff role", error);
    return false;
  }
}
