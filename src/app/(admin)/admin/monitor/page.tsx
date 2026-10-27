import type { Metadata } from "next";
import Link from "next/link";
import { CODE_HOST } from "@/lib/brand";
import {
  failingDestinations,
  mostReported,
  NEW_ACCOUNT_DAYS,
  newAccountChanges,
  scanSpikes,
  SPIKE_FACTOR,
  SPIKE_MIN_SCANS,
  type WatchedCode,
} from "@/lib/monitoring";
import { dueFinalWarnings, formatRespondBy } from "@/lib/warnings";
import { audit, requireStaff } from "../guard";
import { AdminShell, SectionHeading, day, tableClass, tdClass, thClass } from "../AdminShell";
import { Destination } from "../codes/Destination";
import { WarningActions } from "../customers/WarnForm";

export const metadata: Metadata = { title: "Monitor · Admin" };
export const instant = false;

/**
 * Everything worth a look, on one page. Each list is a prompt, never a
 * verdict: the code's own page is where staff block, archive or warn.
 */
export default async function AdminMonitor() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/monitor" });

  const [due, spikes, failing, changes, reported] = await Promise.all([
    dueFinalWarnings(),
    scanSpikes(),
    failingDestinations(),
    newAccountChanges(),
    mostReported(),
  ]);

  return (
    <AdminShell heading="Monitor" current="/admin/monitor" meta="Codes and accounts that need a person to look at them.">
      <div className="space-y-12">
        <section aria-labelledby="due-heading">
          <SectionHeading id="due-heading">Final warnings due ({due.length})</SectionHeading>
          <p className="mt-3 max-w-[70ch] text-sm text-[var(--paper-soft)]">
            Nothing happens on its own when a date passes. Suspend the account, or close the warning if they put it
            right.
          </p>
          {due.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">None due.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {due.map((warning) => (
                <li key={warning.id} className="rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--paper-soft)]">
                    <Link href={`/admin/customers/${warning.userId}`} className="font-medium text-[var(--paper-ink)]">
                      {warning.email}
                    </Link>
                    <span className="font-medium text-[var(--struck-ink)]">
                      Due since {formatRespondBy(warning.respondBy!)}
                    </span>
                    <span>sent {day(warning.createdAt)} by {warning.issuedBy ?? "a removed staff account"}</span>
                    <span>{warning.acknowledgedAt ? "read" : "not read"}</span>
                    {warning.shortCode && warning.qrId ? (
                      <Link href={`/admin/codes/${warning.qrId}`} className="font-mono">
                        {CODE_HOST}/{warning.shortCode}
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap">{warning.message}</p>
                  <div className="mt-3">
                    <WarningActions warningId={warning.id} final due />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <WatchTable
          id="spikes"
          title={`Scan spikes today (${spikes.length})`}
          note={`At least ${SPIKE_MIN_SCANS} scans today and ${SPIKE_FACTOR}× the code's daily average over the last week. A spike on a new code can be a launch; on an old one, check it still points where it should.`}
          empty="No unusual scanning today."
          codes={spikes}
          extra={{ heading: "Today / usual", cell: (code) => `${code.today.toLocaleString("en-NG")} / ${code.average.toFixed(1)}` }}
        />

        <WatchTable
          id="failing"
          title={`Destinations failing today's screening (${failing.codes.length})`}
          note={`Live link codes saved before a rule existed. Checked the newest ${failing.checked.toLocaleString("en-NG")} live link codes on this page load.`}
          empty="Every live destination passes today's rules."
          codes={failing.codes}
          extra={{ heading: "Why", cell: (code) => code.reason }}
        />

        <WatchTable
          id="changes"
          title={`New accounts re-pointing codes (${changes.length})`}
          note={`Accounts under ${NEW_ACCOUNT_DAYS} days old whose destination changed this week. Making a code with a harmless link and re-pointing it once it is out is the oldest trick a dynamic code allows.`}
          empty="No new account has re-pointed a code this week."
          codes={changes}
          extra={{
            heading: "Changed",
            cell: (code) => `${code.changes}× · last ${day(code.changedAt)} · joined ${day(code.accountCreatedAt)}`,
          }}
        />

        <WatchTable
          id="reported"
          title={`Most reported (${reported.length})`}
          note="Codes with two or more open abuse reports. The reports themselves are under Reports."
          empty="No code has more than one open report."
          codes={reported}
          extra={{ heading: "Open reports", cell: (code) => String(code.openReports) }}
        />
      </div>
    </AdminShell>
  );
}

function WatchTable<T extends WatchedCode>({
  id,
  title,
  note,
  empty,
  codes,
  extra,
}: {
  id: string;
  title: string;
  note: string;
  empty: string;
  codes: T[];
  extra: { heading: string; cell: (code: T) => string };
}) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <SectionHeading id={`${id}-heading`}>{title}</SectionHeading>
      <p className="mt-3 max-w-[70ch] text-sm text-[var(--paper-soft)]">{note}</p>
      {codes.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--paper-soft)]">{empty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
          <table className={`${tableClass} min-w-[52rem]`}>
            <thead className="border-b border-[var(--paper-rule)]">
              <tr>
                <th scope="col" className={thClass}>Code</th>
                <th scope="col" className={thClass}>Points to</th>
                <th scope="col" className={thClass}>Owner</th>
                <th scope="col" className={thClass}>{extra.heading}</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className="dash-row border-b border-[var(--paper-rule)] last:border-b-0">
                  <td className={tdClass}>
                    <Link href={`/admin/codes/${code.id}`} className="block no-underline">
                      <span className="block text-[var(--paper-ink)]">{code.name}</span>
                      <span className="block font-mono text-xs text-[var(--paper-soft)]">
                        {CODE_HOST}/{code.shortCode}
                      </span>
                    </Link>
                  </td>
                  <td className={`${tdClass} max-w-[22rem]`}>
                    <Destination url={code.destinationUrl} shortCode={code.shortCode} kind={code.kind} compact />
                  </td>
                  <td className={tdClass}>
                    <Link href={`/admin/customers/${code.ownerId}`}>{code.ownerEmail}</Link>
                  </td>
                  <td className={`${tdClass} text-xs`}>{extra.cell(code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
