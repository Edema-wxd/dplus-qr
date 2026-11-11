"use server";

import { auth } from "@/lib/auth/server";
import { allowVerificationEmail } from "@/lib/ratelimit";

export type VerifyState = { sent?: string; error?: string };

/**
 * Send the email-confirmation link again.
 *
 * A new account's codes are held until its address is confirmed (migration
 * 033), and Neon Auth's link expires, so a person whose first link went to
 * spam or lapsed needs another, or their codes never open.
 *
 * Takes nothing from the form. The address is the session's own, so this can
 * only ever mail the person asking, never someone they name. Limited per
 * account, because every link goes out from the onboarding address.
 */
export async function resendVerificationAction(_previous: VerifyState, _form: FormData): Promise<VerifyState> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return { error: "Your session has ended. Sign in again, then ask for a new link." };
  if (user.emailVerified) return { error: "Your email is already confirmed. Reload the page." };

  if (!(await allowVerificationEmail(user.id))) {
    return { error: "We've sent several links today. Check your spam folder, or ask again tomorrow." };
  }

  try {
    const { error } = await auth.sendVerificationEmail({ email: user.email });
    if (error) {
      console.error("[verify] resend refused", error.status, error.message);
      return { error: "That link didn't send. Try again in a minute." };
    }
  } catch (error) {
    console.error("[verify] resend failed", error);
    return { error: "That link didn't send. Try again in a minute." };
  }

  return { sent: user.email };
}
