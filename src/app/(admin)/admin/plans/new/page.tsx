import type { Metadata } from "next";
import Link from "next/link";
import { audit, requireStaff } from "../../guard";
import { AdminShell } from "../../AdminShell";
import { PlanForm } from "../PlanForm";

export const metadata: Metadata = { title: "New plan · Admin" };
export const instant = false;

export default async function AdminNewPlan() {
  const staff = await requireStaff();
  audit(staff, { action: "view", targetType: "page", targetId: "/admin/plans/new" });

  return (
    <AdminShell
      heading="New plan"
      current="/admin/plans"
      meta="Saved to the database first. Connect it to Paystack from its page once the price is right."
    >
      <Link href="/admin/plans" className="-mt-4 mb-6 inline-block text-sm text-[var(--paper-soft)] hover:text-[var(--paper-ink)]">
        All plans
      </Link>
      <PlanForm
        plan={{
          slug: "",
          name: "",
          amountNaira: 0,
          interval: "monthly",
          maxCodes: 10,
          historyDays: 90,
          graceDays: 7,
          sortOrder: 100,
          isActive: false,
          features: {},
          paystackPlanCode: null,
        }}
      />
    </AdminShell>
  );
}
