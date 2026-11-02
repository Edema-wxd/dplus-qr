import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getCustomer } from "@/lib/admin-billing";
import { isAdmin } from "@/lib/admin";
import { hasSignInAccount, staffActions } from "@/lib/moderation";
import { getEntitlement } from "@/lib/entitlement";
import { listAllPlans } from "@/lib/plans";
import { naira } from "@/lib/plan-tiers";
import { CODE_HOST } from "@/lib/brand";
import { StatusPill } from "@/app/(app)/app/StatusPill";
import { audit, requireStaff } from "../../guard";
import { AdminShell, SectionHeading, StaffHistory, Stat, Tag, day, tableClass, tdClass, thClass } from "../../AdminShell";
import { SubscriptionStatus } from "../SubscriptionStatus";
import { AssignPlan } from "../AssignPlan";
import { AccountActions } from "../AccountActions";
import { EraseAccount, RetryRemoveSignIn } from "../EraseAccount";

export const metadata: Metadata = { title: "Customer · Admin" };
export const instant = false;

/**
 * Any Postgres `uuid`. Not zod's `uuid()`, which also demands an RFC version
 * and variant, and so would 404 a valid id the database happily stores.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idSchema = z.string().regex(UUID);

/**
 * One account, in the order staff read it: where it stands, its plan and
 * billing history, its codes, what staff have done to it, and last, set apart,
 * the actions that take it out of service. An account paying through Paystack
 * has its plan changed in Paystack instead, and the webhook brings the change
 * here.
 */
export default async function AdminCustomer({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();

  const [customer, entitlement, plans, actions, signIn, staffAccount] = await Promise.all([
    getCustomer(parsed.data),
    getEntitlement(parsed.data),
    listAllPlans(),
    staffActions("customer", parsed.data),
    hasSignInAccount(parsed.data),
    isAdmin(parsed.data),
  ]);
  if (!customer) notFound();
  const erased = customer.erasedAt !== null;
  const isSelf = customer.id === staff.id;

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

  const paidViaPaystack = customer.hasPaystackCustomer || customer.subscriptions.some((sub) => sub.viaPaystack);

  // Said the way staff would check it: whether the codes are serving, and if
  // something is about to change, when.
  const planNote = customer.suspendedAt
    ? "Suspended, so codes show the paused page"
    : !entitlement
      ? "No plan, so codes show the paused page"
      : live?.status === "past_due"
        ? live.graceUntil
          ? `Payment overdue, codes pause ${day(live.graceUntil)}`
          : "Payment overdue"
        : !entitlement.active
          ? "Lapsed, codes paused"
          : live?.cancelAtPeriodEnd
            ? `Not renewing, ends ${day(live.currentPeriodEnd)}`
            : "Codes serving";

  const blocked = customer.codes.filter((code) => code.status === "blocked").length;
  const paused = customer.codes.filter((code) => code.status === "paused").length;
  const codesNote = [blocked ? `${blocked} blocked` : "", paused ? `${paused} paused` : ""].filter(Boolean).join(", ") || undefined;

  return (
    <AdminShell
      heading={erased ? "Erased account" : customer.name || customer.email}
      current="/admin/customers"
      back={{ href: "/admin/customers", label: "All customers" }}
      meta={erased ? `Erased ${day(customer.erasedAt)}` : customer.email}
    >

      <div className="space-y-10">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] lg:grid-cols-4">
          <Stat
            label="Plan"
            value={entitlement?.planName ?? "None"}
            note={planNote}
          />
          <Stat
            label="Codes"
            value={entitlement ? `${entitlement.codesUsed} of ${entitlement.maxCodes}` : String(customer.codes.length)}
            note={codesNote}
          />
          <Stat label="Joined" value={day(customer.createdAt)} />
          <Stat
            label="Account"
            value={
              erased ? "Erased" : customer.archivedAt ? "Archived" : customer.suspendedAt ? "Suspended" : "In good standing"
            }
            note={
              erased
                ? `On ${day(customer.erasedAt)}`
                : customer.archivedAt
                  ? `Since ${day(customer.archivedAt)}, and suspended`
                  : customer.suspendedAt
                    ? `Since ${day(customer.suspendedAt)}`
                    : paidViaPaystack
                      ? "Pays through Paystack"
                      : "Never paid through Paystack"
            }
          />
        </dl>

        {erased ? null : (
          <section aria-labelledby="assign-heading">
            <SectionHeading id="assign-heading">Plan</SectionHeading>
            <div className="mt-4">
              <AssignPlan
                userId={customer.id}
                plans={assignable}
                currentSlug={live?.planSlug ?? null}
                paysThroughPaystack={live?.viaPaystack === true}
              />
            </div>
          </section>
        )}

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
                        <Link href={`/admin/codes/${code.id}`} className="block no-underline">
                          <span className="block text-[var(--paper-ink)]">{code.name}</span>
                          <span className="block font-mono text-xs text-[var(--paper-soft)]">
                            {CODE_HOST}/{code.shortCode}
                          </span>
                        </Link>
                      </td>
                      <td className={tdClass}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          <StatusPill status={code.status} />
                          {code.archived ? <Tag>Archived</Tag> : null}
                        </span>
                      </td>
                      <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(code.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="staff-heading">
          <SectionHeading id="staff-heading">Staff changes</SectionHeading>
          <StaffHistory entries={actions} />
        </section>

        <section aria-labelledby="danger-heading">
          <SectionHeading id="danger-heading">Take action</SectionHeading>
          <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-[var(--paper-soft)]">
            These change what the customer and their scanners see. Everything here is recorded under staff changes
            above; only erasing cannot be undone.
          </p>
          <div className="mt-4 space-y-8 rounded-lg border border-[var(--struck-ink)]/30 bg-white px-4 py-5 sm:px-5">
          <section aria-labelledby="moderate-heading">
            <h3 id="moderate-heading" className="text-sm font-medium">Suspend, archive or block</h3>
            <div className="mt-4">
              {erased ? (
                signIn ? (
                  <RetryRemoveSignIn userId={customer.id} />
                ) : (
                  <p className="text-sm text-[var(--paper-soft)]">
                    Erased. Nothing remains to moderate: its codes answer as unknown and its short codes stay reserved.
                  </p>
                )
              ) : isSelf ? (
                <p className="text-sm text-[var(--paper-soft)]">This is your own account.</p>
              ) : (
                <AccountActions
                  userId={customer.id}
                  suspended={customer.suspendedAt !== null}
                  archived={customer.archivedAt !== null}
                  activeCodes={customer.codes.filter((code) => code.status !== "blocked").length}
                />
              )}
            </div>
          </section>

          {erased || isSelf ? null : (
            <section aria-labelledby="erase-heading">
              <h3 id="erase-heading" className="text-sm font-medium">Erase for good</h3>
              <div className="mt-4">
                {staffAccount ? (
                  <p className="text-sm text-[var(--paper-soft)]">
                    This is a staff account. Remove its admin role in the database before it can be erased.
                  </p>
                ) : live?.viaPaystack ? (
                  <p className="max-w-[70ch] text-sm text-[var(--paper-soft)]">
                    This account pays through Paystack. Cancel the subscription in Paystack first, or it keeps charging
                    an account that no longer exists.
                  </p>
                ) : (
                  <EraseAccount userId={customer.id} email={customer.email} />
                )}
              </div>
            </section>
          )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
