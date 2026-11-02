import Link from "next/link";
import { connection } from "next/server";
import { usageNudge } from "@/lib/plan-tiers";
import { readEntitlement } from "./plan-read";

/**
 * The plan meter at the foot of the sidebar: which plan, how many of its codes
 * are held, and a word when that needs acting on.
 *
 * Its own async component, streamed into the sidebar behind Suspense, so no
 * page has to fetch the entitlement for the shell's sake and a slow read
 * never holds up the page around it. Any failure renders nothing: this is a
 * convenience, and the billing page is one click away either way.
 */
export async function PlanUsage() {
  await connection();
  const entitlement = await readEntitlement();
  if (entitlement === undefined) return null;
  if (entitlement === null) return <Meter label="No active plan" nudge="inactive" />;

  const share = entitlement.maxCodes > 0 ? entitlement.codesUsed / entitlement.maxCodes : 1;
  return (
    <Meter
      label={`${entitlement.planName} plan`}
      detail={`${entitlement.codesUsed.toLocaleString("en-NG")} of ${entitlement.maxCodes.toLocaleString("en-NG")} codes`}
      share={Math.min(1, share)}
      nudge={usageNudge(entitlement)}
    />
  );
}

function Meter({
  label,
  detail,
  share,
  nudge,
}: {
  label: string;
  detail?: string;
  share?: number;
  nudge: "inactive" | "upgrade" | "none";
}) {
  const cta = { inactive: "Choose a plan", upgrade: "Upgrade", none: "Manage plan" }[nudge];
  return (
    <Link
      href="/billing"
      className="mx-3 mb-3 block rounded-md border border-[var(--field-rule)] px-3 py-3 text-sm no-underline transition-colors duration-150 hover:border-[var(--field-soft)]"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[var(--field-ink)]">{label}</span>
        <span
          className={`shrink-0 text-xs ${
            nudge === "inactive"
              ? "text-[var(--struck-ink)]"
              : nudge === "upgrade"
                ? "text-[var(--field-ink)] underline underline-offset-4"
                : "text-[var(--field-soft)]"
          }`}
        >
          {cta}
        </span>
      </span>
      {share !== undefined ? (
        <>
          <span
            aria-hidden
            className="mt-2.5 block h-1 overflow-hidden rounded-full bg-[var(--field-rule)]"
          >
            <span
              className="block h-full rounded-full bg-[var(--field-ink)]"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </span>
          <span className="dash-num mt-1.5 block text-xs text-[var(--field-soft)]">{detail}</span>
        </>
      ) : (
        <span className="mt-1 block text-xs text-[var(--field-soft)]">
          Your codes are showing a paused page.
        </span>
      )}
    </Link>
  );
}
