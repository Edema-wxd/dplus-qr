import type { Metadata } from "next";
import Link from "next/link";
import { CODE_HOST } from "@/lib/brand";
import { listReports, reportFiltersSchema, type ReportFilters } from "@/lib/reports";
import { StatusPill } from "@/app/(app)/app/StatusPill";
import { audit, requireStaff } from "../guard";
import { AdminShell, Tag, day } from "../AdminShell";
import { ResolveReport } from "./ResolveReport";

export const metadata: Metadata = { title: "Reports · Admin" };
export const instant = false;

function listHref(filters: ReportFilters, change: Partial<ReportFilters>): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.view !== "open") params.set("view", next.view);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/reports?${query}` : "/admin/reports";
}

const RESOLUTION_LABEL = { open: "Open", actioned: "Handled", dismissed: "Dismissed" } as const;

/**
 * Abuse reports from the public "report this code" page, as a queue: open
 * ones oldest first, each with the code it names and the three ways out.
 */
export default async function AdminReports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const filters = reportFiltersSchema.parse(await searchParams);
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/reports" });

  const { rows, hasMore } = await listReports(filters);
  const open = filters.view === "open";

  return (
    <AdminShell
      heading="Reports"
      current="/admin/reports"
      meta={
        open
          ? "Open abuse reports, oldest first. Blocking or archiving a code closes its reports."
          : "Closed reports, newest first."
      }
    >
      <div role="tablist" aria-label="Reports" className="mb-6 inline-flex rounded-md border border-[var(--paper-rule)] bg-white p-0.5 text-sm">
        {(["open", "closed"] as const).map((view) => (
          <Link
            key={view}
            role="tab"
            aria-selected={filters.view === view}
            href={listHref(filters, { view, page: 1 })}
            className={`rounded px-3.5 py-1.5 no-underline transition-colors duration-150 ${
              filters.view === view
                ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
            }`}
          >
            {view === "open" ? "Open" : "Closed"}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-6 py-12 text-center text-sm text-[var(--paper-soft)]">
          {open ? "No open reports. Nothing is waiting on you here." : "No closed reports yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((report) => (
            <li key={report.id} className="rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-relaxed text-[var(--paper-ink)]">“{report.reason}”</p>
                  <p className="mt-1 text-xs text-[var(--paper-soft)]">
                    <span className="dash-num">{day(report.createdAt)}</span>
                    {" · "}
                    {report.reporterEmail ?? "Anonymous"}
                    {open ? null : (
                      <>
                        {" · "}
                        {RESOLUTION_LABEL[report.status]}
                      </>
                    )}
                  </p>
                </div>
                {open ? <ResolveReport reportId={report.id} /> : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--paper-rule)] pt-3 text-sm">
                {report.code ? (
                  <>
                    <Link href={`/admin/codes/${report.code.id}`} className="min-w-0 no-underline">
                      <span className="font-medium text-[var(--paper-ink)] underline underline-offset-4">
                        {report.code.name}
                      </span>{" "}
                      <span className="font-mono text-xs text-[var(--paper-soft)]">
                        {CODE_HOST}/{report.reportedCode}
                      </span>
                    </Link>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <StatusPill status={report.code.status} />
                      {report.code.archived ? <Tag>Archived</Tag> : null}
                      {open && report.code.openReports > 1 ? (
                        <Tag tone="struck">{report.code.openReports} open reports</Tag>
                      ) : null}
                    </span>
                    <Link href={`/admin/customers/${report.code.ownerId}`} className="text-[var(--paper-soft)]">
                      {report.code.ownerEmail}
                    </Link>
                    {open ? (
                      <Link
                        href={`/admin/codes/${report.code.id}`}
                        className="ml-auto text-sm font-medium text-[var(--paper-ink)]"
                      >
                        Review and block →
                      </Link>
                    ) : null}
                  </>
                ) : (
                  <span className="text-[var(--paper-soft)]">
                    <span className="font-mono">{CODE_HOST}/{report.reportedCode}</span>: no such code, or it has
                    since been erased.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {filters.page > 1 || hasMore ? (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-between text-sm">
          {filters.page > 1 ? <Link href={listHref(filters, { page: filters.page - 1 })}>Previous</Link> : <span />}
          <span className="text-[var(--paper-soft)]">Page {filters.page}</span>
          {hasMore ? <Link href={listHref(filters, { page: filters.page + 1 })}>Next</Link> : <span />}
        </nav>
      ) : null}
    </AdminShell>
  );
}
