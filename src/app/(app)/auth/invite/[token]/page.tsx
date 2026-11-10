import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { INVITE_PARAM, isInviteToken, maskEmail, mailSafeName, ROLE_LABEL, type InviteRole } from "@/lib/team-invite";
import { inviteByToken } from "@/lib/team";
import { AuthShell } from "../../../AuthShell";
import { AcceptForm } from "./AcceptForm";

/**
 * Titled only when the token is a real invitation; anything else gets the
 * site's default title, as a page that does not exist does, so a guessed
 * link says nothing about the route.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invite = isInviteToken(token) ? await inviteByToken(token) : null;
  // No title at all otherwise: the site default, as on a page that does not exist.
  return invite
    ? { title: "Join a team", robots: { index: false, follow: false } }
    : { robots: { index: false, follow: false } };
}

// Everything here depends on the token and on who is signed in.
export const instant = false;

const linkClass = "font-medium text-foreground underline underline-offset-4";

/**
 * Where an invitation email lands. Outside the proxy matcher, under the
 * reserved `auth` segment, so someone without an account can open it.
 *
 * A token that matches nothing is the ordinary not-found page, which says
 * nothing about whether it ever existed. The invited address is only ever
 * shown masked, since whoever opens the link may not be the person it was
 * sent to.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!isInviteToken(token)) notFound();

  const invite = await inviteByToken(token);
  if (!invite) notFound();

  const { data: session } = await auth.getSession();
  const user = session?.user ?? null;
  const account = mailSafeName(invite.accountName);
  const role = ROLE_LABEL[invite.role as InviteRole] ?? ROLE_LABEL.viewer;
  const lede = `${account} invited you to work on their QR codes as ${role.article} ${role.name}.`;

  if (invite.state !== "live") {
    const why = {
      expired: "This invitation has expired.",
      used: "This invitation has already been accepted.",
      revoked: "This invitation was cancelled.",
      unavailable: "This team is not available right now.",
    }[invite.state];
    return (
      <AuthShell heading="Join a team" lede={lede}>
        <p className="text-sm leading-relaxed">
          {why} Ask {account} to send you a new one if you still need access.
        </p>
        <p className="mt-6 text-sm">
          <Link href={user ? "/app" : "/auth/sign-in"} className={linkClass}>
            {user ? "Go to your codes" : "Sign in"}
          </Link>
        </p>
      </AuthShell>
    );
  }

  const masked = maskEmail(invite.email);
  const query = `?${INVITE_PARAM}=${token}`;

  if (!user) {
    return (
      <AuthShell heading="Join a team" lede={lede}>
        <p className="text-sm leading-relaxed text-muted-foreground">{role.can}</p>
        <p className="mt-4 text-sm leading-relaxed">
          The invitation is for <span className="font-medium">{masked}</span>. Sign in with that
          address, or create a free account with it, and you will come straight back here.
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link href={`/auth/sign-in${query}`} className={`${linkClass} inline-flex min-h-11 items-center`}>
            Sign in
          </Link>
          <Link href={`/auth/sign-up${query}`} className={`${linkClass} inline-flex min-h-11 items-center`}>
            Create an account
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (user.email.toLowerCase() !== invite.email) {
    return (
      <AuthShell heading="Join a team" lede={lede}>
        <p className="text-sm leading-relaxed">
          You are signed in as <span className="font-medium">{user.email}</span>, but this invitation
          is for <span className="font-medium">{masked}</span>. Sign out, then sign in with that address
          to accept it.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/account" className={linkClass}>
            Your account
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (!user.emailVerified) {
    return (
      <AuthShell heading="Join a team" lede={lede}>
        <p className="text-sm leading-relaxed">
          Verify your email address first: we sent a link to {user.email} when you created your
          account. Then open this invitation again.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell heading="Join a team" lede={lede}>
      <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
        {role.can} Your own account stays yours; you can switch between it and {account}&apos;s from
        the menu.
      </p>
      <AcceptForm token={token} />
    </AuthShell>
  );
}
