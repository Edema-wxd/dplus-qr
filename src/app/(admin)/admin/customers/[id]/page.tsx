import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

/**
 * Any Postgres `uuid`. Not zod's `uuid()`, which also demands an RFC version
 * and variant, and so would 404 a valid id the database happily stores.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import { getCustomer } from "@/lib/admin-billing";
import { getEntitlement } from "@/lib/entitlement";
import { listAllPlans } from "@/lib/plans";
import { naira } from "@/lib/plan-tiers";
import { CODE_HOST } from "@/lib/brand";
import { StatusPill } from "@/app/(app)/app/StatusPill";
import { audit, requireStaff } from "../../guard";
import { AdminShell, SectionHeading, Stat, day, tableClass, tdClass, thClass } from "../../AdminShell";
import { SubscriptionStatus } from "../SubscriptionStatus";
import { AssignPlan } from "../AssignPlan";

export const metadata: Metadata = { title: "Customer · Admin" };
export const instant = false;

const idSchema = z.string().regex(UUID);

/**
 * One account: its plan, every subscription it has held, its codes, and a
 * form to assign it a plan by hand. An account paying through Paystack is
 * changed in Paystack instead, and the webhook brings the change here.
 */
export default async function AdminCustomer({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();

  const [customer, entitlement, plans] = await Promise.all([
    getCustomer(parsed.data),
    getEntitlement(parsed.data),
    listAllPlans(),
  ]);
  if (!customer) notFound();

  const live = customer.subscriptions.find((sub) => sub.status === "active" || sub.status === "past_due");
  const assignable = plans
    .filter((plan) => plan.isActive)
    .map((plan) => ({
      slug: plan.slug,
      label: [
        plan.name,
        plan.amountKobo > 0
          ? `₦${naira(plan.amountKobo)} ${plan.interval === "annually" ? "a year" : "a month"}`
          : "no charge",
        `${plan.maxCodes} codes`,
      ].join(" · "),
    }));

  audit(staff, { action: "view", targetType: "customer", targetId: customer.id });

  return (
    <AdminShell heading={customer.name || customer.email} current="/admin/customers" meta={customer.email}>
      <Link
        href="/admin/customers"
        className="-mt-4 mb-6 inline-block text-sm text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
      >
        All customers
      </Link>

      <div className="space-y-10">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] lg:grid-cols-4">
          <Stat
            label="Plan"
            value={entitlement?.planName ?? "None"}
            note={entitlement ? (entitlement.active ? "Serving codes" : "Lapsed, codes paused") : "Codes paused"}
          />
          <Stat
            label="Codes"
            value={entitlement ? `${entitlement.codesUsed} of ${entitlement.maxCodes}` : String(customer.codes.length)}
          />
          <Stat label="Joined" value={day(customer.createdAt)} />
          <Stat
            label="Account"
            value={customer.suspendedAt ? "Suspended" : "In good standing"}
            note={
              customer.suspendedAt
                ? `Since ${day(customer.suspendedAt)}`
                : customer.hasPaystackCustomer
                  ? "Known to Paystack"
                  : "Never paid through Paystack"
            }
          />
        </dl>

        <section aria-labelledby="assign-heading">
          <SectionHeading id="assign-heading">Assign a plan</SectionHeading>
          <div className="mt-4">
            <AssignPlan
              userId={customer.id}
              plans={assignable}
              currentSlug={live?.planSlug ?? null}
              paysThroughPaystack={live?.viaPaystack === true}
            />
          </div>
        </section>

        <section aria-labelledby="subs-heading">
          <SectionHeading id="subs-heading">Subscriptions, newest first</SectionHeading>
          {customer.subscriptions.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">This account has never held a plan.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={`${tableClass} min-w-[48rem]`}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>Plan</th>
                    <th scope="col" className={thClass}>Status</th>
                    <th scope="col" className={thClass}>Period ends</th>
                    <th scope="col" className={thClass}>Grace until</th>
                    <th scope="col" className={thClass}>Started</th>
                    <th scope="col" className={thClass}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.subscriptions.map((sub) => (
                    <tr key={sub.id} className="border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={tdClass}>
                        {sub.planName}
                        <span className="block font-mono text-xs text-[var(--paper-soft)]">{sub.planSlug}</span>
                      </td>
                      <td className={tdClass}>
                        <SubscriptionStatus status={sub.status} cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
                      </td>
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(sub.currentPeriodEnd)}</td>
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(sub.graceUntil)}</td>
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(sub.createdAt)}</td>
                      <td className={`${tdClass} text-xs text-[var(--paper-soft)]`}>
                        {sub.viaPaystack ? "Paystack" : "Granted"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="codes-heading">
          <SectionHeading id="codes-heading">Codes</SectionHeading>
          {customer.codes.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--paper-soft)]">No codes yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
              <table className={tableClass}>
                <thead className="border-b border-[var(--paper-rule)]">
                  <tr>
                    <th scope="col" className={thClass}>Code</th>
                    <th scope="col" className={thClass}>Status</th>
                    <th scope="col" className={thClass}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {customer.codes.map((code) => (
                    <tr key={code.id} className="border-b border-[var(--paper-rule)] last:border-b-0">
                      <td className={tdClass}>
                        {code.name}
                        <span className="block font-mono text-xs text-[var(--paper-soft)]">
                          {CODE_HOST}/{code.shortCode}
                        </span>
                      </td>
                      <td className={tdClass}>
                        <StatusPill status={code.status as "active" | "paused" | "blocked"} />
                      </td>
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(code.createdAt)}</td>
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
