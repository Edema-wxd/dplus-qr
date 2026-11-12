"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { endAllSessions } from "@/lib/auth/sessions";
import { reportError } from "@/lib/error-alerts";
import { AUTH_COOKIE_PREFIX } from "@/lib/session-cookie";
import { afterAuthPath, INVITE_PARAM } from "@/lib/team-invite";
import { flash } from "@/lib/flash";
import { clientIp, ipRateKey } from "@/lib/ip";
import { allowAuth, authBudgetLeft, emailRateKey } from "@/lib/ratelimit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type SignInState = { error?: string };

export async function signInAction(
  _previous: SignInState,
  formData: FormData
): Promise<SignInState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { email, password } = parsed.data;

  // Before Managed Auth, which cannot see who is asking (`allowAuth` in
  // ratelimit.ts). The account limit counts failures only, so it is checked
  // here and spent below. Both answers name no account, so neither says
  // whether one exists.
  const visitor = ipRateKey(clientIp(await headers()));
  const account = emailRateKey(email);
  if (!(await allowAuth("sign-in-visitor", visitor))) {
    return { error: "Too many sign-in attempts from here. Wait a few minutes and try again." };
  }
  if (!(await authBudgetLeft("sign-in-account", account))) {
    return {
      error: "Too many failed attempts for that email. Wait 15 minutes, or reset your password.",
    };
  }

  const { error } = await auth.signIn.email({ email, password });
  if (error) {
    await allowAuth("sign-in-account", account);
    // Deliberately not distinguishing "no such account" from "wrong password":
    // that difference tells an attacker which emails are registered.
    return { error: "That email and password do not match." };
  }

  // Back to the invitation, when the form carried one (checked in afterAuthPath).
  redirect(afterAuthPath(formData.get(INVITE_PARAM)));
}

/**
 * Sign out everywhere: every session this person has, on every device, ends
 * now, not when each device's cached copy runs out (DECISIONS.md, 11 November
 * 2026).
 *
 * Neon Auth is asked first, so its own records agree. The rows are then
 * deleted directly as well. That step is what makes it certain and instant:
 * it is one statement in our own database, and `getSession` refuses any
 * session whose row is gone. This device's cookies are cleared last, whatever
 * happened before, so pressing the button always signs this device out.
 */
export async function signOutAction(): Promise<void> {
  const { data: session } = await auth.getSession();
  const userId = session?.user?.id;

  let everywhere = true;
  if (userId) {
    const { error } = await auth.revokeSessions();
    if (error) console.error("[sign-out] Neon Auth could not revoke the sessions", error.message);
    try {
      await endAllSessions(userId);
    } catch (dbError) {
      // Neon Auth's own revoke may still have worked; only both failing
      // leaves other devices signed in.
      if (error) everywhere = false;
      await reportError(dbError, { where: "sign-out" });
    }
  }

  const jar = await cookies();
  for (const { name } of jar.getAll()) {
    if (name.startsWith(AUTH_COOKIE_PREFIX)) {
      jar.set(name, "", { path: "/", maxAge: 0, secure: true, httpOnly: true, sameSite: "lax" });
    }
  }

  await flash(everywhere ? "signed-out" : "signed-out-here-only");
  redirect("/auth/sign-in");
}
