import { query } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { sendEmail } from "@/lib/email";
import { PRODUCT_NAME } from "@/lib/brand";
import { env } from "@/lib/env";

/**
 * Lapsing a subscription once its grace period has run out.
 *
 * Paystack does not retry a failed subscription charge, so recovery is ours to
 * run. The redirect path already stops serving the moment `grace_until` passes
 * -- it compares the timestamp in SQL -- so this job is not what takes codes
 * down. What it does is make the lapse *explicit*: it moves the row out of
 * `past_due`, drops the cached destinations so the change is visible within
 * seconds rather than a cache window, and tells the customer.
 *
 * Codes are never deleted. They go quiet and come back when someone pays.
 */
export type LapseResult = {
  lapsed: number;
  emailed: number;
  codesPurged: number;
};

type Row = {
  subscription_id: string;
  user_id: string;
  email: string;
  name: string;
  plan_name: string;
};

export async function expireGracePeriods(): Promise<LapseResult> {
  // One statement claims the rows and flips them, so two overlapping runs of
  // this job cannot both act on the same subscription: the second sees nothing
  // in `past_due` to update. Cheaper and more reliable than a lock.
  const lapsed = await query<Row>(
    `update qr_subscriptions s
        set status = 'cancelled', updated_at = now()
      where s.status = 'past_due'
        and s.grace_until is not null
        and s.grace_until <= now()
      returning s.id as subscription_id,
                s.user_id,
                (select email from qr_users where id = s.user_id) as email,
                (select name  from qr_users where id = s.user_id) as name,
                (select name  from qr_plans where id = s.plan_id) as plan_name`
  );

  if (lapsed.length === 0) return { lapsed: 0, emailed: 0, codesPurged: 0 };

  let codesPurged = 0;
  let emailed = 0;

  for (const row of lapsed) {
    const codes = await query<{ short_code: string }>(
      "select short_code from qr_codes where user_id = $1",
      [row.user_id]
    );

    // Best effort. A Redis failure must not abort the job and leave the rest
    // of the batch unprocessed -- the cache expires on its own regardless.
    const purges = await Promise.allSettled(
      codes.map((code) => purgeDestination(code.short_code))
    );
    codesPurged += purges.filter((p) => p.status === "fulfilled").length;

    const sent = await sendEmail({
      group: "plans",
      to: row.email,
      subject: `Your ${PRODUCT_NAME} codes have been paused`,
      text: [
        `Hi ${row.name},`,
        "",
        `The payment for your ${row.plan_name} plan did not go through, and the`,
        "grace period has now ended, so your QR codes are showing a",
        '"temporarily unavailable" page instead of your links.',
        "",
        "Nothing has been deleted. Your codes, their destinations and their scan",
        "history are all still here, and every printed code starts working again",
        "the moment a payment succeeds.",
        "",
        `Start again here: ${env().QR_BASE_URL}/billing`,
        "",
        `— ${PRODUCT_NAME}`,
      ].join("\n"),
    });
    if (sent) emailed++;
  }

  return { lapsed: lapsed.length, emailed, codesPurged };
}
