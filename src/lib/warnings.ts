import { z } from "zod";
import { query, queryOne, withTransaction } from "@/lib/db";
import { purgeDestination } from "@/lib/codes";
import { CODE_HOST, PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";

/**
 * Warnings staff send to an account: a notice, a warning, or a final warning
 * with a date to put things right by.
 *
 * A final warning falling due does nothing by itself. It is listed for staff,
 * and suspending the account is an action a named staff member takes, which
 * resolves the warning and records who did it (Francis, 27 Oct 2026). Nothing
 * here is read by the redirect path.
 */

// ---------------------------------------------------------------------------
// Pure rules, tested directly.
// ---------------------------------------------------------------------------

export const WARNING_LEVELS = ["notice", "warning", "final"] as const;
export type WarningLevel = (typeof WARNING_LEVELS)[number];

/** How long a final warning gives the owner. A short fixed set, so every final warning reads alike. */
export const RESPOND_DAYS = [3, 7, 14] as const;

export const LEVEL_LABELS: Record<WarningLevel, string> = {
  notice: "Notice",
  warning: "Warning",
  final: "Final warning",
};

export const issueSchema = z
  .object({
    level: z.enum(WARNING_LEVELS),
    message: z
      .string()
      .trim()
      .min(10, "Say what the problem is, in a sentence or two. The owner reads this.")
      .max(2000, "Keep the message under 2,000 characters."),
    respondDays: z.coerce
      .number()
      .refine((days) => (RESPOND_DAYS as readonly number[]).includes(days), "Choose how long they have.")
      .optional(),
    qrId: z.coerce.number().int().positive().optional(),
  })
  .refine((value) => value.level !== "final" || value.respondDays !== undefined, {
    message: "A final warning needs a date to put things right by.",
    path: ["respondDays"],
  })
  .transform((value) => ({
    ...value,
    // Only a final warning carries a date; anything else posted is dropped.
    respondDays: value.level === "final" ? value.respondDays : undefined,
  }));

export type IssueInput = z.infer<typeof issueSchema>;

/** The day a final warning falls due, as the owner is told it. */
export function formatRespondBy(date: Date): string {
  return date.toLocaleDateString("en-NG", { dateStyle: "long", timeZone: "Africa/Lagos" });
}

/**
 * The email for a warning. Sent from `support@`, whose replies land on the
 * apex inbox, so "reply to this email" is an instruction that works.
 */
export function warningEmail(input: {
  level: WarningLevel;
  message: string;
  name: string;
  respondBy: Date | null;
  shortCode: string | null;
}): { subject: string; text: string } {
  const subject =
    input.level === "final"
      ? `Final warning: action needed on your ${PRODUCT_NAME} account by ${formatRespondBy(input.respondBy!)}`
      : input.level === "warning"
        ? `A warning about your ${PRODUCT_NAME} account`
        : `A notice about your ${PRODUCT_NAME} account`;

  const lines = [
    `Hi ${input.name || "there"},`,
    "",
    input.level === "notice"
      ? `Our team has a note for you about your ${PRODUCT_NAME} account.`
      : `Our team has reviewed your ${PRODUCT_NAME} account and needs you to act.`,
    "",
  ];
  if (input.shortCode) lines.push(`It concerns your code ${CODE_HOST}/${input.shortCode}.`, "");
  lines.push(input.message, "");
  if (input.level === "final") {
    lines.push(
      `If this is not resolved by ${formatRespondBy(input.respondBy!)}, a member of our team may suspend your account. While it is suspended, every one of your codes shows a paused page instead of your link.`,
      ""
    );
  }
  lines.push(
    `If you have questions, or have already fixed this, reply to this email or write to ${SUPPORT_EMAIL}. You will also see this on your dashboard until you mark it as read.`,
    "",
    `The ${PRODUCT_NAME} team`
  );
  return { subject, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Staff reads and writes.
// ---------------------------------------------------------------------------

export type Warning = {
  id: number;
  level: WarningLevel;
  message: string;
  respondBy: Date | null;
  shortCode: string | null;
  qrId: number | null;
  issuedBy: string | null;
  emailedAt: Date | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolution: "suspended" | "complied" | "withdrawn" | null;
  createdAt: Date;
  /** A final warning still open whose date has passed, by the database clock. */
  due: boolean;
};

type WarningRow = {
  id: string;
  level: WarningLevel;
  message: string;
  respond_by: Date | null;
  short_code: string | null;
  qr_id: string | null;
  issued_by: string | null;
  emailed_at: Date | null;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution: Warning["resolution"];
  created_at: Date;
  due: boolean;
};

const WARNING_COLUMNS = `
  w.id, w.level, w.message, w.respond_by, c.short_code, w.qr_id,
  i.email as issued_by, w.emailed_at, w.acknowledged_at,
  w.resolved_at, r.email as resolved_by, w.resolution, w.created_at,
  (w.level = 'final' and w.resolved_at is null and w.respond_by <= now()) as due
`;

const WARNING_JOINS = `
  left join qr_codes c on c.id = w.qr_id
  left join qr_users i on i.id = w.issued_by
  left join qr_users r on r.id = w.resolved_by
`;

function toWarning(row: WarningRow): Warning {
  return {
    id: Number(row.id),
    level: row.level,
    message: row.message,
    respondBy: row.respond_by,
    shortCode: row.short_code,
    qrId: row.qr_id === null ? null : Number(row.qr_id),
    issuedBy: row.issued_by,
    emailedAt: row.emailed_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    resolution: row.resolution,
    createdAt: row.created_at,
    due: row.due,
  };
}

export async function accountWarnings(userId: string): Promise<Warning[]> {
  const rows = await query<WarningRow>(
    `select ${WARNING_COLUMNS}
     from qr_account_warnings w ${WARNING_JOINS}
     where w.user_id = $1
     order by w.created_at desc
     limit 100`,
    [userId]
  );
  return rows.map(toWarning);
}

export type IssuedWarning = {
  id: number;
  respondBy: Date | null;
  email: string;
  name: string;
  shortCode: string | null;
};

/**
 * Record a warning. Refused for an erased account, and for a code that is not
 * the account's own, so a tampered form cannot attach someone else's code.
 */
export async function issueWarning(
  userId: string,
  input: IssueInput,
  issuedBy: string
): Promise<{ ok: true; warning: IssuedWarning } | { ok: false; error: string }> {
  const account = await queryOne<{ email: string; name: string }>(
    `select email, name from qr_users where id = $1 and erased_at is null`,
    [userId]
  );
  if (!account) return { ok: false, error: "That account does not exist or has been erased." };

  let shortCode: string | null = null;
  if (input.qrId !== undefined) {
    const code = await queryOne<{ short_code: string }>(
      `select short_code from qr_codes where id = $1 and user_id = $2`,
      [input.qrId, userId]
    );
    if (!code) return { ok: false, error: "That code does not belong to this account." };
    shortCode = code.short_code;
  }

  const row = await queryOne<{ id: string; respond_by: Date | null }>(
    `insert into qr_account_warnings (user_id, qr_id, level, message, respond_by, issued_by)
     values ($1, $2, $3, $4,
             case when $5::int is null then null else now() + make_interval(days => $5::int) end,
             $6)
     returning id, respond_by`,
    [userId, input.qrId ?? null, input.level, input.message, input.respondDays ?? null, issuedBy]
  );
  return {
    ok: true,
    warning: { id: Number(row!.id), respondBy: row!.respond_by, email: account.email, name: account.name, shortCode },
  };
}

export async function markEmailed(id: number): Promise<void> {
  await query(`update qr_account_warnings set emailed_at = now() where id = $1`, [id]);
}

/** Close a warning without suspending: the owner complied, or staff withdrew it. */
export async function resolveWarning(
  id: number,
  resolution: "complied" | "withdrawn",
  staffId: string
): Promise<{ userId: string } | null> {
  return queryOne<{ userId: string }>(
    `update qr_account_warnings
        set resolved_at = now(), resolved_by = $3, resolution = $2
      where id = $1 and resolved_at is null
      returning user_id as "userId"`,
    [id, resolution, staffId]
  );
}

/**
 * Suspend the account a final warning was sent to, and close the warning as
 * the reason, in one transaction. This is the only way a final warning turns
 * into a suspension, and it is always a staff member's action.
 *
 * Allowed before the date too, for staff who judge it cannot wait; the page
 * asks for confirmation in that case. If the account is already suspended the
 * warning is still closed, with the suspension it led to.
 */
export async function suspendForWarning(
  id: number,
  staffId: string
): Promise<{ ok: true; userId: string; early: boolean } | { ok: false; error: string }> {
  const result = await withTransaction(async (run) => {
    const warning = await run<{ user_id: string; early: boolean }>(
      `select user_id, respond_by > now() as early from qr_account_warnings
        where id = $1 and level = 'final' and resolved_at is null
        for update`,
      [id]
    );
    if (!warning[0]) return { ok: false as const, error: "That is not an open final warning." };
    const { user_id: userId, early } = warning[0];

    const account = await run<{ id: string }>(
      `update qr_users set suspended_at = coalesce(suspended_at, now()), updated_at = now()
        where id = $1 and erased_at is null
        returning id`,
      [userId]
    );
    if (!account[0]) return { ok: false as const, error: "That account has been erased." };

    await run(
      `update qr_account_warnings set resolved_at = now(), resolved_by = $2, resolution = 'suspended'
        where id = $1`,
      [id, staffId]
    );
    const codes = await run<{ short_code: string }>(
      `select short_code from qr_codes where user_id = $1`,
      [userId]
    );
    return { ok: true as const, userId, early, shortCodes: codes.map((c) => c.short_code) };
  });

  if (!result.ok) return result;
  await Promise.allSettled(result.shortCodes.map((code) => purgeDestination(code)));
  return { ok: true, userId: result.userId, early: result.early };
}

export type DueWarning = Warning & { userId: string; email: string; name: string };

/** Final warnings past their date and still open, oldest first: staff's to decide. */
export async function dueFinalWarnings(limit = 50): Promise<DueWarning[]> {
  const rows = await query<WarningRow & { user_id: string; email: string; name: string }>(
    `select ${WARNING_COLUMNS}, w.user_id, u.email, u.name
     from qr_account_warnings w ${WARNING_JOINS}
     join qr_users u on u.id = w.user_id
     where w.level = 'final' and w.resolved_at is null and w.respond_by <= now()
     order by w.respond_by
     limit $1`,
    [limit]
  );
  return rows.map((row) => ({ ...toWarning(row), userId: row.user_id, email: row.email, name: row.name }));
}

export async function dueFinalWarningCount(): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `select count(*) as n from qr_account_warnings
     where level = 'final' and resolved_at is null and respond_by <= now()`
  );
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------
// The owner's side. Every query filters by the session's user id.
// ---------------------------------------------------------------------------

export type OwnerWarning = {
  id: number;
  level: WarningLevel;
  message: string;
  respondBy: Date | null;
  shortCode: string | null;
  acknowledged: boolean;
  createdAt: Date;
};

/**
 * What the owner's dashboard shows: every open warning they have not marked
 * as read, and every open final warning even once read, because it carries a
 * date that still matters.
 */
export async function ownerWarnings(userId: string): Promise<OwnerWarning[]> {
  const rows = await query<{
    id: string;
    level: WarningLevel;
    message: string;
    respond_by: Date | null;
    short_code: string | null;
    acknowledged: boolean;
    created_at: Date;
  }>(
    `select w.id, w.level, w.message, w.respond_by, c.short_code,
            w.acknowledged_at is not null as acknowledged, w.created_at
     from qr_account_warnings w
     left join qr_codes c on c.id = w.qr_id and c.user_id = w.user_id
     where w.user_id = $1 and w.resolved_at is null
       and (w.acknowledged_at is null or w.level = 'final')
     order by w.created_at desc
     limit 10`,
    [userId]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    level: row.level,
    message: row.message,
    respondBy: row.respond_by,
    shortCode: row.short_code,
    acknowledged: row.acknowledged,
    createdAt: row.created_at,
  }));
}

export async function acknowledgeWarning(userId: string, id: number): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_account_warnings set acknowledged_at = now()
     where id = $1 and user_id = $2 and acknowledged_at is null
     returning id`,
    [id, userId]
  );
  return row !== null;
}
