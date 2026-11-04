import type { Metadata } from "next";
import Link from "next/link";
import { LAPSE_RETENTION_MONTHS } from "@/lib/brand";
import {
  BATCH,
  WARNING_DAYS,
  recentRetentionErasures,
  retentionSchedule,
  sweepEnabled,
  type ScheduleGroup,
  type ScheduledAccount,
} from "@/lib/retention";
import { audit, requireStaff } from "../guard";
import { AdminShell, SectionHeading, Tag, day, tableClass, tdClass, thClass } from "../AdminShell";

export const metadata: Metadata = { title: "Retention · Admin" };

// Per-request figures for one staff member, with nothing useful to stream around.
export const instant = false;

/** The cleanup cron's slot in `vercel.json`: 04:10 UTC daily. */
const RUN_HOUR_UTC = 4;
const RUN_MINUTE_UTC = 10;

function nextRun(now: Date): Date {
  const run = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RUN_HOUR_UTC, RUN_MINUTE_UTC));
  if (run <= now) run.setUTCDate(run.getUTCDate() + 1);
  return run;
}

const GROUPS: { group: ScheduleGroup; heading: string; empty: string; detail: string }[] = [
  {
    group: "erase",
    heading: "Due to erase",
    empty: "Nobody is due to be erased.",
    detail: `Warned at least ${WARNING_DAYS} days ago and past ${LAPSE_RETENTION_MONTHS} months. The next run erases them.`,
  },
  {
    group: "warn",
    heading: "Due a warning",
    empty: "Nobody is due a warning.",
    detail: `Inside the ${WARNING_DAYS}-day window and not yet warned for this lapse. The next run emails them, promising the date shown.`,
  },
  {
    group: "warned",
    heading: "Warned, erasure booked",
    empty: "Nobody is between a warning and erasure.",
    detail: "Already told the date. Choosing a plan before then takes them off this page.",
  },
  {
    group: "upcoming",
    heading: "Coming up",
    empty: "No other lapsed accounts.",
    detail: "Lapsed, but the warning window has not opened yet.",
  },
];

/**
 * Who the retention sweep is about to warn or erase, and who is behind them.
 * Read-only: every row comes from `retentionSchedule`, which classifies with
 * the sweep's own `retentionStep`, so this page and the nightly run agree.
 * The actions live on the customer's page, one click from each row.
 */
export default async function AdminRetention() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/retention" });

  const now = new Date();
  const [schedule, erasures] = await Promise.all([retentionSchedule(now), recentRetentionErasures()]);
  const enabled = sweepEnabled();
  const run = nextRun(now);
  const dueTonight = schedule.filter((row) => row.group === "erase" || row.group === "warn").length;

  return (
    <AdminShell
      heading="Retention"
      current="/admin/retention"
      meta={`Accounts are erased ${LAPSE_RETENTION_MONTHS} months after their plan ends, after a warning at least ${WARNING_DAYS} days before.`}
    >
      <div className="space-y-10">
        <p
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-4 py-3 text-sm ${
            enabled ? "border-[var(--paper-rule)] bg-white" : "border-[var(--pending-ink)] bg-white"
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${enabled ? "bg-[var(--live-ink)]" : "bg-[var(--pending-ink)]"}`}
          />
          <span className="font-medium">{enabled ? "The sweep is live." : "The sweep is in dry-run mode."}</span>
          <span className="text-[var(--paper-soft)]">
            {enabled
              ? `Next run ${run.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC, acting on at most ${BATCH} accounts.`
              : "Runs report what they would do and change nothing. Set DELETION_SWEEPS_ENABLED=true to turn it on."}
            {dueTonight > BATCH && enabled ? ` ${dueTonight} are due, so the rest wait for later runs.` : ""}
          </span>
        </p>

        {GROUPS.map(({ group, heading, empty, detail }) => {
          const rows = schedule.filter((row) => row.group === group);
          return (
            <section key={group} aria-labelledby={`${group}-heading`}>
              <SectionHeading id={`${group}-heading`}>
                {heading}
                {rows.length > 0 ? ` · ${rows.length.toLocaleString("en-NG")}` : ""}
              </SectionHeading>
              <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--paper-soft)]">{detail}</p>
              {rows.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--paper-soft)]">{empty}</p>
              ) : (
                <ScheduleTable group={group} rows={rows} />
              )}
            </section>
          );
        })}

        <section aria-labelledby="erased-heading">
          <SectionHeading id="erased-heading">Recently erased by the sweep</SectionHeading>
          {erasures.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">The sweep has not erased anyone yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={tableClass}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>Erased</th>
                    <th scope="col" className={thClass}>Customer</th>
                    <th scope="col" className={thClass}>Codes</th>
                    <th scope="col" className={thClass}>Files</th>
                  </tr>
                </thead>
                <tbody>
                  {erasures.map((row) => (
                    <tr key={`${row.userId}-${row.at.toISOString()}`} className="border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(row.at)}</td>
                      <td className={tdClass}>
                        <Link href={`/admin/customers/${row.userId}`} className="font-mono text-xs underline underline-offset-4">
                          {row.userId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className={`${tdClass} dash-num`}>{row.codes.toLocaleString("en-NG")}</td>
                      <td className={`${tdClass} dash-num`}>
                        {row.files.toLocaleString("en-NG")}
                        {row.filesLeft > 0 ? (
                          <span className="ml-2">
                            <Tag tone="struck">{row.filesLeft} queued for retry</Tag>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function ScheduleTable({ group, rows }: { group: ScheduleGroup; rows: ScheduledAccount[] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
      <table className={tableClass}>
        <thead className="border-b border-[var(--paper-rule)]">
          <tr>
            <th scope="col" className={thClass}>Account</th>
            <th scope="col" className={thClass}>Last plan</th>
            <th scope="col" className={thClass}>Plan ended</th>
            {group === "upcoming" ? <th scope="col" className={thClass}>Warning on</th> : null}
            {group === "erase" || group === "warned" ? <th scope="col" className={thClass}>Warned on</th> : null}
            <th scope="col" className={thClass}>{group === "erase" ? "Erase from" : "Deletion on"}</th>
            <th scope="col" className={thClass}>Codes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId} className="dash-row border-b border-[var(--paper-rule)] last:border-b-0">
              <td className={tdClass}>
                <Link href={`/admin/customers/${row.userId}`} className="underline underline-offset-4">
                  {row.email || row.name || row.userId.slice(0, 8)}
                </Link>
                {row.name && row.email ? <span className="block text-xs text-[var(--paper-soft)]">{row.name}</span> : null}
                {!row.email && group === "warn" ? (
                  <span className="mt-1 block">
                    <Tag tone="struck">No email, cannot be warned</Tag>
                  </span>
                ) : null}
              </td>
              <td className={tdClass}>{row.planName ?? "—"}</td>
              <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(row.lapsedSince)}</td>
              {group === "upcoming" ? <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(row.warnOn)}</td> : null}
              {group === "erase" || group === "warned" ? (
                <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(row.warnedAt)}</td>
              ) : null}
              <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(row.deleteOn)}</td>
              <td className={`${tdClass} dash-num`}>{row.codes.toLocaleString("en-NG")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
