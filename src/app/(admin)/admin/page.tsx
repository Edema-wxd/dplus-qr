import type { Metadata } from "next";
import Link from "next/link";
import {
  accountTotals,
  monthlyKobo,
  pastDueAccounts,
  planSubscribers,
  summariseRevenue,
  webhookHealth,
} from "@/lib/admin-billing";
import { naira } from "@/lib/plan-tiers";
import { openReportCount } from "@/lib/monitoring";
import { dueFinalWarningCount } from "@/lib/warnings";
import { audit, requireStaff } from "./guard";
import { AdminShell, SectionHeading, Stat, day, tableClass, tdClass, thClass } from "./AdminShell";

export const metadata: Metadata = { title: "Admin" };

// Live figures for one staff member, with nothing useful to stream around.
export const instant = false;

export default async function AdminOverview() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin" });

  const [plans, accounts, pastDue, webhooks, openReports, warningsDue] = await Promise.all([
    planSubscribers(),
    accountTotals(),
    pastDueAccounts(),
    webhookHealth(),
    openReportCount(),
    dueFinalWarningCount(),
  ]);
  const revenue = summariseRevenue(plans);
  const paidPlans = plans.filter((plan) => plan.amountKobo > 0 && (plan.active || plan.pastDue));

  return (
    <AdminShell heading="Overview" current="/admin" meta="Billing across every account, live from the database.">
      <div className="space-y-10">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] lg:grid-cols-4">
          <Stat
            label="Monthly recurring"
            value={`₦${naira(revenue.mrrKobo)}`}
            note="Active paid plans, annual spread over 12"
          />
          <Stat
            label="Paying accounts"
            value={revenue.paidActive.toLocaleString("en-NG")}
            note={`${revenue.nonRenewing.toLocaleString("en-NG")} set not to renew`}
          />
          <Stat
            label="Payment overdue"
            value={revenue.pastDue.toLocaleString("en-NG")}
            note={`₦${naira(revenue.atRiskKobo)} a month at risk`}
          />
          <Stat
            label="Accounts"
            value={accounts.total.toLocaleString("en-NG")}
            note={`${accounts.newLast30Days.toLocaleString("en-NG")} new in 30 days · ${revenue.free.toLocaleString("en-NG")} on Free`}
          />
        </dl>

        {openReports > 0 || warningsDue > 0 ? (
          <section
            aria-labelledby="attention-heading"
            className="rounded-lg border border-[var(--struck-ink)]/50 bg-white px-4 py-3 text-sm"
          >
            <h2 id="attention-heading" className="font-medium">Needs a person</h2>
            <ul className="mt-1.5 space-y-1">
              {openReports > 0 ? (
                <li>
                  <Link href="/admin/reports">
                    {openReports.toLocaleString("en-NG")} open abuse {openReports === 1 ? "report" : "reports"}
                  </Link>
                </li>
              ) : null}
              {warningsDue > 0 ? (
                <li>
                  <Link href="/admin/monitor#due-heading">
                    {warningsDue.toLocaleString("en-NG")} final {warningsDue === 1 ? "warning" : "warnings"} past due,
                    waiting on a decision
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {webhooks.unprocessed > 0 ? (
          <section aria-labelledby="webhooks-heading">
            <SectionHeading id="webhooks-heading">Unapplied Paystack events</SectionHeading>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--paper-soft)]">
              {webhooks.unprocessed.toLocaleString("en-NG")} event
              {webhooks.unprocessed === 1 ? " has" : "s have"} not been applied
              {webhooks.failed > 0 ? `, ${webhooks.failed.toLocaleString("en-NG")} with an error` : ""}. Each is a
              payment, renewal or cancellation the database has not caught up with. An unknown plan code usually
              means a plan was created in Paystack directly rather than connected from the Plans page.
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={tableClass}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>Received</th>
                    <th scope="col" className={thClass}>Type</th>
                    <th scope="col" className={thClass}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.recent.map((event) => (
                    <tr key={event.id} className="border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(event.receivedAt)}</td>
                      <td className={`${tdClass} font-mono text-xs`}>{event.type}</td>
                      <td className={`${tdClass} text-xs text-[var(--struck-ink)]`}>{event.error ?? "Not yet processed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="mix-heading">
          <SectionHeading id="mix-heading">Paid subscriptions by plan</SectionHeading>
          {paidPlans.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">No paid subscriptions yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={`${tableClass} min-w-[36rem]`}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>Plan</th>
                    <th scope="col" className={`${thClass} text-right`}>Active</th>
                    <th scope="col" className={`${thClass} text-right`}>Overdue</th>
                    <th scope="col" className={`${thClass} text-right`}>Monthly value</th>
                  </tr>
                </thead>
                <tbody>
                  {paidPlans.map((plan) => (
                    <tr key={plan.planId} className="border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={tdClass}>
                        {plan.name}{" "}
                        <span className="text-[var(--paper-soft)]">
                          {plan.interval === "annually" ? "annual" : "monthly"}
                        </span>
                      </td>
                      <td className={`${tdClass} dash-num text-right`}>{plan.active}</td>
                      <td className={`${tdClass} dash-num text-right`}>{plan.pastDue}</td>
                      <td className={`${tdClass} dash-num text-right`}>
                        ₦{naira(monthlyKobo(plan.amountKobo, plan.interval) * plan.active)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="overdue-heading">
          <SectionHeading id="overdue-heading">In their grace period</SectionHeading>
          {pastDue.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">No account is overdue.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={tableClass}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>Account</th>
                    <th scope="col" className={thClass}>Plan</th>
                    <th scope="col" className={thClass}>Codes pause on</th>
                  </tr>
                </thead>
                <tbody>
                  {pastDue.map((row) => (
                    <tr key={row.userId} className="dash-row border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={tdClass}>
                        <Link href={`/admin/customers/${row.userId}`} className="underline underline-offset-4">
                          {row.email}
                        </Link>
                      </td>
                      <td className={tdClass}>{row.planName}</td>
                      <td className={`${tdClass} dash-num`}>{day(row.graceUntil)}</td>
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
