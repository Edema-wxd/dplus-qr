import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { AuthShell } from "../AuthShell";
import { signOutAction } from "../auth/sign-in/actions";

export const metadata: Metadata = { title: "Your account" };

// Everything on this page is the signed-in user's own data, and the session
// check must settle before anything renders -- there is no useful static shell
// to stream around. Under Cache Components that makes it a blocking route.
export const instant = false;

/**
 * Protected page. `proxy.ts` redirects signed-out visitors, but the session is
 * checked here too: a proxy matcher protects pages, not data, and this page
 * reads from the database.
 */
export default async function AccountPage() {
  const { data: session } = await auth.getSession();
  const user = session?.user;

  if (!user) redirect("/auth/sign-in");

  // Idempotent: also repairs a profile whose creation failed during sign-up.
  const profile = await ensureProfile({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return (
    <AuthShell heading="Your account">
      <dl className="space-y-4 text-sm">
        <Row label="Name" value={profile.name} />
        <Row label="Email" value={profile.email} />
        <Row
          label="Email verified"
          value={user.emailVerified ? "Yes" : "Not yet — check your inbox"}
        />
        <Row label="Plan" value={profile.paystackCustomerCode ? "Subscribed" : "No plan yet"} />
        <Row
          label="Profile row"
          value={`qr_users.id = ${profile.id}`}
          mono
        />
      </dl>

      <form action={signOutAction} className="mt-8">
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : ""}>{value}</dd>
    </div>
  );
}
