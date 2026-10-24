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
    return { error: error.message ?? "We could not create that account." };
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
