import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CODE_HOST } from "@/lib/brand";
import { dynamicType, isDynamicKind } from "@/lib/qr-types";
import { ANALYTICS_WINDOWS, codeAnalytics } from "@/lib/user-codes";
import { codeReports, destinationChanges, getStaffCode, staffActions } from "@/lib/moderation";
import { StatusPill } from "@/app/(app)/app/StatusPill";
import { AnalyticsPanel } from "@/app/(app)/app/[id]/Analytics";
import { audit, requireStaff } from "../../guard";
import { AdminShell, SectionHeading, StaffHistory, Stat, Tag, day, tableClass, tdClass, thClass } from "../../AdminShell";
import { CodeActions } from "../CodeActions";
import { WarnForm } from "../../customers/WarnForm";
import { Destination } from "../Destination";

export const metadata: Metadata = { title: "Code · Admin" };
export const instant = false;

const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const REPORT_TONE: Record<string, "soft" | "struck"> = { open: "struck", actioned: "soft", dismissed: "soft" };

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
        data: await codeAnalytics(code.owner.id, String(code.id), days),
      }))
    ),
  ]);

  audit(staff, { action: "view", targetType: "code", targetId: String(code.id) });

  const openReports = reports.filter((report) => report.status === "open").length;

  return (
    <AdminShell
      heading={code.name}
      current="/admin/codes"
      meta={<span className="font-mono">{CODE_HOST}/{code.shortCode}</span>}
    >
      <Link
        href="/admin/codes"
        className="-mt-4 mb-6 inline-block text-sm text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
      >
        All codes
      </Link>

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

        <section aria-labelledby="actions-heading">
          <SectionHeading id="actions-heading">Moderate</SectionHeading>
          <div className="mt-4">
            <span className="mb-4 inline-flex items-center gap-1.5">
              <StatusPill status={code.status} />
              {code.archived ? <Tag>Archived</Tag> : null}
            </span>
            <CodeActions
              codeId={code.id}
              status={code.status}
              archived={code.archived}
              ownerGone={code.owner.erased}
            />
          </div>
        </section>

        {code.owner.erased ? null : (
          <section aria-labelledby="warn-heading">
            <SectionHeading id="warn-heading">Warn the owner</SectionHeading>
            <p className="mt-4 mb-4 text-sm text-[var(--paper-soft)]">
              Their earlier warnings are on{" "}
              <Link href={`/admin/customers/${code.owner.id}#warnings-heading`}>their account page</Link>.
            </p>
            <WarnForm
              userId={code.owner.id}
              fixedCode={{ id: code.id, label: `${CODE_HOST}/${code.shortCode}` }}
            />
          </section>
        )}

        <AnalyticsPanel windows={windows} />

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

        <section aria-labelledby="reports-heading">
          <SectionHeading id="reports-heading">Abuse reports</SectionHeading>
          {reports.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">Nobody has reported this code.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {reports.map((report) => (
                <li key={report.id} className="rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--paper-soft)]">
                    <Tag tone={REPORT_TONE[report.status]}>{report.status}</Tag>
                    <span className="dash-num">{day(report.createdAt)}</span>
                    <span>{report.reporterEmail ?? "Anonymous"}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap">{report.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="staff-heading">
          <SectionHeading id="staff-heading">Staff changes</SectionHeading>
          <StaffHistory entries={actions} />
        </section>
      </div>
    </AdminShell>
  );
}
