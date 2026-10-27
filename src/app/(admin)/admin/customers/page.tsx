import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { listCustomers } from "@/lib/admin-billing";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { audit, requireStaff } from "../guard";
import { AdminShell, Tag, day, tableClass, tdClass, thClass } from "../AdminShell";
import { SubscriptionStatus } from "./SubscriptionStatus";

export const metadata: Metadata = { title: "Customers · Admin" };
export const instant = false;

const searchSchema = z.string().trim().max(100).catch("");

export default async function AdminCustomers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const params = await searchParams;
  const q = searchSchema.parse(Array.isArray(params.q) ? params.q[0] : params.q ?? "");
  const includeArchived = params.archived === "1";

  // A search is a look at personal data, so the term goes in the audit too.
  audit(staff, {
    action: q ? "search" : "view",
    targetType: "page",
    targetId: "/admin/customers",
    detail: q ? { q } : {},
  });

  const customers = await listCustomers(q, includeArchived);

  return (
    <AdminShell
      heading="Customers"
      current="/admin/customers"
      meta={`${q ? `Matching “${q}”, newest` : "Newest"} first, up to 50${includeArchived ? ", archived and erased included" : ""}.`}
    >
      <form method="get" action="/admin/customers" role="search" className="mb-5 flex max-w-xl gap-2">
        <label htmlFor="customers-q" className="sr-only">
          Email or name
        </label>
        <input
          id="customers-q"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          placeholder="Email or name"
          className={inputClass}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-[var(--paper-soft)]">
          <input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} />
          Archived too
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <p className="text-sm text-[var(--paper-soft)]">No accounts match.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
          <table className={`${tableClass} min-w-[52rem]`}>
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
              {customers.map((customer) => (
                <tr key={customer.id} className="dash-row border-b border-[var(--paper-rule)] last:border-b-0">
                  <td className={tdClass}>
                    <Link href={`/admin/customers/${customer.id}`} className="block no-underline">
                      <span className="block font-medium text-[var(--paper-ink)]">
                        {customer.erased ? "Erased account" : customer.email}
                      </span>
                      <span className="block text-xs text-[var(--paper-soft)]">{customer.name}</span>
                      {customer.erased ? <Tag>Erased</Tag> : customer.archived ? <Tag>Archived</Tag> : null}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    {customer.planName ?? "—"}
                    {customer.interval === "annually" ? (
                      <span className="text-[var(--paper-soft)]"> annual</span>
                    ) : null}
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
      )}
    </AdminShell>
  );
}
