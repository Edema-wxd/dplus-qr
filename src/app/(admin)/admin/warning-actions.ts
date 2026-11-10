"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendEmail } from "@/lib/email";
import {
  formatRespondBy,
  issueSchema,
  issueWarning,
  LEVEL_LABELS,
  markEmailed,
  resolveWarning,
  suspendForWarning,
  warningEmail,
} from "@/lib/warnings";
import { recordChange, staffForAction } from "./guard";
import type { AdminFormState } from "./actions";

/**
 * Staff warnings. Each action re-checks staff, validates with zod and writes
 * `qr_admin_audit`. The audit row for a warning records
 * its level and id, never its text: erasing an account deletes the warning,
 * and a copy of the message in the audit would outlive that.
 */

const REFUSED: AdminFormState = { error: "Only staff can do that." };

/** Any Postgres `uuid`; see the note in `actions.ts`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form.";
}

export async function issueWarningAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const userId = z.string().regex(UUID).safeParse(form.get("userId"));
  if (!userId.success) return { error: "That account does not exist." };
  if (userId.data === staff.id) return { error: "You cannot warn your own account." };

  const parsed = issueSchema.safeParse({
    level: form.get("level"),
    message: form.get("message"),
    respondDays: form.get("respondDays") || undefined,
    qrId: form.get("qrId") || undefined,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const issued = await issueWarning(userId.data, parsed.data, staff.id);
  if (!issued.ok) return { error: issued.error };
  const { warning } = issued;

  // The warning is recorded whether or not the email goes: the owner's
  // dashboard shows it either way, and staff are told if the email failed.
  const mail = warningEmail({
    level: parsed.data.level,
    message: parsed.data.message,
    name: warning.name,
    respondBy: warning.respondBy,
    shortCode: warning.shortCode,
  });
  const emailed = await sendEmail({ group: "support", to: warning.email, ...mail });
  if (emailed) await markEmailed(warning.id);

  await recordChange(staff, "customer.warn", "customer", userId.data, {
    warningId: warning.id,
    level: parsed.data.level,
    qrId: parsed.data.qrId ?? null,
    emailed,
  });
  revalidatePath(`/admin/customers/${userId.data}`);
  if (parsed.data.qrId) revalidatePath(`/admin/codes/${parsed.data.qrId}`);
  revalidatePath("/app");

  const label = LEVEL_LABELS[parsed.data.level];
  const due = warning.respondBy ? ` They have until ${formatRespondBy(warning.respondBy)}.` : "";
  return emailed
    ? { notice: `${label} sent to ${warning.email} and shown on their dashboard.${due}` }
    : { error: `${label} recorded and shown on their dashboard, but the email did not go out. Check RESEND_API_KEY, or contact them another way.${due}` };
}

const resolveSchema = z.object({
  warningId: z.coerce.number().int().positive(),
  op: z.enum(["complied", "withdrawn", "suspend"]),
});

export async function resolveWarningAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const parsed = resolveSchema.safeParse({ warningId: form.get("warningId"), op: form.get("op") });
  if (!parsed.success) return { error: "That warning does not exist." };
  const { warningId, op } = parsed.data;

  if (op === "suspend") {
    const result = await suspendForWarning(warningId, staff.id);
    if (!result.ok) return { error: result.error };
    // Recorded as a suspension of the account, with the warning as its reason,
    // so the account's history reads the way it happened.
    await recordChange(staff, "customer.suspend", "customer", result.userId, {
      warningId,
      early: result.early,
    });
    revalidatePath(`/admin/customers/${result.userId}`);
    revalidatePath("/admin/monitor");
    revalidatePath("/admin");
    return { notice: "Suspended. Every code shows the paused page; they can still sign in to see why." };
  }

  const resolved = await resolveWarning(warningId, op, staff.id);
  if (!resolved) return { error: "That warning is already closed." };
  await recordChange(staff, `warning.${op}`, "customer", resolved.userId, { warningId });
  revalidatePath(`/admin/customers/${resolved.userId}`);
  revalidatePath("/admin/monitor");
  revalidatePath("/admin");
  revalidatePath("/app");
  return { notice: op === "complied" ? "Closed: they put it right." : "Withdrawn. It has left their dashboard." };
}
