"use server";

import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { notifyAdmin } from "@/lib/email";
import { isValidCodeFormat } from "@/lib/short-code";

const schema = z.object({
  code: z.string().refine(isValidCodeFormat, "That is not a valid code."),
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

  try {
    // The code may not exist -- someone can report a code they mistyped, and a
    // report about an unknown code is still worth seeing. `reported_code` is
    // stored as text so the report survives either way.
    const existing = await queryOne<{ id: string }>(
      "select id from qr_codes where short_code = $1",
      [code]
    );

    await query(
      `insert into qr_abuse_reports (qr_id, reported_code, reporter_email, reason)
       values ($1, $2, $3, $4)`,
      [existing?.id ?? null, code, reporterEmail || null, reason]
    );

    // Notification is best-effort; the row is already safe.
    await notifyAdmin(
      `Abuse report: ${code}`,
      `Code: ${code}\nKnown code: ${existing ? "yes" : "no"}\nReporter: ${
        reporterEmail || "not given"
      }\n\n${reason}`
    );

    return { status: "sent" };
  } catch (error) {
    console.error("[report] submit failed", error);
    return { status: "idle", error: "We could not save that. Please try again." };
  }
}
