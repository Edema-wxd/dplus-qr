"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth/server";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export type ForgotState = { error?: string; sentTo?: string; sentAt?: number };

/**
 * Where the reset link should land. It has to be absolute: Managed Auth
 * resolves a relative `redirectTo` against its own host, not ours. The service
 * checks the result against the trusted domains registered for this branch, so
 * a forged Host header cannot send a reset token to an origin we never added.
 */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function forgotPasswordAction(
  _previous: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { email } = parsed.data;

  const { error } = await auth.requestPasswordReset({
    email,
    redirectTo: `${await origin()}/auth/reset-password`,
  });

  // Never surfaced. "No such account" must look exactly like success, or this
  // form tells anyone with a list of addresses which of them hold accounts --
  // the same leak signInAction and signUpAction refuse to make. A genuine
  // failure is logged so it is still visible to us.
  if (error) console.error("[forgot-password] request failed", error);

  return { sentTo: email, sentAt: Date.now() };
}
