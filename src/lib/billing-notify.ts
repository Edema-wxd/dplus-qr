import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";

/**
 * What the customer is told when their billing state changes.
 *
 * Every function here is best effort and returns rather than throws.
 * `sendEmail` already logs and carries on instead of failing its caller, and
 * these are called after the webhook transaction has committed: an email that
 * does not send must never make Paystack retry a charge we have already
 * applied.
 *
 * Sent from the `plans` group, which is what that sender exists for -- a
 * failed-payment notice arriving from the onboarding address is the kind of
 * mixed signal that gets a domain filtered.
 */
type Recipient = { email: string; name: string };

async function recipient(userId: string): Promise<Recipient | null> {
  return queryOne<Recipient>("select email, name from qr_users where id = $1", [userId]);
}

function billingUrl(): string {
  return `${env().QR_BASE_URL}/billing`;
}

function date(value: Date | null): string {
  return value ? value.toLocaleDateString("en-NG", { dateStyle: "long" }) : "shortly";
}

/**
 * A failed renewal. The most important email in the system: it is the only
 * warning before printed codes stop working, so it says what will happen, when,
 * and exactly what to do -- and never implies anything has been deleted.
 */
export async function notifyPaymentFailed(input: {
  userId: string;
  planName: string;
  graceUntil: Date;
}): Promise<void> {
  const to = await recipient(input.userId);
  if (!to) return;

  await sendEmail({
    group: "plans",
    to: to.email,
    subject: `Action needed: your ${PRODUCT_NAME} payment did not go through`,
    text: [
      `Hi ${to.name},`,
      "",
      `We could not charge your card for the ${input.planName} plan.`,
      "",
      `Your QR codes are still working. They will keep working until`,
      `${date(input.graceUntil)}, and if a payment succeeds before then nothing`,
      "changes at all.",
      "",
      `Update your card here: ${billingUrl()}`,
      "",
      "If that date passes, your codes show a \"temporarily unavailable\" page",
      "instead of your links. Nothing is deleted — not your codes, not their",
      "destinations, not your scan history — and every printed code starts",
      "working again the moment a payment goes through.",
      "",
      `Questions: ${SUPPORT_EMAIL}`,
      "",
      `— ${PRODUCT_NAME}`,
    ].join("\n"),
  });
}

/** A successful charge: the first one, or a renewal. */
export async function notifyPaymentSucceeded(input: {
  userId: string;
  planName: string;
  periodEnd: Date | null;
  first: boolean;
}): Promise<void> {
  const to = await recipient(input.userId);
  if (!to) return;

  await sendEmail({
    group: "plans",
    to: to.email,
    subject: input.first
      ? `Your ${PRODUCT_NAME} ${input.planName} plan is active`
      : `${PRODUCT_NAME} payment received`,
    text: [
      `Hi ${to.name},`,
      "",
      input.first
        ? `Your ${input.planName} plan is active and your codes are live.`
        : `Thank you — your ${input.planName} plan has renewed.`,
      "",
      input.periodEnd ? `Next payment: ${date(input.periodEnd)}.` : "",
      "",
      `Your plan and payment details: ${billingUrl()}`,
      "",
      `— ${PRODUCT_NAME}`,
    ]
      .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
      .join("\n"),
  });
}

/**
 * A subscription that will not renew.
 *
 * Deliberately not a goodbye: the codes are still serving until the period
 * ends, and saying otherwise would send people hunting for a problem that does
 * not exist yet.
 */
export async function notifyCancelled(input: {
  userId: string;
  planName: string;
  periodEnd: Date | null;
}): Promise<void> {
  const to = await recipient(input.userId);
  if (!to) return;

  await sendEmail({
    group: "plans",
    to: to.email,
    subject: `Your ${PRODUCT_NAME} plan will not renew`,
    text: [
      `Hi ${to.name},`,
      "",
      `Your ${input.planName} plan is set to stop renewing.`,
      "",
      input.periodEnd
        ? `Your codes keep working until ${date(input.periodEnd)}.`
        : "Your codes keep working until the end of the current period.",
      "",
      "After that they show a \"temporarily unavailable\" page. Nothing is",
      "deleted, and starting a plan again brings every printed code back.",
      "",
      `Change your mind here: ${billingUrl()}`,
      "",
      `— ${PRODUCT_NAME}`,
    ].join("\n"),
  });
}
