import { query, queryOne } from "@/lib/db";
import { access, accessArgs, type AccountScope } from "@/lib/account-scope";
import type { WarningLevel } from "@/lib/warnings";

/**
 * Staff warnings as the account's own dashboard sees them.
 *
 * A warning is about the account, so it is keyed on the account (the owner's
 * id) like everything else there. With team seats (decided 10 Nov 2026):
 *
 * - the **owner** sees each open warning and can mark it as read;
 * - **members**, editors and viewers alike, see the same warnings read-only,
 *   because they work on the codes a warning is usually about, and an editor
 *   may be the one who has to fix it. Only the owner's "I've read this"
 *   counts: the owner is answerable for the account (Terms, "Teams"), and a
 *   member marking it read would take it off the owner's dashboard.
 *
 * Every statement carries `access()`, and `src/__tests__/scope-guard.test.ts`
 * reads this module.
 */

export type DashboardWarning = {
  id: number;
  level: WarningLevel;
  message: string;
  respondBy: Date | null;
  shortCode: string | null;
  acknowledged: boolean;
  createdAt: Date;
};

/**
 * What the dashboard shows: every open warning the owner has not marked as
 * read, and every open final warning even once read, because it carries a
 * date that still matters until staff close it.
 */
export async function dashboardWarnings(scope: AccountScope): Promise<DashboardWarning[]> {
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
     where w.user_id = $1 and ${access(2)}
       and w.resolved_at is null
       and (w.acknowledged_at is null or w.level = 'final')
     order by w.created_at desc
     limit 10`,
    [scope.accountId, ...accessArgs(scope, "read")]
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

/**
 * The owner marks a warning as read. `access(3)` with no member roles admits
 * the owner alone (`$1 = actor`), so a member's scope changes nothing even
 * with a forged form. Returns whether a row changed.
 */
export async function acknowledgeWarning(scope: AccountScope, id: number): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update qr_account_warnings set acknowledged_at = now()
     where user_id = $1 and id = $2 and ${access(3)}
       and acknowledged_at is null and resolved_at is null
     returning id`,
    [scope.accountId, id, scope.actorId, []]
  );
  return row !== null;
}
