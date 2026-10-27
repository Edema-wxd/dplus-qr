import type { Metadata } from "next";
import Link from "next/link";
import { CODE_HOST } from "@/lib/brand";
import { listReports, reportStatusSchema, REPORT_STATUSES, type ReportStatus } from "@/lib/monitoring";
import { StatusPill } from "@/app/(app)/app/StatusPill";
import { audit, requireStaff } from "../guard";
import { AdminShell, Tag } from "../AdminShell";
import { Destination } from "../codes/Destination";
import { ReportActions } from "./ReportActions";

export const metadata: Metadata = { title: "Reports · Admin" };
export const instant = false;

const STATUS_LABELS: Record<ReportStatus, string> = { open: "Open", actioned: "Actioned", dismissed: "Dismissed" };

/**
 * Abuse reports from the public "Report this link" form. Open ones oldest
 * first, so none waits forever. Each shows where the code points now, so most
 * can be judged from here; acting on the code happens on its own page.
 */
export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const status = reportStatusSchema.parse((await searchParams).status);

  // Reports can carry a reporter's email, so reading the queue is audited.
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/reports", detail: { status } });

  const reports = await listReports(status);

  return (
    <AdminShell
      heading="Abuse reports"
      current="/admin/reports"
      meta={status === "open" ? "Open reports, oldest first." : `${STATUS_LABELS[status]} reports, newest first, up to 100.`}
    >
      <nav aria-label="Report status" className="mb-6 flex gap-1 text-sm">
        {REPORT_STATUSES.map((option) => (
          <Link
            key={option}
            href={option === "open" ? "/admin/reports" : `/admin/reports?status=${option}`}
            aria-current={option === status ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 no-underline ${
              option === status
                ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
            }`}
          >
            {STATUS_LABELS[option]}
          </Link>
        ))}
      </nav>

      {reports.length === 0 ? (
        <p className="text-sm text-[var(--paper-soft)]">
          {status === "open" ? "Nothing waiting. Every report has been dealt with." : "None."}
        </p>
      ) : (
        <ul className="space-y-4">
          {reports.map((report) => (
            <li key={report.id} className="rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-4 text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--paper-soft)]">
                <span className="dash-num">
                  {report.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                </span>
                <span>{report.reporterEmail ?? "Anonymous"}</span>
                {report.code && report.code.openReports > 1 ? (
                  <Tag tone="struck">{report.code.openReports} open on this code</Tag>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap">{report.reason}</p>

              <div className="mt-3 grid gap-3 border-t border-[var(--paper-rule)] pt-3 sm:grid-cols-[1fr_auto] sm:items-start">
                {report.code ? (
                  <div className="min-w-0 space-y-1">
                    <Link href={`/admin/codes/${report.code.id}`} className="font-medium">
                      {report.code.name}
                    </Link>{" "}
                    <span className="font-mono text-xs text-[var(--paper-soft)]">
                      {CODE_HOST}/{report.reportedCode}
                    </span>
                    <Destination url={report.code.destinationUrl} shortCode={report.reportedCode} kind={report.code.kind} compact />
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--paper-soft)]">
                      <StatusPill status={report.code.status} />
                      {report.code.archived ? <Tag>Archived</Tag> : null}
                      <Link href={`/admin/customers/${report.code.ownerId}`}>
                        {report.code.ownerErased ? "Erased account" : report.code.ownerEmail}
                      </Link>
                    </span>
                  </div>
                ) : (
                  <p className="text-[var(--paper-soft)]">
                    Names <span className="font-mono">{CODE_HOST}/{report.reportedCode}</span>, which is not a code on
                    this platform. Probably mistyped.
                  </p>
                )}
                {report.status === "open" ? (
                  <ReportActions reportId={report.id} />
                ) : (
                  <Tag>{STATUS_LABELS[report.status]}</Tag>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
