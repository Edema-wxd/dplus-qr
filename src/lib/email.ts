import { Resend } from "resend";
import { env } from "@/lib/env";
import { SUPPORT_EMAIL } from "@/lib/brand";

let client: Resend | null | undefined;

function resend(): Resend | null {
  if (client !== undefined) return client;
  const key = env().RESEND_API_KEY;
  client = key ? new Resend(key) : null;
  if (!client && env().NODE_ENV !== "test") {
    console.warn("[email] RESEND_API_KEY absent; emails will be logged, not sent");
  }
  return client;
}

/**
 * Send, or log and carry on. No caller is allowed to fail because an email
 * did not go out -- least of all the abuse report form, where losing the
 * report is far worse than losing the notification.
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const api = resend();
  if (!api) {
    console.info("[email] would send", options.subject, "to", options.to);
    return false;
  }

  try {
    await api.emails.send({
      from: env().EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return true;
  } catch (error) {
    console.error("[email] send failed", error);
    return false;
  }
}

export function notifyAdmin(subject: string, text: string): Promise<boolean> {
  return sendEmail({ to: SUPPORT_EMAIL, subject, text });
}
