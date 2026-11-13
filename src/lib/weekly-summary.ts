import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";
import { notifyAdmin } from "@/lib/email";
import { PRODUCT_NAME } from "@/lib/brand";
import { planSubscribers, summariseRevenue } from "@/lib/admin-billing";
import { attentionCounts, type AttentionCounts } from "@/lib/reports";
import { errorsLastDays } from "@/lib/error-alerts";
import { reputationConfigured } from "@/lib/reputation";
import { naira } from "@/lib/plan-tiers";
import { backupHealth, describeBackups } from "@/lib/backups";
import { violationsLastDays, type ViolationSummary } from "@/lib/csp-reports";

/**
 * The weekly summary email to staff (built 8 Nov 2026): how the last seven
 * days went, against the seven before, what the money looks like now, what
 * the safety checks did, and what is waiting on a person. Sent on Monday
 * morning by `/api/cron/summary`, after Sunday's scans are rolled up and the
 * weekly safety check has run, so both are in it.
 *
 * Figures only, never a customer's name or address: it goes to a shared
 * inbox, and the admin is where the detail lives.
 */

const DAY = 86_400_000;

export type WeeklyFigures = {
  /** First day of the week, 00:00 UTC. */
  from: Date;
  /** The day after the last day, 00:00 UTC (the run day). */
  to: Date;
  signups: { week: number; before: number };
  codes: { week: number; before: number };
  scans: { week: number; before: number };
  reportsReceived: number;
  staffBlocks: number;
  /** Over the seven days to the run, so this morning's check is included. */
  safetyBlocks: number;
  /** False when `WEB_RISK_API_KEY` is unset and the safety check is off. */
  safetyCheckOn: boolean;
  liveCodes: number;
  revenue: { mrrKobo: number; paidActive: number; nonRenewing: number; pastDue: number; atRiskKobo: number };
  attention: AttentionCounts;
  /** Null when there is no Redis to count in. */
  errors: number | null;
  /** One line on the nightly backups (`describeBackups`). */
  backups: string;
  /**
   * Content Security Policy violations reported over the seven days, while
   * the policy is report-only (`src/lib/csp.ts`). Null without Redis.
   */
  csp: ViolationSummary | null;
};

/** The seven complete UTC days before `now`'s day, and the seven before them. */
export function summaryWindow(now: Date): { from: Date; to: Date; before: Date } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { from: new Date(to.getTime() - 7 * DAY), to, before: new Date(to.getTime() - 14 * DAY) };
}

export async function weeklyFigures(now = new Date()): Promise<WeeklyFigures> {
  const { from, to, before } = summaryWindow(now);

  const [row, plans, attention, errors, backups, csp] = await Promise.all([
    queryOne<Record<string, string>>(
      `-- scope: staff summary, totals across every account and nothing per customer
       select
         (select count(*) from qr_users where created_at >= $1 and created_at < $2) as signups,
         (select count(*) from qr_users where created_at >= $3 and created_at < $1) as signups_before,
         (select count(*) from qr_codes where created_at >= $1 and created_at < $2) as codes,
         (select count(*) from qr_codes where created_at >= $3 and created_at < $1) as codes_before,
         (select coalesce(sum(scans), 0) from qr_scan_daily
           where day >= $1::date and day < $2::date) as scans,
         (select coalesce(sum(scans), 0) from qr_scan_daily
           where day >= $3::date and day < $1::date) as scans_before,
         (select count(*) from qr_abuse_reports where created_at >= $1 and created_at < $2) as reports,
         (select count(*) from qr_admin_audit
           where action in ('code.block', 'customer.block_all')
             and created_at >= $1 and created_at < $2) as staff_blocks,
         -- The safety check runs at 04:50 on the morning this is sent, so
         -- its blocks are counted over the seven days to now, not the
         -- calendar week, or this morning's would wait a week.
         (select count(*) from qr_admin_audit
           where action = 'code.block.reputation'
             and created_at > $4::timestamptz - interval '7 days'
             and created_at <= $4) as safety_blocks,
         (select count(*) from qr_codes
           where status in ('active', 'paused') and archived_at is null) as live_codes`,
      [from.toISOString(), to.toISOString(), before.toISOString(), now.toISOString()]
    ),
    planSubscribers(),
    attentionCounts(),
    // The seven days the summary covers end yesterday; today's errors wait
    // for next week's.
    errorsLastDays(7, new Date(to.getTime() - DAY)),
    backupHealth(now)
      .then(describeBackups)
      .catch((error) => {
        console.error("[summary] backup state unavailable", error);
        return "The backup log could not be read.";
      }),
    violationsLastDays(7, new Date(to.getTime() - DAY)),
  ]);

  const n = (key: string) => Number(row?.[key] ?? 0);
  const revenue = summariseRevenue(plans);
  return {
    from,
    to,
    signups: { week: n("signups"), before: n("signups_before") },
    codes: { week: n("codes"), before: n("codes_before") },
    scans: { week: n("scans"), before: n("scans_before") },
    reportsReceived: n("reports"),
    staffBlocks: n("staff_blocks"),
    safetyBlocks: n("safety_blocks"),
    safetyCheckOn: reputationConfigured(),
    liveCodes: n("live_codes"),
    revenue: {
      mrrKobo: revenue.mrrKobo,
      paidActive: revenue.paidActive,
      nonRenewing: revenue.nonRenewing,
      pastDue: revenue.pastDue,
      atRiskKobo: revenue.atRiskKobo,
    },
    attention,
    errors,
    backups,
    csp,
  };
}

/** The report-only policy's week, and whether it looks ready to enforce. */
export function describeCsp(csp: ViolationSummary | null): string[] {
  if (csp === null) return ["Browser policy reports were not counted: Redis is not configured."];
  if (csp.total === 0) {
    return ["Browser policy (report-only): no violations reported. If this holds, it can be enforced."];
  }
  return [
    `Browser policy (report-only): ${plural(csp.total, "violation", "violations")} reported. Most common:`,
    ...csp.top.map((t) => `  ${count(t.count).padStart(6)}  ${t.kind}`),
  ];
}

const count = (value: number) => value.toLocaleString("en-NG");

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

/** "2 to 8 November 2026", or across a month "26 October to 1 November 2026". */
export function weekLabel(from: Date, to: Date): string {
  const last = new Date(to.getTime() - DAY);
  const fmt = (d: Date, options: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString("en-GB", { timeZone: "UTC", ...options });
  const sameMonth = from.getUTCMonth() === last.getUTCMonth() && from.getUTCFullYear() === last.getUTCFullYear();
  const sameYear = from.getUTCFullYear() === last.getUTCFullYear();
  const start = sameMonth
    ? fmt(from, { day: "numeric" })
    : fmt(from, sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
  return `${start} to ${fmt(last, { day: "numeric", month: "long", year: "numeric" })}`;
}

/** The email itself. Pure, so the wording is tested without a database. */
export function summaryEmail(f: WeeklyFigures, adminUrl: string): { subject: string; text: string } {
  const line = (label: string, value: string, note = "") =>
    `${label.padEnd(22)}${value.padStart(10)}${note ? `   ${note}` : ""}`;
  const trend = (pair: { week: number; before: number }) => `(${count(pair.before)} the week before)`;

  const waiting = [
    f.attention.openReports > 0 && plural(f.attention.openReports, "open abuse report", "open abuse reports"),
    f.attention.finalWarningsDue > 0 &&
      plural(f.attention.finalWarningsDue, "final warning past due", "final warnings past due"),
    f.attention.overdueAccounts > 0 && plural(f.attention.overdueAccounts, "account overdue", "accounts overdue"),
    f.attention.unappliedPayments > 0 &&
      plural(f.attention.unappliedPayments, "Paystack event not applied", "Paystack events not applied"),
    f.attention.unpurchasablePlans > 0 &&
      plural(f.attention.unpurchasablePlans, "plan on sale but not buyable", "plans on sale but not buyable"),
    f.attention.signInsToRemove > 0 && plural(f.attention.signInsToRemove, "sign-in to remove", "sign-ins to remove"),
  ].filter((item): item is string => Boolean(item));

  return {
    subject: `${PRODUCT_NAME} weekly summary, ${weekLabel(f.from, f.to)}: ${plural(f.signups.week, "sign-up", "sign-ups")}, ${plural(f.scans.week, "scan", "scans")}`,
    text: [
      `${PRODUCT_NAME}, the week of ${weekLabel(f.from, f.to)} (UTC).`,
      "",
      "THE WEEK",
      line("Sign-ups", count(f.signups.week), trend(f.signups)),
      line("New codes", count(f.codes.week), trend(f.codes)),
      line("Scans", count(f.scans.week), trend(f.scans)),
      line("Codes in service", count(f.liveCodes), "live or paused, right now"),
      "",
      "MONEY, RIGHT NOW",
      line("Monthly recurring", `₦${naira(f.revenue.mrrKobo)}`, "annual plans spread over 12"),
      line("Paying accounts", count(f.revenue.paidActive), `${count(f.revenue.nonRenewing)} set not to renew`),
      line(
        "Payment overdue",
        count(f.revenue.pastDue),
        f.revenue.pastDue > 0 ? `₦${naira(f.revenue.atRiskKobo)} a month at risk` : ""
      ),
      "",
      "SAFETY",
      line("Abuse reports received", count(f.reportsReceived)),
      line("Codes blocked by staff", count(f.staffBlocks)),
      f.safetyCheckOn
        ? line("Blocked by safety check", count(f.safetyBlocks), "Google Web Risk, 7 days to this morning")
        : "The Google Web Risk safety check is off: WEB_RISK_API_KEY is not set.",
      "",
      "HEALTH",
      f.errors === null
        ? "Server errors were not counted: Redis is not configured."
        : line("Server errors", count(f.errors), f.errors > 0 ? "each kind was emailed when it first happened" : ""),
      f.backups,
      ...describeCsp(f.csp),
      "",
      "WAITING ON YOU",
      ...(waiting.length > 0 ? waiting.map((item) => `- ${item}`) : ["Nothing. No open reports, nobody overdue, every payment applied."]),
      "",
      `Details: ${adminUrl}`,
    ].join("\n"),
  };
}

/** Gather the figures and send the email. */
export async function sendWeeklySummary(now = new Date()): Promise<{ sent: boolean; figures: WeeklyFigures }> {
  const figures = await weeklyFigures(now);
  const { subject, text } = summaryEmail(figures, new URL("/admin", env().QR_BASE_URL).toString());
  const sent = await notifyAdmin(subject, text);
  return { sent, figures };
}
