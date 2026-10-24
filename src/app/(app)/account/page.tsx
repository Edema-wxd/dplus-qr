import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { getEntitlement } from "@/lib/plan";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { DashShell } from "../app/DashShell";

export const metadata: Metadata = { title: "Settings" };

// Everything on this page is the signed-in user's own data, and the session
// check must settle before anything renders -- there is no useful static shell
// to stream around. Under Cache Components that makes it a blocking route.
export const instant = false;

/**
 * Account settings.
 *
 * `proxy.ts` redirects signed-out visitors, but the session is checked here
 * too: a proxy matcher protects pages, not data, and this page reads from the
 * database.
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
  const entitlement = await getEntitlement(user.id);

  return (
    <DashShell heading="Settings">
      <div className="max-w-2xl space-y-10">
        <section aria-labelledby="account-heading">
          <h2
            id="account-heading"
            className="border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]"
          >
            Account
          </h2>
          <dl>
            <Row label="Business or contact name" value={profile.name} />
            <Row label="Email" value={profile.email} />
            <Row
              label="Email confirmed"
              value={
                user.emailVerified
                  ? "Yes"
                  : "Not yet — check your inbox for the link"
              }
            />
          </dl>
        </section>

        <section aria-labelledby="plan-heading">
          <h2
            id="plan-heading"
            className="border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]"
          >
            Plan
          </h2>
          <dl>
            <Row label="Plan" value={entitlement?.planName ?? "None yet"} />
            {entitlement ? (
              <>
                <Row
                  label="Codes"
                  value={`${entitlement.codesUsed} of ${entitlement.maxCodes} used`}
                />
                <Row
                  label="Scan history kept"
                  value={`${entitlement.historyDays} days`}
                />
              </>
            ) : null}
          </dl>
          <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-[var(--paper-soft)]">
            Paid plans and billing through Paystack are not open yet. Your codes
            keep working in the meantime, and nothing you create now will be
            deleted when they open.
          </p>
        </section>

        <section aria-labelledby="help-heading">
          <h2
            id="help-heading"
            className="border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]"
          >
            Help
          </h2>
          <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-[var(--paper-soft)]">
            A blocked code, a lost account or anything printed and urgent:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-[var(--paper-ink)] underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </DashShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-[var(--paper-rule)] py-3 last:border-b-0">
      <dt className="text-sm text-[var(--paper-soft)]">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
