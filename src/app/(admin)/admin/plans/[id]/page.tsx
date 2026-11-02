import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPlanById } from "@/lib/plans";
import { planSubscribers } from "@/lib/admin-billing";
import { audit, requireStaff } from "../../guard";
import { AdminShell } from "../../AdminShell";
import { ConnectPaystack, PlanForm } from "../PlanForm";

export const metadata: Metadata = { title: "Edit plan · Admin" };
export const instant = false;

export default async function AdminEditPlan({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const id = z.coerce.number().int().positive().safeParse((await params).id);
  if (!id.success) notFound();

  const [plan, counts] = await Promise.all([getPlanById(id.data), planSubscribers()]);
  if (!plan) notFound();
  audit(staff, { action: "view", targetType: "plan", targetId: plan.slug });

  const onIt = counts.find((row) => row.planId === plan.id);
  const holders = (onIt?.active ?? 0) + (onIt?.pastDue ?? 0);

  return (
    <AdminShell
      heading={plan.name}
      current="/admin/plans"
      back={{ href: "/admin/plans", label: "All plans" }}
      meta={
        <>
          <span className="font-mono">{plan.slug}</span> · {holders} account{holders === 1 ? "" : "s"} on it now
        </>
      }
    >

      {plan.amountKobo > 0 && !plan.paystackPlanCode ? (
        <div className="mb-8 max-w-3xl rounded-lg border border-[var(--pending-ink)]/50 bg-white px-4 py-3">
          <p className="mb-3 text-sm leading-relaxed">
            <strong className="font-medium">Not purchasable yet.</strong> Customers see the price, but checkout
            needs a Paystack plan. Set the price first: connecting fixes it.
          </p>
          <ConnectPaystack planId={plan.id} />
        </div>
      ) : null}

      {holders > 0 ? (
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-[var(--paper-soft)]">
          Limits and features apply to everyone on this plan from their next page load. Lowering the code limit
          never removes a code; it only stops new ones past the limit.
        </p>
      ) : null}

      <PlanForm
        plan={{
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          amountNaira: Math.round(plan.amountKobo / 100),
          interval: plan.interval,
          maxCodes: plan.maxCodes,
          historyDays: plan.historyDays,
          graceDays: plan.graceDays,
          sortOrder: plan.sortOrder,
          isActive: plan.isActive,
          features: plan.features,
          paystackPlanCode: plan.paystackPlanCode,
        }}
      />
    </AdminShell>
  );
}
