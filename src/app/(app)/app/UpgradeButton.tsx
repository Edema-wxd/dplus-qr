import Link from "next/link";
import { connection } from "next/server";
import { readEntitlement } from "./plan-read";

/**
 * "Upgrade" in the corner of every dashboard page, for free accounts only.
 *
 * Paid accounts never see it: a customer already paying should not be sold
 * to on every screen, and the plan meter in the sidebar covers changing plan.
 * An account with no usable plan at all gets "Choose a plan", because its
 * codes are showing the paused page and that is the more urgent message.
 *
 * Streamed behind Suspense by `DashShell`, so the read never holds up a page.
 */
export async function UpgradeButton() {
  await connection();
  const entitlement = await readEntitlement();
  if (entitlement === undefined) return null;

  const label =
    entitlement === null || !entitlement.active
      ? "Choose a plan"
      : entitlement.planSlug === "free"
        ? "Upgrade"
        : null;
  if (!label) return null;

  return (
    <Link
      href="/billing"
      className="inline-flex items-center gap-1.5 rounded-md bg-[var(--paper-ink)] px-3 py-1.5 text-sm font-medium text-[var(--paper)] no-underline transition-transform duration-150 active:scale-[0.97]"
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </Link>
  );
}
