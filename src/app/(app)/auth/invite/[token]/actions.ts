"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { flash } from "@/lib/flash";
import { isInviteToken } from "@/lib/team-invite";
import { acceptInvite } from "@/lib/team";

export type AcceptState = { error?: string };

/**
 * Accept an invitation as the signed-in person. Their identity comes from
 * the session; the token from the form is only what to accept, and
 * `acceptInvite` checks it against the invited address under the account
 * lock.
 */
export async function acceptInviteAction(_previous: AcceptState, formData: FormData): Promise<AcceptState> {
  const token = formData.get("token");
  if (!isInviteToken(token)) return { error: "That invitation could not be found." };

  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect(`/auth/sign-in?invite=${token}`);

  // The member row references the profile, which a brand-new account may
  // not have yet if its first stop is this page.
  await ensureProfile({ id: user.id, email: user.email, name: user.name });

  let result;
  try {
    result = await acceptInvite(
      { id: user.id, email: user.email, emailVerified: user.emailVerified === true },
      token
    );
  } catch (error) {
    console.error("[team] accept failed", error);
    return { error: "We could not accept that invitation. Please try again." };
  }
  if (!result.ok) return { error: result.reason };

  await flash("team-joined");
  redirect("/app");
}

