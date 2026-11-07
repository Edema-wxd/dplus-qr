import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { resolveScope } from "@/lib/resolve-scope";
import { ensureProfile } from "@/lib/profile";
import { getEntitlement } from "@/lib/entitlement";
import { listPublicPlans } from "@/lib/plans";
import { featureOffer } from "@/lib/upgrade-offers";
import { teamSeatsLive } from "@/lib/team-invite";
import { teamView } from "@/lib/team";
import { secondaryButtonClass } from "@/components/controls";
import { DashShell } from "../DashShell";
import { LockIcon, LockedButton } from "../UpgradePrompt";
import { InviteForm, LeaveTeam, MemberControls, RevokeInvite } from "./TeamForms";

export const metadata: Metadata = { title: "Team" };
export const instant = false;

const day = (date: Date) =>
  date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", editor: "Editor", viewer: "Viewer" };

/** The team log in words. Ids and roles only are stored; names come from the join. */
function describe(event: { action: string; actor: string | null; subject: string | null; detail: Record<string, unknown> }): string {
  const actor = event.actor ?? "Someone";
  const subject = event.subject ?? "a former member";
  const role = typeof event.detail.role === "string" ? ` as ${ROLE[event.detail.role]?.toLowerCase() ?? "member"}` : "";
  switch (event.action) {
    case "invite.create":
      return `${actor} sent an invitation${role}`;
    case "invite.revoke":
      return `${actor} cancelled an invitation`;
    case "invite.unsent":
      return "An invitation could not be sent, so it was not kept";
    case "invite.accept":
      return `${subject} joined${role}`;
    case "member.role":
      return `${actor} made ${subject} ${ROLE[String(event.detail.to)]?.toLowerCase() ?? "a member"}`;
    case "member.remove":
      return `${actor} removed ${subject}`;
    case "member.leave":
      return `${subject} left the team`;
    default:
      return event.action;
  }
}

/**
 * Who works in this account. The owner invites, changes roles, removes and
 * sees the log; a member sees the team and can leave it. Not shown at all
 * until team seats launch (`teamSeatsLive`).
 */
export default async function TeamPage() {
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");
  if (!teamSeatsLive()) notFound();

  await ensureProfile({ id: user.id, email: user.email, name: user.name });
  const scope = await resolveScope();
  if (!scope) redirect("/auth/sign-in");

  const [team, entitlement] = await Promise.all([teamView(scope), getEntitlement(scope.accountId)]);
  if (!team) notFound();

  const owner = scope.role === "owner";
  const hasTeam = team.seats > 1;
  const free = Math.max(0, team.seats - team.seatsUsed);

  if (owner && !hasTeam) {
    const offer = featureOffer("team_seats", entitlement, await listPublicPlans());
    return (
      <DashShell heading="Team">
        <div className="max-w-2xl rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-6">
          <p className="text-[15px] leading-relaxed">{offer.benefit}</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--paper-soft)]">
            {offer.why}
            {offer.unlock ? ` They come with ${offer.unlock.name}.` : ""}
          </p>
          <div className="mt-5">
            <LockedButton offer={offer} className={`${secondaryButtonClass} gap-1.5 border-dashed`}>
              <LockIcon />
              What this adds
            </LockedButton>
          </div>
        </div>
      </DashShell>
    );
  }

  return (
    <DashShell
      heading="Team"
      meta={
        owner ? (
          <span className="dash-num">
            {team.seatsUsed} of {team.seats} seats used, counting you and pending invitations
          </span>
        ) : (
          <span>
            You are {scope.role === "editor" ? "an editor" : "a viewer"} in {team.ownerName}&apos;s account
          </span>
        )
      }
    >
      <div className="max-w-3xl space-y-12">
        {owner ? (
          <section aria-labelledby="invite-heading">
            <h2 id="invite-heading" className="font-sarlotte text-2xl leading-none">
              Invite someone
            </h2>
            <div className="mt-5">
              {free > 0 ? (
                <InviteForm />
              ) : (
                <p className="text-sm leading-relaxed text-[var(--paper-soft)]">
                  Every seat on your plan is taken, counting you and pending invitations. Remove someone
                  or cancel an invitation to invite another person.
                </p>
              )}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="members-heading">
          <h2 id="members-heading" className="font-sarlotte text-2xl leading-none">
            People
          </h2>
          <ul className="mt-4">
            <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--paper-rule)] py-3">
              <span className="text-sm">
                {team.ownerName}
                {owner ? <span className="text-[var(--paper-soft)]"> (you)</span> : null}
              </span>
              <span className="text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">Owner</span>
            </li>
            {team.members.map((member) => (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--paper-rule)] py-3"
              >
                <span className="min-w-0 text-sm">
                  <span className="block truncate">
                    {member.name}
                    {member.userId === scope.actorId ? <span className="text-[var(--paper-soft)]"> (you)</span> : null}
                  </span>
                  {member.email ? (
                    <span className="block truncate text-xs text-[var(--paper-soft)]">
                      {member.email} · joined {day(member.joinedAt)}
                    </span>
                  ) : null}
                </span>
                {owner ? (
                  <MemberControls memberId={member.userId} name={member.name} role={member.role} />
                ) : (
                  <span className="text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">
                    {ROLE[member.role] ?? member.role}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {team.members.length === 0 && owner ? (
            <p className="mt-3 text-sm text-[var(--paper-soft)]">Nobody else yet.</p>
          ) : null}
        </section>

        {owner && team.invites.length > 0 ? (
          <section aria-labelledby="invites-heading">
            <h2 id="invites-heading" className="font-sarlotte text-2xl leading-none">
              Waiting for an answer
            </h2>
            <ul className="mt-4">
              {team.invites.map((invite) => (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--paper-rule)] py-3"
                >
                  <span className="min-w-0 text-sm">
                    <span className="block truncate">{invite.email}</span>
                    <span className="block text-xs text-[var(--paper-soft)]">
                      {ROLE[invite.role]} · expires {day(invite.expiresAt)}
                    </span>
                  </span>
                  <RevokeInvite inviteId={invite.id} email={invite.email} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {owner && team.events.length > 0 ? (
          <section aria-labelledby="log-heading">
            <h2 id="log-heading" className="font-sarlotte text-2xl leading-none">
              Recent changes
            </h2>
            <ol className="mt-4">
              {team.events.map((event, i) => (
                <li key={i} className="grid gap-x-5 border-b border-[var(--paper-rule)] py-2.5 text-sm sm:grid-cols-[8rem_1fr]">
                  <time className="dash-num text-xs text-[var(--paper-soft)]" dateTime={event.at.toISOString()}>
                    {day(event.at)}
                  </time>
                  <span>{describe(event)}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {!owner ? (
          <section aria-labelledby="leave-heading">
            <h2 id="leave-heading" className="sr-only">
              Leave
            </h2>
            <p className="mb-4 max-w-[60ch] text-sm leading-relaxed text-[var(--paper-soft)]">
              {team.ownerName} manages this team and its billing. Your own account, and anything
              in it, is separate and stays yours.
            </p>
            <LeaveTeam ownerName={team.ownerName} />
          </section>
        ) : null}
      </div>
    </DashShell>
  );
}
