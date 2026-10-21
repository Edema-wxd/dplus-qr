"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";

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

  const { error } = await auth.signIn.email({ email, password });
  if (error) {
    // Deliberately not distinguishing "no such account" from "wrong password":
    // that difference tells an attacker which emails are registered.
    return { error: "That email and password do not match." };
  }

  redirect("/account");
}

export async function signOutAction(): Promise<void> {
  await auth.signOut();
  redirect("/auth/sign-in");
}
