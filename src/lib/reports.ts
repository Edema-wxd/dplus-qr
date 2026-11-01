import { z } from "zod";
import { query, queryOne } from "@/lib/db";

/**
 * Abuse reports, as staff work through them.
 *
 * A report is `open` until staff close it: `actioned` when the code was dealt
 * with (blocked, archived, or its account taken down), `dismissed` when the
 * report did not hold up. Closing never deletes the row; the code page keeps
 * every report it ever had, so a code reported twice is visibly reported
 * twice.
 */

export const REPORT_RESOLUTIONS = ["actioned", "dismissed"] as const;
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number];
export const REPORT_VIEWS = ["open", "closed"] as const;
export const REPORTS_PER_PAGE = 50;

const single = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** The reports queue's filters, read leniently: a bad value means the default. */
export const reportFiltersSchema = z.object({
  view: z.preprocess(single, z.enum(REPORT_VIEWS)).catch("open"),
  page: z.preprocess(single, z.coerce.number().int().min(1).max(1000)).catch(1),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export type QueuedReport = {
  id: number;
  reason: string;
  reporterEmail: string | null;
  status: "open" | ReportResolution;
  createdAt: Date;
  reportedCode: string;
  code: {
    id: number;
    name: string;
    status: "active" | "paused" | "blocked";
    archived: boolean;
    ownerId: string;
    ownerEmail: string;
    /** Other open reports on the same code, so a pile-up stands out. */
    openReports: number;
  } | null;
};

/** The queue: open reports oldest first, so nothing waits longest unseen; closed ones newest first. */
export async function listReports(
  filters: ReportFilters
): Promise<{ rows: QueuedReport[]; hasMore: boolean }> {
  const open = filters.view === "open";
  const rows = await query<{
    id: string;
    reason: string;
    reporter_email: string | null;
    status: QueuedReport["status"];
    created_at: Date;
    reported_code: string;
    code_id: string | null;
    code_name: string | null;
    code_status: "active" | "paused" | "blocked" | null;
    archived: boolean | null;
    owner_id: string | null;
    owner_email: string | null;
    open_reports: string | null;
  }>(
    `select r.id, r.reason, r.reporter_email, r.status, r.created_at, r.reported_code,
            c.id as code_id, c.name as code_name, c.status as code_status,
            c.archived_at is not null as archived,
            u.id as owner_id, u.email as owner_email,
            (select count(*) from qr_abuse_reports o
              where o.qr_id = c.id and o.status = 'open') as open_reports
     from qr_abuse_reports r
     left join qr_codes c on c.id = r.qr_id
     left join qr_users u on u.id = c.user_id
     where (case when $1 then r.status = 'open' else r.status <> 'open' end)
     order by
       case when $1 then r.created_at end asc,
       case when not $1 then r.created_at end desc,
       r.id
     limit $2 offset $3`,
    [open, REPORTS_PER_PAGE + 1, (filters.page - 1) * REPORTS_PER_PAGE]
  );
  return {
    rows: rows.slice(0, REPORTS_PER_PAGE).map((row) => ({
      id: Number(row.id),
      reason: row.reason,
      reporterEmail: row.reporter_email,
      status: row.status,
      createdAt: row.created_at,
      reportedCode: row.reported_code,
      code:
        row.code_id && row.owner_id
          ? {
              id: Number(row.code_id),
              name: row.code_name ?? "",
              status: row.code_status ?? "active",
              archived: row.archived === true,
              ownerId: row.owner_id,
              ownerEmail: row.owner_email ?? "",
              openReports: Number(row.open_reports ?? 0),
            }
          : null,
    })),
    hasMore: rows.length > REPORTS_PER_PAGE,
  };
}

/**
 * Close one open report. Returns the code it was about, or null if the report
 * was already closed (another staff member got there first) or never existed.
 */
export async function resolveReport(
  id: number,
  resolution: ReportResolution
): Promise<{ qrId: number | null } | null> {
  const row = await queryOne<{ qr_id: string | null }>(
    `update qr_abuse_reports set status = $2
     where id = $1 and status = 'open'
     returning qr_id`,
    [id, resolution]
  );
  return row ? { qrId: row.qr_id === null ? null : Number(row.qr_id) } : null;
}

/**
 * Mark every open report on these codes actioned. Called after a block or an
 * archive, which is the action the reports asked for, so they leave the queue
 * without a second click. Returns how many were closed.
 */
export async function actionReportsForCodes(qrIds: number[]): Promise<number> {
  if (qrIds.length === 0) return 0;
  const rows = await query<{ id: string }>(
    `update qr_abuse_reports set status = 'actioned'
     where qr_id = any($1::bigint[]) and status = 'open'
     returning id`,
    [qrIds]
  );
  return rows.length;
}

/** The same, for every code an account owns: blocking or archiving them all. */
export async function actionReportsForAccount(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `update qr_abuse_reports r set status = 'actioned'
     from qr_codes c
     where c.id = r.qr_id and c.user_id = $1 and r.status = 'open'
     returning r.id`,
    [userId]
  );
  return rows.length;
}

export type AttentionCounts = {
  openReports: number;
  overdueAccounts: number;
  unappliedPayments: number;
  unpurchasablePlans: number;
  /** Erased accounts whose Neon Auth sign-in still exists. */
  signInsToRemove: number;
};

/**
 * What is waiting on staff, in one round trip: the admin nav's badges and the
 * overview's "needs attention" block read the same numbers.
 */
export async function attentionCounts(): Promise<AttentionCounts> {
  const row = await queryOne<{
    open_reports: string;
    overdue: string;
    unapplied: string;
    unpurchasable: string;
  }>(
    `select
       (select count(*) from qr_abuse_reports where status = 'open') as open_reports,
       (select count(*) from qr_subscriptions where status = 'past_due') as overdue,
       (select count(*) from qr_payment_events where processed_at is null) as unapplied,
       (select count(*) from qr_plans
         where is_active and amount_kobo > 0 and paystack_plan_code is null) as unpurchasable`
  );
  return {
    openReports: Number(row?.open_reports ?? 0),
    overdueAccounts: Number(row?.overdue ?? 0),
    unappliedPayments: Number(row?.unapplied ?? 0),
    unpurchasablePlans: Number(row?.unpurchasable ?? 0),
    signInsToRemove: await erasedWithSignIn(),
  };
}

/**
 * Erased accounts whose sign-in is still in Neon Auth: left by the retention
 * sweep, which has no admin session to remove it with, or by a staff erase
 * whose removal call failed. Each is one click on the customer's page.
 *
 * Its own query and its own failure: `neon_auth` belongs to the managed
 * service, and the rest of the overview must not depend on its shape.
 */
async function erasedWithSignIn(): Promise<number> {
  try {
    const row = await queryOne<{ n: string }>(
      `select count(*) as n from qr_users u
       where u.erased_at is not null
         and exists (select 1 from neon_auth."user" a where a.id = u.id)`
    );
    return Number(row?.n ?? 0);
  } catch (error) {
    console.error("[admin] could not count sign-ins to remove", error);
    return 0;
  }
}
