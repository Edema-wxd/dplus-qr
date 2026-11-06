import type { Metadata } from "next";
import Link from "next/link";
import { onboardingFunnel } from "@/lib/onboarding";
import { biggestDrop, formatDuration, PURPOSES } from "@/lib/onboarding-steps";
import { audit, requireStaff } from "../guard";
import { AdminShell, SectionHeading, Stat, tableClass, tdClass, thClass } from "../AdminShell";

export const metadata: Metadata = { title: "Onboarding · Admin" };

// Per-request figures for one staff member, with nothing useful to stream around.
export const instant = false;

const WINDOWS = [7, 30, 90] as const;

function accounts(n: number): string {
  return `${n.toLocaleString("en-NG")} ${n === 1 ? "account" : "accounts"}`;
}

function percent(share: number | null): string {
  if (share === null) return "–";
  return `${Math.round(share * 100)}%`;
}


/**
 * Where new accounts stop between signing up and a scanned first code.
 *
 * Read-only. Every step comes from `qr_onboarding_steps`, written the first
 * time each account reached it; whether a code was made or scanned is read
 * from the codes and scans themselves (`onboardingFunnel`). Only accounts
 * created since the onboarding shipped are counted, so older accounts that
 * were walked through it later do not flatter or sink the figures.
 */
export default async function AdminOnboarding({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const requested = Number(params.days);
  const days = (WINDOWS as readonly number[]).includes(requested) ? requested : 30;
  audit(staff, { action: "view", targetType: "page", targetId: `/admin/onboarding?days=${days}` });

  const funnel = await onboardingFunnel(days);
  const { cohort, outcomes } = funnel;
  const drop = biggestDrop(funnel.steps);
  const share = (n: number) => (cohort > 0 ? n / cohort : null);

  return (
    <AdminShell
      heading="Onboarding"
      current="/admin/onboarding"
      meta="How far new accounts get, from signing up to a first code that has been scanned."
      actions={
        <nav aria-label="Window" className="flex gap-1 rounded-lg border border-[var(--paper-rule)] bg-white p-1">
          {WINDOWS.map((window) => (
            <Link
              key={window}
              href={`/admin/onboarding?days=${window}`}
              aria-current={window === days ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm no-underline ${
                window === days
                  ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                  : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
              }`}
            >
              {window} days
            </Link>
          ))}
        </nav>
      }
    >
      <div className="space-y-10">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] lg:grid-cols-4">
          <Stat label="Signed up" value={cohort.toLocaleString("en-NG")} note={`In the last ${days} days`} />
          <Stat
            label="Made a code"
            value={percent(share(outcomes.madeCode))}
            note={`${accounts(outcomes.madeCode)}, by any route`}
          />
          <Stat
            label="Code scanned"
            value={percent(share(outcomes.scanned))}
            note={`${accounts(outcomes.scanned)}, by anyone`}
          />
          <Stat
            label="Time to first code"
            value={formatDuration(outcomes.medianSecondsToCode)}
            note="Median, from sign-up"
          />
        </dl>

        {cohort === 0 ? (
          <p className="text-sm text-[var(--paper-soft)]">
            Nobody has signed up in the last {days} days, so there is no funnel to show yet.
          </p>
        ) : (
          <>
            {drop ? (
              <p className="max-w-[70ch] rounded-lg border border-[var(--pending-ink)]/50 bg-white px-4 py-3 text-sm leading-relaxed">
                <strong className="font-medium">The biggest drop is at “{drop.from}”.</strong>{" "}
                Of the {drop.before.toLocaleString("en-NG")} who got there,{" "}
                {(drop.before - drop.after).toLocaleString("en-NG")} went no further
                {drop.skipped > 0
                  ? `, ${drop.skipped.toLocaleString("en-NG")} of them by skipping to the dashboard`
                  : ""}
                .
              </p>
            ) : null}

            <section aria-labelledby="funnel-heading">
              <SectionHeading id="funnel-heading">Step by step</SectionHeading>
              <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
                <table className={`${tableClass} min-w-[44rem]`}>
                  <caption className="sr-only">
                    Accounts that signed up in the last {days} days, by the furthest onboarding step reached.
                  </caption>
                  <thead className="border-b border-[var(--paper-rule)]">
                    <tr>
                      <th scope="col" className={thClass}>Step</th>
                      <th scope="col" className={`${thClass} w-[34%]`}>Reached</th>
                      <th scope="col" className={`${thClass} text-right`}>Of previous</th>
                      <th scope="col" className={`${thClass} text-right`}>Median time</th>
                      <th scope="col" className={`${thClass} text-right`}>Skipped</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.steps.map((step, index) => (
                      <tr key={step.event} className="border-b border-[var(--paper-rule)] last:border-b-0">
                        <th scope="row" className={`${tdClass} text-left font-normal`}>
                          <span className="dash-num mr-2 text-[var(--paper-soft)]">{index + 1}</span>
                          {step.label}
                        </th>
                        <td className={tdClass}>
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-[2px] bg-[var(--paper-raised)]">
                              <div
                                className="h-full rounded-[2px] bg-[var(--pin-ink)]"
                                style={{ width: `${Math.round(step.ofStart * 100)}%` }}
                              />
                            </div>
                            <span className="dash-num w-24 shrink-0 text-right">
                              {step.reached.toLocaleString("en-NG")}{" "}
                              <span className="text-[var(--paper-soft)]">{percent(step.ofStart)}</span>
                            </span>
                          </div>
                        </td>
                        <td
                          className={`${tdClass} dash-num text-right ${
                            step.event === drop?.event ? "font-medium text-[var(--struck-ink)]" : ""
                          }`}
                        >
                          {percent(step.ofPrevious)}
                        </td>
                        <td className={`${tdClass} dash-num text-right`}>{formatDuration(step.medianSeconds)}</td>
                        <td className={`${tdClass} dash-num text-right`}>
                          {step.skippedHere > 0 ? step.skippedHere.toLocaleString("en-NG") : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-[var(--paper-soft)]">
                Median time is from the step before to this one, for the accounts that made it.
                Downloading is optional, so someone can scan without it. “Of previous” is the share
                of those who reached the step before; scanning and finishing are measured against
                making the code. “Skipped” counts accounts that left for the
                dashboard from that step&apos;s screen; some came back later.
              </p>
            </section>

            <div className="grid gap-10 lg:grid-cols-2">
              <section aria-labelledby="purpose-heading">
                <SectionHeading id="purpose-heading">What first codes are for</SectionHeading>
                <ul className="mt-4 space-y-2.5">
                  {funnel.purposes.map((row) => (
                    <li key={row.purpose ?? "none"} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 text-sm">
                      <span>{row.purpose ? PURPOSES[row.purpose].label : "Did not say"}</span>
                      <span className="dash-num text-right">
                        {row.accounts.toLocaleString("en-NG")}{" "}
                        <span className="text-[var(--paper-soft)]">{percent(share(row.accounts))}</span>
                      </span>
                      <span className="col-span-2 h-1.5 overflow-hidden rounded-[2px] bg-[var(--paper-raised)]">
                        <span
                          className="block h-full bg-[var(--paper-ink)]/70"
                          style={{ width: `${Math.round((share(row.accounts) ?? 0) * 100)}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="outcomes-heading">
                <SectionHeading id="outcomes-heading">After sign-up</SectionHeading>
                <dl className="mt-4 divide-y divide-[var(--paper-rule)] text-sm">
                  <Outcome
                    term="Made a code within a day"
                    count={outcomes.madeCodeWithinDay}
                    of={share(outcomes.madeCodeWithinDay)}
                  />
                  <Outcome
                    term="Code scanned within a week"
                    count={outcomes.scannedWithinWeek}
                    of={share(outcomes.scannedWithinWeek)}
                  />
                  <Outcome term="Confirmed their email" count={outcomes.verifiedEmail} of={share(outcomes.verifiedEmail)} />
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-[var(--paper-soft)]">
                  Scans include the owner&apos;s own test scan. Codes made on the dashboard after
                  skipping count as made.
                </p>
              </section>
            </div>

          </>
        )}

      </div>
    </AdminShell>
  );
}

function Outcome({ term, count, of }: { term: string; count: number; of: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt>{term}</dt>
      <dd className="dash-num">
        {count.toLocaleString("en-NG")} <span className="text-[var(--paper-soft)]">{percent(of)}</span>
      </dd>
    </div>
  );
}
