import { resolveAccess, type TeamLock } from "@/lib/resolve-scope";
import { teamSeatsLive } from "@/lib/team-invite";
import { switchAccountAction } from "./team/actions";
import { BillingOwnerProvider } from "./BillingOwner";

/**
 * Wraps a dashboard page so its upgrade prompts know whether the person is
 * a team member (who should ask the owner) or the owner (who can buy).
 * The scope is already resolved by the page, so this costs no extra query.
 */
export async function WithBillingOwner({ children }: { children: React.ReactNode }) {
  const access = await resolveAccess().catch(() => null);
  return <BillingOwnerProvider ownerName={access?.team?.ownerName ?? null}>{children}</BillingOwnerProvider>;
}

function lockMessage(lock: TeamLock): string {
  const owner = lock.ownerName;
  switch (lock.reason) {
    case "lapsed":
      return `${owner}'s plan is not active right now, so you are working in your own account. ${owner} manages the team's billing; you will be back in as soon as it is renewed.`;
    case "no-team":
      return `${owner}'s plan no longer includes a team, so you are working in your own account. Ask ${owner} if you still need access.`;
    case "seats":
      return `${owner}'s plan has fewer seats than people in the team, and the seats go to those who joined first. You will be back in when ${owner} frees a seat.`;
    case "unavailable":
      return `${owner}'s account is not available right now, so you are working in your own account.`;
  }
}

/**
 * Shown above every dashboard page when someone chose a team they cannot
 * use right now: why, and a way to stop being told. Their membership is
 * kept, so this disappears by itself when the team is usable again.
 */
export async function TeamLockNotice() {
  if (!teamSeatsLive()) return null;
  const access = await resolveAccess().catch(() => null);
  if (!access?.locked) return null;
  return (
    <div role="status" className="mb-8 rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm leading-relaxed">
      <p>{lockMessage(access.locked)}</p>
      <form action={switchAccountAction} className="mt-2">
        <input type="hidden" name="accountId" value={access.scope.actorId} />
        <button type="submit" className="text-sm underline underline-offset-4">
          Stay in my own account and stop showing this
        </button>
      </form>
    </div>
  );
}

/** In place of controls a viewer cannot use. */
export function ReadOnlyNote({ ownerName, className = "" }: { ownerName: string | null; className?: string }) {
  return (
    <p className={`rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-4 py-3 text-sm leading-relaxed text-[var(--paper-soft)] ${className}`}>
      You can view this account but not change it. Ask {ownerName ?? "the account owner"} if something needs
      changing.
    </p>
  );
}

/**
 * On `/billing`, which is always the person's own account: a member working
 * in a team is told the team's plan is not theirs to change, so they do not
 * buy a plan for their own account thinking it upgrades the team.
 */
export async function MemberBillingNote() {
  const access = await resolveAccess().catch(() => null);
  if (!access?.team) return null;
  const owner = access.team.ownerName;
  return (
    <p role="status" className="mb-8 rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm leading-relaxed">
      You are working in {owner}&apos;s team. {owner} manages its plan and billing. This page is for
      your own account&apos;s plan, which is separate.
    </p>
  );
}
