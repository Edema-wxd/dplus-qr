"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
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

export async function signOutAction(): Promise<void> {
  await auth.signOut();
  await flash("signed-out");
  redirect("/auth/sign-in");
}
