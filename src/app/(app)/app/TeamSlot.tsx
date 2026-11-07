import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { resolveScope } from "@/lib/resolve-scope";
import { teamSeatsLive } from "@/lib/team-invite";
import { accountChoices } from "@/lib/team";
import { switchAccountAction } from "./team/actions";
import { TeamGroup } from "./DashNav";

/**
 * The sidebar's account switcher and Team link. Nothing until team seats
 * launch; then the Team link for everyone, and the switcher for anyone who
 * belongs to more than their own account. Streamed behind Suspense like the
 * plan meter, and a failure renders nothing: the dashboard works without it.
 */
export async function TeamSlot() {
  await connection();
  if (!teamSeatsLive()) return null;
  const accounts = await readAccounts();
  if (!accounts) return null;
  return <TeamGroup choices={accounts.choices} current={accounts.current} action={switchAccountAction} />;
}

async function readAccounts() {
  try {
    const { data: session } = await auth.getSession();
    if (!session?.user) return null;
    const [choices, scope] = await Promise.all([accountChoices(session.user.id), resolveScope()]);
    return scope ? { choices, current: scope.accountId } : null;
  } catch (error) {
    console.error("[dash] could not read team accounts", error);
    return null;
  }
}
