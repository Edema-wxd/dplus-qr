"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { notifyAdmin } from "@/lib/email";
import { clientIp, ipRateKey } from "@/lib/ip";
import { allowReport } from "@/lib/ratelimit";
import { normaliseCode } from "@/lib/short-code";

const schema = z.object({
  code: z
    .string()
    .refine((value) => normaliseCode(value) !== null, "That is not a valid code.")
    .transform((value) => normaliseCode(value)!),
  // Optional: someone reporting a scam should not have to identify themselves.
  reporterEmail: z.union([z.string().email(), z.literal("")]).optional(),
  reason: z.string().trim().min(10, "Please say a little more.").max(2000),
});

export type ReportState = { status: "idle" | "sent"; error?: string };

export async function submitReport(
  _previous: ReportState,
  formData: FormData
): Promise<ReportState> {
  const parsed = schema.safeParse({
    code: formData.get("code"),
    reporterEmail: formData.get("reporterEmail") ?? "",
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { status: "idle", error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { code, reporterEmail, reason } = parsed.data;

  // The only unauthenticated write on this host, so the ceiling is here rather
  // than inherited from a session.
  const allowed = await allowReport(ipRateKey(clientIp(await headers())));
  if (!allowed) {
    return {
      status: "idle",
      error:
        "That is several reports in a short time. If there is more to tell us, email it to us instead.",
    };
  }

  let known = false;
  try {
    // The code may not exist -- someone can report a code they mistyped, and a
    // report about an unknown code is still worth seeing. `reported_code` is
    // stored as text so the report survives either way.
    const existing = await queryOne<{ id: string }>(
      "select id from qr_codes where short_code = $1",
      [code]
    );
    known = existing !== null;

    await query(
      `insert into qr_abuse_reports (qr_id, reported_code, reporter_email, reason)
       values ($1, $2, $3, $4)`,
      [existing?.id ?? null, code, reporterEmail || null, reason]
    );
  } catch (error) {
    console.error("[report] submit failed", error);
    return { status: "idle", error: "We could not save that. Please try again." };
  }

  // Outside the try, and deliberately so. The row is already saved, so a
  // Resend outage must not report failure to someone whose report landed --
  // they would send it again, and we would hold two rows for one complaint.
  // The alert is a convenience; the table is the record, and an unsent alert
  // is recoverable by reading it.
  try {
    await notifyAdmin(
      `Abuse report: ${code}`,
      `Code: ${code}\nKnown code: ${known ? "yes" : "no"}\nReporter: ${
        reporterEmail || "not given"
      }\n\n${reason}`
    );
  } catch (error) {
    console.error("[report] admin notification failed", error);
  }

  return { status: "sent" };
}
