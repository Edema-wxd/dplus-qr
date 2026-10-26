"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";

const schema = z.object({
  name: z.string().trim().min(2, "Enter the business or contact name."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  // Managed Auth enforces its own minimum; this is the friendlier first pass.
  password: z.string().min(8, "Use at least 8 characters."),
});

export type SignUpState = { error?: string };

/**
 * What to show when Managed Auth refuses a sign-up.
 *
 * Never the provider's own message. "User already exists" is the exact fact
 * `signInAction` refuses to reveal -- it tells anyone with a form and a list
 * of addresses which of them hold accounts here, and a leak on the sign-up
 * page is the same leak as one on the sign-in page. So an existing account
 * gets the one reply that is true either way and useful to the person who
 * really does own it.
 *
 * Anything else is logged and answered generically: a provider message is
 * written for us, not for a customer, and may name internals.
 */
function signUpMessage(error: unknown): string {
  const field = (key: string): string => {
    if (typeof error !== "object" || error === null) return "";
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  };

  const code = field("code").toUpperCase();
  const message = field("message").toLowerCase();

  const exists =
    code.includes("USER_ALREADY_EXISTS") ||
    code.includes("EMAIL_ALREADY") ||
    message.includes("already exists") ||
    message.includes("already registered") ||
    message.includes("already in use");

  if (exists) {
    return "We could not create an account with those details. If that email is already registered, sign in instead or reset your password.";
  }

  if (code.includes("PASSWORD") || message.includes("password")) {
    return "That password was refused. Use at least 8 characters, and something you have not used elsewhere.";
  }

  console.error("[sign-up] rejected by auth provider", error);
  return "We could not create that account. Please check the details and try again.";
}

export async function signUpAction(
  _previous: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { name, email, password } = parsed.data;

  const { data, error } = await auth.signUp.email({ email, name, password });
  if (error) {
    return { error: signUpMessage(error) };
  }

  // Create the platform's own row for this account. Neon Auth owns the
  // account; nothing links the two automatically, so this is the seam.
  if (data?.user) {
    try {
      await ensureProfile({ id: data.user.id, email: data.user.email, name: data.user.name });
    } catch (profileError) {
      // The account exists and the person is signed in. Failing here would
      // strand them; the account page retries on every load.
      console.error("[sign-up] profile creation failed", profileError);
    }
  }

  redirect("/app");
}
