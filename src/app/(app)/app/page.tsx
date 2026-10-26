import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { getEntitlement } from "@/lib/entitlement";
import { loadCodeList } from "@/lib/live-codes";
import { DashShell } from "./DashShell";
import { CodesTable } from "./CodesTable";
import { LiveCodes, LiveIndicator } from "./LiveCodes";
import { NewCodeForm } from "./NewCodeForm";
import { VerifyBanner } from "./VerifyBanner";

export const metadata: Metadata = { title: "Your codes" };

// Every byte on this page is the signed-in user's own data, so there is no
// useful static shell to stream around. Under Cache Components that makes it a
// blocking route, the same choice the account page makes.
export const instant = false;

export default async function CodesPage() {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  // Also grants the free plan on first load, so a code created here can
  // actually serve traffic. See ensureFreeSubscription.
  await ensureProfile({ id: user.id, email: user.email, name: user.name });

  const [{ rows, live }, entitlement] = await Promise.all([
    loadCodeList(user.id),
    getEntitlement(user.id),
  ]);

  // From the server read, not the live rows: the limit only moves when this
  // user creates a code, and creating one navigates to its page anyway.
  const atLimit = entitlement !== null && rows.length >= entitlement.maxCodes;

  // The header action appears only when there is a table to sit above. The
  // empty state carries its own copy of this form, and mounting both would put
  // two live disclosures on one page -- two elements sharing the field ids
  // their labels point at, and a validation error landing on whichever of the
  // two was not submitted.
  const hasCodes = rows.length > 0;

  return (
    <LiveCodes rows={rows} live={live} userId={user.id}>
      <DashShell
        heading="Your codes"
        meta={
          entitlement ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="dash-num">
                {entitlement.planName} plan · {rows.length} of{" "}
                {entitlement.maxCodes} codes
              </span>
              <LiveIndicator />
            </span>
          ) : (
            <LiveIndicator />
          )
        }
        action={hasCodes ? <NewCodeForm disabled={atLimit} /> : null}
      >
        {user.emailVerified ? null : <VerifyBanner email={user.email} />}

        <CodesTable empty={<EmptyState />} />

        {atLimit && entitlement ? (
          <p id="code-limit-hint" className="mt-4 text-sm text-[var(--paper-soft)]">
            You are using all {entitlement.maxCodes} codes on the{" "}
            {entitlement.planName} plan. A code you hold keeps its short code for
            good, so pausing one does not free a slot.
          </p>
        ) : null}
      </DashShell>
    </LiveCodes>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-6 py-14 text-center">
      <p className="mx-auto max-w-[42ch] text-[15px] leading-relaxed text-[var(--paper-soft)]">
        No codes yet. Make one, print it, and you can change where it leads for
        as long as the printed thing exists.
      </p>
      <div className="mt-6 flex justify-center">
        <NewCodeForm />
      </div>
    </div>
  );
}
