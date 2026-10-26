import type { Metadata } from "next";
import Link from "next/link";
import { listAllPlans } from "@/lib/plans";
import { planSubscribers } from "@/lib/admin-billing";
import { historyLabel, naira } from "@/lib/plan-tiers";
import { PLAN_FEATURES, describeFeature } from "@/lib/plan-features";
import { primaryButtonClass } from "@/components/controls";
import { audit, requireStaff } from "../guard";
import { AdminShell, tableClass, tdClass, thClass } from "../AdminShell";

export const metadata: Metadata = { title: "Plans · Admin" };
export const instant = false;

/**
 * The plan catalogue as the database holds it: every plan, its limits, which
 * features it carries, and who is on it. Each plan opens to an edit form;
 * every change is audited.
 */
export default async function AdminPlans() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/plans" });

  const [plans, counts] = await Promise.all([listAllPlans(), planSubscribers()]);
  const countFor = new Map(counts.map((row) => [row.planId, row]));
  const unsynced = plans.filter((plan) => plan.isActive && plan.amountKobo > 0 && !plan.paystackPlanCode);

  return (
    <AdminShell
      heading="Plans"
      current="/admin/plans"
      meta="Every row in qr_plans, retired and free included. Changes apply on the next page load."
    >
      <div className="mb-6">
        <Link href="/admin/plans/new" className={`${primaryButtonClass} no-underline`}>
          New plan
        </Link>
      </div>

      {unsynced.length > 0 ? (
        <p role="status" className="mb-6 rounded-lg border border-[var(--pending-ink)]/50 bg-white px-4 py-3 text-sm leading-relaxed">
          <strong className="font-medium">
            {unsynced.length} paid plan{unsynced.length === 1 ? " has" : "s have"} no Paystack code
          </strong>{" "}
          and cannot be bought online: {unsynced.map((plan) => plan.slug).join(", ")}. Open each one and
          connect it to Paystack.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
        <table className={`${tableClass} min-w-[60rem]`}>
          <thead className="border-b border-[var(--paper-rule)]">
            <tr>
              <th scope="col" className={thClass}>Plan</th>
              <th scope="col" className={`${thClass} text-right`}>Price</th>
              <th scope="col" className={`${thClass} text-right`}>Codes</th>
              <th scope="col" className={thClass}>History</th>
              <th scope="col" className={thClass}>Paystack</th>
              <th scope="col" className={`${thClass} text-right`}>On it now</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => {
              const count = countFor.get(plan.id);
              return (
                <tr
                  key={plan.id}
                  className={`border-b border-[var(--paper-rule)] last:border-b-0 ${plan.isActive ? "" : "text-[var(--paper-soft)]"}`}
                >
                  <td className={tdClass}>
                    <Link href={`/admin/plans/${plan.id}`} className="block font-medium underline underline-offset-4">
                      {plan.name}
                    </Link>
                    <span className="block font-mono text-xs text-[var(--paper-soft)]">{plan.slug}</span>
                    {plan.isActive ? null : <span className="text-xs">Retired</span>}
                  </td>
                  <td className={`${tdClass} dash-num whitespace-nowrap text-right`}>
                    {plan.amountKobo > 0 ? `₦${naira(plan.amountKobo)}` : "Free"}
                    <span className="block text-xs text-[var(--paper-soft)]">
                      {plan.interval === "annually" ? "per year" : "per month"}
                    </span>
                  </td>
                  <td className={`${tdClass} dash-num text-right`}>{plan.maxCodes}</td>
                  <td className={`${tdClass} text-xs`}>
                    {historyLabel(plan.historyDays)}
                    <span className="block text-[var(--paper-soft)]">Grace {plan.graceDays} days</span>
                  </td>
                  <td className={`${tdClass} text-xs`}>
                    {plan.amountKobo <= 0 ? (
                      <span className="text-[var(--paper-soft)]">Never billed</span>
                    ) : plan.paystackPlanCode ? (
                      <span className="font-mono">{plan.paystackPlanCode}</span>
                    ) : (
                      <span className="text-[var(--pending-ink)]">Not synced</span>
                    )}
                  </td>
                  <td className={`${tdClass} dash-num text-right`}>
                    {count ? count.active + count.pastDue : 0}
                    {count && count.pastDue > 0 ? (
                      <span className="block text-xs text-[var(--paper-soft)]">{count.pastDue} overdue</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-12 border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">
        Features by plan
      </h2>
      <div className="overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
        <table className={`${tableClass} min-w-[56rem]`}>
          <thead className="border-b border-[var(--paper-rule)]">
            <tr>
              <th scope="col" className={thClass}>Plan</th>
              {PLAN_FEATURES.map((def) => (
                <th key={def.key} scope="col" className={thClass}>
                  {def.label}
                  {def.built ? null : <span className="block normal-case tracking-normal">not built</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className={`border-b border-[var(--paper-rule)] last:border-b-0 ${plan.isActive ? "" : "text-[var(--paper-soft)]"}`}>
                <th scope="row" className={`${tdClass} text-left font-normal`}>
                  <Link href={`/admin/plans/${plan.id}`} className="whitespace-nowrap font-mono text-xs underline underline-offset-4">
                    {plan.slug}
                  </Link>
                </th>
                {PLAN_FEATURES.map((def) => {
                  const shown = describeFeature(def, plan.features[def.key]);
                  return (
                    <td key={def.key} className={`${tdClass} text-xs`}>
                      {shown ?? <span className="text-[var(--paper-soft)]">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
