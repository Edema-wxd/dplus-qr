"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/server";
import { resolveScope } from "@/lib/resolve-scope";
import { allowInvite } from "@/lib/ratelimit";
import { flash } from "@/lib/flash";
import { INVITE_ROLES, inviteSchema, teamSeatsLive } from "@/lib/team-invite";
import { changeRole, createInvite, leaveTeam, removeMember, revokeInvite, switchAccount } from "@/lib/team";

/**
 * The team page's actions. Each re-reads the session (`resolveScope`): a
 * Server Action is an endpoint anyone can post to, and who may manage the
 * team is decided from the session and the database, never the form.
 */

export type TeamState = { error?: string; sent?: string; saved?: boolean };

const userIdSchema = z.string().uuid("That person could not be found.");
const inviteIdSchema = z.string().regex(/^[1-9]\d{0,18}$/, "That invite could not be found.");

async function scopeOrSignIn() {
  const scope = await resolveScope();
  if (!scope) redirect("/auth/sign-in");
  return scope;
}

export async function inviteAction(_previous: TeamState, formData: FormData): Promise<TeamState> {
  const scope = await scopeOrSignIn();
  if (!teamSeatsLive()) return { error: "Teams are not available yet." };

  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  // Before the quota: a viewer or editor must not spend the owner's daily
  // invitations on attempts createInvite would refuse anyway (audit L1).
  if (scope.role !== "owner") return { error: "Only the account owner can invite people." };

  if (!(await allowInvite(scope.accountId))) {
    return { error: "That is a lot of invitations for one day. Please try again tomorrow." };
  }

  let result;
  try {
    result = await createInvite(scope, parsed.data);
  } catch (error) {
    console.error("[team] invite failed", error);
    return { error: "We could not send that invitation. Please try again." };
  }
  if (!result.ok) return { error: result.reason };

  revalidatePath("/app/team");
  return { sent: result.email };
}

export async function revokeInviteAction(_previous: TeamState, formData: FormData): Promise<TeamState> {
  const scope = await scopeOrSignIn();
  const id = inviteIdSchema.safeParse(formData.get("inviteId"));
  if (!id.success) return { error: id.error.issues[0]?.message };
  const result = await revokeInvite(scope, id.data);
  if (!result.ok) return { error: result.reason };
  revalidatePath("/app/team");
  return { saved: true };
}

export async function changeRoleAction(_previous: TeamState, formData: FormData): Promise<TeamState> {
  const scope = await scopeOrSignIn();
  const parsed = z
    .object({ memberId: userIdSchema, role: z.enum(INVITE_ROLES, { message: "Choose editor or viewer." }) })
    .safeParse({ memberId: formData.get("memberId"), role: formData.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const result = await changeRole(scope, parsed.data.memberId, parsed.data.role);
  if (!result.ok) return { error: result.reason };
  revalidatePath("/app/team");
  return { saved: true };
}

export async function removeMemberAction(_previous: TeamState, formData: FormData): Promise<TeamState> {
  const scope = await scopeOrSignIn();
  const id = userIdSchema.safeParse(formData.get("memberId"));
  if (!id.success) return { error: id.error.issues[0]?.message };
  const result = await removeMember(scope, id.data);
  if (!result.ok) return { error: result.reason };
  revalidatePath("/app/team");
  return { saved: true };
}

/** Leave the team the dashboard is showing. Lands back on your own codes. */
export async function leaveTeamAction(_previous: TeamState, _formData: FormData): Promise<TeamState> {
  const scope = await scopeOrSignIn();
  if (scope.role === "owner") return { error: "This is your own account; there is no team to leave." };
  const result = await leaveTeam(scope.actorId, scope.accountId);
  if (!result.ok) return { error: result.reason };
  await flash("team-left");
  redirect("/app");
}

/**
 * Work in another account. The posted id is a request: `switchAccount`
 * writes nothing unless it is the person's own account or a team they are a
 * live member of. Read from the session, not the scope, because switching
 * is about the person, whichever account they are in now.
 */
export async function switchAccountAction(formData: FormData): Promise<void> {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  const target = userIdSchema.safeParse(formData.get("accountId"));
  if (target.success && (target.data === session.user.id || teamSeatsLive())) {
    if (await switchAccount(session.user.id, target.data)) await flash("account-switched");
  }
  redirect("/app");
}
