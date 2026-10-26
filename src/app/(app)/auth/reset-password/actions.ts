"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";

const schema = z.object({
  token: z.string().min(1),
  // Managed Auth enforces its own minimum; this is the friendlier first pass.
  password: z.string().min(8, "Use at least 8 characters."),
});

export type ResetState = { error?: string; invalidLink?: boolean };

export async function resetPasswordAction(
  _previous: ResetState,
  formData: FormData
): Promise<ResetState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    // A missing token is a broken link; anything else is the password rule.
    const tokenIssue = parsed.error.issues.find((i) => i.path[0] === "token");
    if (tokenIssue) return { invalidLink: true };
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { error } = await auth.resetPassword({
    newPassword: parsed.data.password,
    token: parsed.data.token,
  });

  if (error) {
    const text = `${(error as { code?: string }).code ?? ""} ${(error as { message?: string }).message ?? ""}`.toLowerCase();
    if (text.includes("token")) return { invalidLink: true };
    if (text.includes("password")) {
      return { error: "That password was refused. Use at least 8 characters, and something you have not used elsewhere." };
    }
    console.error("[reset-password] rejected by auth provider", error);
    return { error: "We could not reset your password. Please try again." };
  }

  redirect("/auth/sign-in?reset=1");
}
