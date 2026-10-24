import { Resend } from "resend";
import { env } from "@/lib/env";
import {
  PRODUCT_NAME,
  SENDING_DOMAIN,
  SUPPORT_EMAIL,
} from "@/lib/brand";

/**
 * Which conversation a message belongs to. Every send names one, so a sender
 * address is never typed at a call site and the grouping cannot drift.
 *
 *   onboarding -- auth and getting started: verification, password reset, OTP,
 *                 welcome. Also the sender configured on Neon Auth's SMTP.
 *   plans      -- billing: receipts, renewals, failed payments, plan changes.
 *   support    -- complaints, abuse reports and replies to a human.
 *
 * Splitting them is not cosmetic. Recipients and spam filters build reputation
 * per address, so a bounced invoice run cannot drag verification mail down
 * with it, and a user can mute billing without muting a password reset.
 */
export type MailGroup = "onboarding" | "plans" | "support";

interface MailIdentity {
  /** `From`. On the send-only domain -- see SENDING_DOMAIN in brand.ts. */
  readonly from: string;
  /** Where a reply goes. MUST be a mailbox that receives. */
  readonly replyTo: string;
  /** Display name, so the three read as one product rather than three. */
  readonly name: string;
}

export const MAIL_GROUPS: Record<MailGroup, MailIdentity> = {
  onboarding: {
    from: `onboarding@${SENDING_DOMAIN}`,
    replyTo: SUPPORT_EMAIL,
    name: PRODUCT_NAME,
  },
  plans: {
    from: `plans@${SENDING_DOMAIN}`,
    replyTo: SUPPORT_EMAIL,
    name: `${PRODUCT_NAME} Billing`,
  },
  support: {
    from: `support@${SENDING_DOMAIN}`,
    replyTo: SUPPORT_EMAIL,
    name: `${PRODUCT_NAME} Support`,
  },
};

/** `QRiate+ Billing <plans@mail.qriateplus.com>`, as Resend wants it. */
export function senderFor(group: MailGroup): string {
  const identity = MAIL_GROUPS[group];
  return `${identity.name} <${identity.from}>`;
}

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
  group: MailGroup;
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const identity = MAIL_GROUPS[options.group];
  const api = resend();
  if (!api) {
    console.info(
      "[email] would send",
      options.subject,
      "to",
      options.to,
      `as ${options.group}`
    );
    return false;
  }

  try {
    await api.emails.send({
      from: senderFor(options.group),
      replyTo: identity.replyTo,
      to: options.to,
      subject: options.subject,
      text: options.text,
    });
    return true;
  } catch (error) {
    console.error(`[email] ${options.group} send failed`, error);
    return false;
  }
}

/** Internal alert to the team: always support, always to a real inbox. */
export function notifyAdmin(subject: string, text: string): Promise<boolean> {
  return sendEmail({ group: "support", to: SUPPORT_EMAIL, subject, text });
}
