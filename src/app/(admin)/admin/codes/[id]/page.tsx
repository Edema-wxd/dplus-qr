import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CODE_HOST } from "@/lib/brand";
import { dynamicType, isDynamicKind } from "@/lib/qr-types";
import { ANALYTICS_WINDOWS, codeAnalytics } from "@/lib/user-codes";
import { codeReports, destinationChanges, getStaffCode, staffActions } from "@/lib/moderation";
import { AnalyticsPanel } from "@/app/(app)/app/[id]/Analytics";
import { audit, requireStaff } from "../../guard";
import { AdminShell, SectionHeading, StaffHistory, Stat, Tag, day, tableClass, tdClass, thClass } from "../../AdminShell";
import { CodeActions } from "../CodeActions";
import { Destination } from "../Destination";
import { ResolveReport } from "../../reports/ResolveReport";

export const metadata: Metadata = { title: "Code · Admin" };
export const instant = false;

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const REPORT_TONE: Record<string, "soft" | "struck"> = { open: "struck", actioned: "soft", dismissed: "soft" };
const REPORT_LABEL: Record<string, string> = { open: "Open", actioned: "Handled", dismissed: "Dismissed" };

/**
 * One code as staff see it: where it points and has pointed, who owns it, how
 * it is scanned, what has been reported, and what staff have done to it.
 */
export default async function AdminCode({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();

  const code = await getStaffCode(parsed.data);
  if (!code) notFound();

  const [history, reports, actions, windows] = await Promise.all([
    destinationChanges(code.id),
    codeReports(code.id),
    staffActions("code", String(code.id)),
    Promise.all(
      ANALYTICS_WINDOWS.map(async (days) => ({
        days,
        data: await codeAnalytics(code.owner.id, String(code.id), days, { detail: true }),
      }))
    ),
  ]);

  audit(staff, { action: "view", targetType: "code", targetId: String(code.id) });

  const openReports = reports.filter((report) => report.status === "open").length;

  // Reports are why staff usually arrive here, so open ones sit right under
  // the destination they complain about; settled ones drop to the bottom.
  const reportsSection = (
    <section aria-labelledby="reports-heading">
      <SectionHeading id="reports-heading">
        Abuse reports{openReports > 0 ? `, ${openReports} open` : ""}
      </SectionHeading>
      {reports.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--paper-soft)]">Nobody has reported this code.</p>
      ) : (
        <>
          {openReports > 0 ? (
            <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-[var(--paper-soft)]">
              Blocking or archiving this code below closes its open reports. Dismiss a report that does not hold
              up; mark it handled if it was dealt with another way.
            </p>
          ) : null}
          <ul className="mt-4 space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--paper-soft)]">
                      <Tag tone={REPORT_TONE[report.status]}>{REPORT_LABEL[report.status]}</Tag>
                      <span className="dash-num">{day(report.createdAt)}</span>
                      <span>{report.reporterEmail ?? "Anonymous"}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap">{report.reason}</p>
                  </div>
                  {report.status === "open" ? <ResolveReport reportId={report.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  return (
    <AdminShell
      heading={code.name}
      current="/admin/codes"
      back={{ href: "/admin/codes", label: "All codes" }}
      meta={<span className="font-mono">{CODE_HOST}/{code.shortCode}</span>}
    >

      <div className="space-y-10">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] lg:grid-cols-4">
          <Stat
            label="Status"
            value={code.archived ? "Archived" : code.status === "active" ? "Live" : code.status === "paused" ? "Paused" : "Blocked"}
            note={
              code.archived
                ? `Since ${day(code.archivedAt)}${code.status === "blocked" ? ", and blocked" : ""}`
                : code.owner.suspended
                  ? "Owner suspended, so it shows the paused page"
                  : undefined
            }
          />
          <Stat label="Scans, 7 days" value={code.scans7d.toLocaleString("en-NG")} />
          <Stat label="Open reports" value={String(openReports)} note={`${reports.length} in all`} />
          <Stat
            label="Type"
            value={isDynamicKind(code.kind) ? dynamicType(code.kind).label : code.kind}
            note={`Created ${day(code.createdAt)}`}
          />
        </dl>

        <section aria-labelledby="dest-heading">
          <SectionHeading id="dest-heading">Points to</SectionHeading>
          <div className="mt-4 max-w-3xl space-y-2">
            <Destination url={code.destinationUrl} shortCode={code.shortCode} kind={code.kind} />
            {code.blockedReason ? (
              <p className="text-sm">
                <span className="text-[var(--paper-soft)]">Blocked because: </span>
                {code.blockedReason}
              </p>
            ) : null}
            <p className="text-sm">
              <span className="text-[var(--paper-soft)]">Owner: </span>
              <Link href={`/admin/customers/${code.owner.id}`}>
                {code.owner.erased ? "Erased account" : `${code.owner.name} · ${code.owner.email}`}
              </Link>{" "}
              {code.owner.suspended && !code.owner.erased ? <Tag tone="struck">Suspended</Tag> : null}
            </p>
          </div>
        </section>

        {openReports > 0 ? reportsSection : null}

        <section aria-labelledby="actions-heading">
          <SectionHeading id="actions-heading">Moderate</SectionHeading>
          <div className="mt-4">
            <CodeActions
              codeId={code.id}
              status={code.status}
              archived={code.archived}
              ownerGone={code.owner.erased}
            />
          </div>
        </section>

        {/* Staff see every panel, whatever the customer's plan. */}
        <AnalyticsPanel windows={windows} insights historyDays={Infinity} />

        <section aria-labelledby="history-heading">
          <SectionHeading id="history-heading">Destination changes, newest first</SectionHeading>
          {history.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">
              {code.hostedPage ? "A hosted page has no outside destination to change." : "Never changed since it was made."}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={`${tableClass} min-w-[48rem]`}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>When</th>
                    <th scope="col" className={thClass}>From</th>
                    <th scope="col" className={thClass}>To</th>
                    <th scope="col" className={thClass}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((change, index) => (
                    <tr key={index} className="border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>
                        {change.changedAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className={`${tdClass} max-w-[18rem] break-all text-xs text-[var(--paper-soft)]`}>
                        {change.oldUrl ?? "—"}
                      </td>
                      <td className={`${tdClass} max-w-[18rem]`}>
                        <Destination url={change.newUrl} shortCode={code.shortCode} kind="url" compact />
                      </td>
                      <td className={`${tdClass} text-xs text-[var(--paper-soft)]`}>{change.changedBy ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {openReports > 0 ? null : reportsSection}

        <section aria-labelledby="staff-heading">
          <SectionHeading id="staff-heading">Staff changes</SectionHeading>
          <StaffHistory entries={actions} />
        </section>
      </div>
    </AdminShell>
  );
}
