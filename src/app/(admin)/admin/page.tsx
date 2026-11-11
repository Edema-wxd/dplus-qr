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
import { attentionCounts } from "@/lib/reports";
import { pageReferrals } from "@/lib/signup-source";
import { audit, requireStaff } from "./guard";
import { RetryEvent } from "./RetryEvent";
import { AdminShell, SectionHeading, Stat, day, tableClass, tdClass, thClass } from "./AdminShell";

// No admin page names the admin in its title. A title is in the prerendered
// shell, and when `proxy.ts` cannot tell who is staff it lets the shell go out
// to whoever asked, before `requireStaff()` refuses them.
export const metadata: Metadata = { title: "Overview" };

// Live figures for one staff member, with nothing useful to stream around.
export const instant = false;

export default async function AdminOverview() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin" });

  const [plans, accounts, pastDue, webhooks, attention, referrals] = await Promise.all([
    planSubscribers(),
    accountTotals(),
    pastDueAccounts(),
    webhookHealth(),
    attentionCounts(),
    // A figure, not something to act on, so a failure (a preview build ahead
    // of migration 024, say) hides the section instead of breaking the page.
    pageReferrals().catch((error) => {
      console.error("[admin] page referrals unavailable", error);
      return null;
    }),
  ]);
  const revenue = summariseRevenue(plans);
  const paidPlans = plans.filter((plan) => plan.amountKobo > 0 && (plan.active || plan.pastDue));
  const soonestPause = pastDue.find((row) => row.graceUntil)?.graceUntil ?? null;

  // What is waiting on staff, most urgent first. Each item says what to do
  // and goes straight to where it is done.
  const todo: { count: number; title: string; detail: string; href: string; cta: string }[] = [
    {
      count: attention.openReports,
      title: attention.openReports === 1 ? "open abuse report" : "open abuse reports",
      detail: "Someone says a code leads somewhere harmful. Review it, then block it or dismiss the report.",
      href: "/admin/reports",
      cta: "Review reports",
    },
    {
      count: attention.finalWarningsDue,
      title: attention.finalWarningsDue === 1 ? "final warning past due" : "final warnings past due",
      detail:
        "Nothing happens on its own when the date passes. Suspend the account, or close the warning if they put it right.",
      href: "/admin/monitor#due-heading",
      cta: "Decide",
    },
    {
      count: attention.overdueAccounts,
      title: attention.overdueAccounts === 1 ? "account overdue" : "accounts overdue",
      detail: soonestPause
        ? `A renewal failed. The first account's codes pause on ${day(soonestPause)} unless it pays.`
        : "A renewal failed, and their codes pause when the grace period ends.",
      href: "/admin/customers?state=overdue",
      cta: "See who",
    },
    {
      count: attention.unappliedPayments,
      title: attention.unappliedPayments === 1 ? "Paystack event not applied" : "Paystack events not applied",
      detail: "A payment, renewal or cancellation the database has not caught up with.",
      href: "#payments",
      cta: "See events",
    },
    {
      count: attention.unpurchasablePlans,
      title: attention.unpurchasablePlans === 1 ? "plan on sale but not buyable" : "plans on sale but not buyable",
      detail: "Customers see the price, but checkout needs the plan connected to Paystack.",
      href: "/admin/plans",
      cta: "Connect plans",
    },
    {
      count: attention.signInsToRemove,
      title: attention.signInsToRemove === 1 ? "sign-in to remove" : "sign-ins to remove",
      detail:
        "Erased accounts whose login still exists, usually from the retention sweep. Open the customer and use Remove sign-in.",
      // Erasing also archives, so erased accounts are listed under Archived.
      href: "/admin/customers?state=archived",
      cta: "Open archived customers",
    },
  ].filter((item) => item.count > 0);

  return (
    <AdminShell heading="Overview" current="/admin" meta="What needs you, then how the business is doing.">
      <div className="space-y-10">
        <section aria-labelledby="todo-heading">
          <SectionHeading id="todo-heading">Needs attention</SectionHeading>
          {todo.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-[var(--paper-soft)]">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-[var(--live-ink)]" />
              Nothing is waiting on you. No open reports, no final warning due, nobody overdue, every payment applied.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--paper-rule)] overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-white">
              {todo.map((item) => (
                <li key={item.href} className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors duration-150 hover:bg-[var(--paper-raised)]">
                  <span className="dash-num inline-flex min-w-[2rem] justify-center rounded-full bg-[var(--struck-ink)] px-2 text-sm font-medium leading-6 text-white">
                    {item.count.toLocaleString("en-NG")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--paper-ink)]">{item.title}</span>
                    <span className="block text-xs text-[var(--paper-soft)]">{item.detail}</span>
                  </span>
                  <Link
                    href={item.href}
                    className="text-sm font-medium text-[var(--paper-ink)] no-underline after:absolute after:inset-0 after:content-['']"
                  >
                    {item.cta} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

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
            href="/admin/customers?state=paying"
          />
          <Stat
            label="Payment overdue"
            value={revenue.pastDue.toLocaleString("en-NG")}
            note={`₦${naira(revenue.atRiskKobo)} a month at risk`}
            href="/admin/customers?state=overdue"
          />
          <Stat
            href="/admin/customers"
            label="Accounts"
            value={accounts.total.toLocaleString("en-NG")}
            note={`${accounts.newLast30Days.toLocaleString("en-NG")} new in 30 days · ${revenue.free.toLocaleString("en-NG")} on Free`}
          />
        </dl>

        {referrals ? (
          <section aria-labelledby="referrals-heading">
            <SectionHeading id="referrals-heading">Sign-ups from hosted pages</SectionHeading>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--paper-soft)]">
              <span className="dash-num font-medium text-[var(--paper-ink)]">
                {referrals.total.toLocaleString("en-NG")}
              </span>{" "}
              {referrals.total === 1 ? "account" : "accounts"} in the last 30 days came from the &ldquo;Powered
              by&rdquo; footer on a customer&apos;s page. Only a sign-up made on the visit that followed the
              footer is counted; nothing is stored on the visitor&apos;s phone.
            </p>
            {referrals.topPages.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
                <table className={tableClass}>
                  <thead className="border-b border-[var(--paper-rule)]">
                    <tr>
                      <th scope="col" className={thClass}>Page</th>
                      <th scope="col" className={thClass}>Owner</th>
                      <th scope="col" className={`${thClass} text-right`}>Sign-ups</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.topPages.map((page) => (
                      <tr key={page.codeId} className="dash-row border-b border-[var(--paper-rule)] last:border-b-0">
                        <td className={tdClass}>
                          <Link href={`/admin/codes/${page.codeId}`} className="underline underline-offset-4">
                            {page.codeName}
                          </Link>
                          <span className="block font-mono text-xs text-[var(--paper-soft)]">{page.shortCode}</span>
                        </td>
                        <td className={tdClass}>
                          <Link href={`/admin/customers/${page.ownerId}`} className="underline underline-offset-4">
                            {page.ownerEmail}
                          </Link>
                        </td>
                        <td className={`${tdClass} dash-num text-right`}>{page.signups}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {webhooks.unprocessed > 0 ? (
          <section id="payments" aria-labelledby="webhooks-heading" className="scroll-mt-8">
            <SectionHeading id="webhooks-heading">Unapplied Paystack events</SectionHeading>
            <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--paper-soft)]">
              {webhooks.unprocessed.toLocaleString("en-NG")} event
              {webhooks.unprocessed === 1 ? " has" : "s have"} not been applied
              {webhooks.failed > 0 ? `, ${webhooks.failed.toLocaleString("en-NG")} with an error` : ""}. Each is a
              payment, renewal or cancellation the database has not caught up with. An unknown plan code usually
              means a plan was created in Paystack directly rather than connected from the Plans page. Fix the
              cause, then retry the event. Events that only failed are retried by themselves each night.
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={tableClass}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>Received</th>
                    <th scope="col" className={thClass}>Type</th>
                    <th scope="col" className={thClass}>State</th>
                    <th scope="col" className={thClass}><span className="sr-only">Retry</span></th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.recent.map((event) => (
                    <tr key={event.id} className="border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(event.receivedAt)}</td>
                      <td className={`${tdClass} font-mono text-xs`}>{event.type}</td>
                      <td className={`${tdClass} text-xs`}>
                        {event.error ? (
                          <span className="text-[var(--struck-ink)]">Failed: {event.error}</span>
                        ) : (
                          <span className="text-[var(--pending-ink)]">
                            Waiting to be applied
                            {event.attempts > 1 ? ` (${event.attempts} attempts)` : ""}
                          </span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <RetryEvent eventId={event.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

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

      </div>
    </AdminShell>
  );
}
