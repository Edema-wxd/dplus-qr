import type { Metadata } from "next";
import Link from "next/link";
import {
  CUSTOMER_STATES,
  CUSTOMERS_PER_PAGE,
  CUSTOMER_STATE_LABELS,
  customerFiltersSchema,
  listCustomers,
  type CustomerFilters,
  type CustomerRow,
} from "@/lib/admin-billing";
import { listAllPlans } from "@/lib/plans";
import { tierKey } from "@/lib/plan-tiers";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { audit, requireStaff } from "../guard";
import { AdminShell, Tag, day, tableClass, tdClass, thClass } from "../AdminShell";
import { SubscriptionStatus } from "./SubscriptionStatus";

export const metadata: Metadata = { title: "Customers · Admin" };
export const instant = false;

/** The list's URL with some filters changed, for the pager and "clear". */
function listHref(filters: CustomerFilters, change: Partial<CustomerFilters>): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.state) params.set("state", next.state);
  if (next.plan) params.set("plan", next.plan);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/customers?${query}` : "/admin/customers";
}

export default async function AdminCustomers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const filters = customerFiltersSchema.parse(await searchParams);

  // A search is a look at personal data, so the term goes in the audit too.
  audit(staff, {
    action: filters.q ? "search" : "view",
    targetType: "page",
    targetId: "/admin/customers",
    detail: filters.q ? { q: filters.q } : {},
  });

  const [{ rows, total, hasMore }, plans] = await Promise.all([listCustomers(filters), listAllPlans()]);
  const filtered = Boolean(filters.q || filters.state || filters.plan);

  // One choice per tier, monthly and annual together, in catalogue order.
  const tiers: { key: string; name: string }[] = [];
  for (const plan of plans) {
    const key = tierKey(plan.slug);
    if (!tiers.some((tier) => tier.key === key)) tiers.push({ key, name: plan.name });
  }

  const first = (filters.page - 1) * CUSTOMERS_PER_PAGE + 1;
  const summary =
    total === 0
      ? null
      : `${total.toLocaleString("en-NG")} ${total === 1 ? "account" : "accounts"}${
          total > rows.length ? `, showing ${first.toLocaleString("en-NG")}–${(first + rows.length - 1).toLocaleString("en-NG")}` : ""
        }`;

  return (
    <AdminShell
      heading="Customers"
      current="/admin/customers"
      meta={summary ? `${summary}, newest first.` : "Newest first."}
    >
      <form
        method="get"
        action="/admin/customers"
        role="search"
        className="mb-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
      >
        <label htmlFor="customers-q" className="sr-only">Email or name</label>
        <input
          id="customers-q"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={100}
          placeholder="Email or name"
          className={inputClass}
        />
        <label htmlFor="customers-state" className="sr-only">State</label>
        <select id="customers-state" name="state" defaultValue={filters.state ?? ""} className={inputClass}>
          <option value="">Any state</option>
          {CUSTOMER_STATES.map((state) => (
            <option key={state} value={state}>{CUSTOMER_STATE_LABELS[state]}</option>
          ))}
        </select>
        <label htmlFor="customers-plan" className="sr-only">Plan</label>
        <select id="customers-plan" name="plan" defaultValue={filters.plan ?? ""} className={inputClass}>
          <option value="">Any plan</option>
          {tiers.map((tier) => (
            <option key={tier.key} value={tier.key}>{tier.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button type="submit" className={secondaryButtonClass}>Filter</button>
          {filtered ? (
            <Link href="/admin/customers" className="px-1 text-sm text-[var(--paper-soft)]">Clear</Link>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-6 py-12 text-center text-sm text-[var(--paper-soft)]">
          {filtered ? (
            <>
              No accounts match.{" "}
              <Link href="/admin/customers" className="underline underline-offset-4">Show everyone</Link>
            </>
          ) : (
            "No accounts yet."
          )}
        </div>
      ) : (
        <>
          {/* Phones get a list: six columns do not fit, and status is the one that matters. */}
          <ul className="divide-y divide-[var(--paper-rule)] overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-white md:hidden">
            {rows.map((customer) => (
              <li key={customer.id} className="relative px-4 py-3 transition-colors duration-150 hover:bg-[var(--paper-raised)]">
                <div className="flex items-start justify-between gap-3">
                  <AccountCell customer={customer} />
                  <SubscriptionStatus
                    status={customer.status}
                    cancelAtPeriodEnd={customer.cancelAtPeriodEnd}
                    suspended={customer.suspended}
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--paper-soft)]">
                  <PlanName customer={customer} /> · {customer.codes} {customer.codes === 1 ? "code" : "codes"}
                  {customer.currentPeriodEnd ? ` · renews ${day(customer.currentPeriodEnd)}` : ""}
                </p>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white md:block">
            <table className={tableClass}>
              <thead className="border-b border-[var(--paper-rule)]">
                <tr>
                  <th scope="col" className={thClass}>Account</th>
                  <th scope="col" className={thClass}>Plan</th>
                  <th scope="col" className={thClass}>Status</th>
                  <th scope="col" className={thClass}>Renews</th>
                  <th scope="col" className={`${thClass} text-right`}>Codes</th>
                  <th scope="col" className={thClass}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.id} className="dash-row relative border-b border-[var(--paper-rule)] last:border-b-0">
                    <td className={tdClass}>
                      <AccountCell customer={customer} />
                    </td>
                    <td className={tdClass}>
                      <PlanName customer={customer} />
                    </td>
                    <td className={tdClass}>
                      <SubscriptionStatus
                        status={customer.status}
                        cancelAtPeriodEnd={customer.cancelAtPeriodEnd}
                        suspended={customer.suspended}
                      />
                    </td>
                    <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(customer.currentPeriodEnd)}</td>
                    <td className={`${tdClass} dash-num text-right`}>{customer.codes}</td>
                    <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(customer.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {filters.page > 1 || hasMore ? (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-between text-sm">
          {filters.page > 1 ? <Link href={listHref(filters, { page: filters.page - 1 })}>Newer</Link> : <span />}
          <span className="text-[var(--paper-soft)]">Page {filters.page}</span>
          {hasMore ? <Link href={listHref(filters, { page: filters.page + 1 })}>Older</Link> : <span />}
        </nav>
      ) : null}
    </AdminShell>
  );
}

/**
 * The account's name and email. Its link covers the whole row (the row is
 * `relative`), so anywhere on a row opens the account.
 */
function AccountCell({ customer }: { customer: CustomerRow }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/admin/customers/${customer.id}`}
        className="block truncate font-medium text-[var(--paper-ink)] no-underline after:absolute after:inset-0 after:content-['']"
      >
        {customer.erased ? "Erased account" : customer.email}
      </Link>
      <span className="block truncate text-xs text-[var(--paper-soft)]">{customer.name}</span>
      {customer.erased ? <Tag>Erased</Tag> : customer.archived ? <Tag>Archived</Tag> : null}
    </div>
  );
}

function PlanName({ customer }: { customer: CustomerRow }) {
  if (!customer.planName) return <span className="text-[var(--paper-soft)]">No plan</span>;
  return (
    <>
      {customer.planName}
      {customer.interval === "annually" ? <span className="text-[var(--paper-soft)]"> annual</span> : null}
    </>
  );
}
