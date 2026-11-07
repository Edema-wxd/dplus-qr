import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { canBulkCreate, canUseCustomCodes, getEntitlement } from "@/lib/entitlement";
import { listPublicPlans } from "@/lib/plans";
import { codesOffer, featureOffer } from "@/lib/upgrade-offers";
import { listLogos } from "@/lib/logos";
import { uploadsEnabled } from "@/lib/uploads";
import { listBatches } from "@/lib/bulk-create";
import { BULK_MAX_ROWS } from "@/lib/bulk-import";
import { secondaryButtonClass } from "@/components/controls";
import { DashShell } from "../../DashShell";
import { LockIcon, LockedButton } from "../../UpgradePrompt";
import { BulkForm } from "./BulkForm";

export const metadata: Metadata = { title: "Make many codes" };

// The account's own plan, slots and logos decide everything on this page.
export const instant = false;

/**
 * Bulk creation: a spreadsheet of names and destinations in, a batch of
 * dynamic codes out.
 *
 * On a plan without bulk creation the page explains what it would do and
 * where to get it, rather than a form that would be refused (the actions
 * refuse anyway). At the code limit it says so, with the codes offer.
 */
export default async function BulkPage() {
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  await ensureProfile({ id: user.id, email: user.email, name: user.name });

  const [entitlement, plans, library, batches] = await Promise.all([
    getEntitlement(user.id),
    listPublicPlans(),
    listLogos(user.id),
    listBatches(user.id, 5),
  ]);

  const back = { href: "/app/new", label: "All code types" };
  const heading = "Make many codes";
  const meta = entitlement ? (
    <span className="dash-num">
      {entitlement.planName} plan · {entitlement.codesUsed} of {entitlement.maxCodes} dynamic codes used
    </span>
  ) : null;

  if (!canBulkCreate(entitlement)) {
    const offer = featureOffer("bulk_creation", entitlement, plans);
    return (
      <DashShell heading={heading} meta={meta} back={back}>
        <div className="max-w-2xl rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-6">
          <p className="text-[15px] leading-relaxed">{offer.benefit}</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--paper-soft)]">
            {offer.why}
            {offer.unlock ? ` It comes with ${offer.unlock.name}.` : ""}
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

  const free = Math.max(0, entitlement!.maxCodes - entitlement!.codesUsed);
  if (free === 0) {
    const offer = codesOffer(entitlement, plans);
    return (
      <DashShell heading={heading} meta={meta} back={back}>
        <div className="max-w-2xl rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-6">
          <p className="text-[15px] leading-relaxed">{offer.why}</p>
          <div className="mt-5">
            <LockedButton offer={offer} className={`${secondaryButtonClass} gap-1.5 border-dashed`}>
              <LockIcon />
              More dynamic codes
            </LockedButton>
          </div>
        </div>
      </DashShell>
    );
  }

  return (
    <DashShell heading={heading} meta={meta} back={back}>
      <p className="mb-8 max-w-[62ch] text-sm leading-relaxed text-[var(--paper-soft)]">
        One row per code: a name for you, and where it points. Up to {BULK_MAX_ROWS} rows at a
        time, and you have {free.toLocaleString("en-NG")} dynamic{" "}
        {free === 1 ? "code" : "codes"} left on your plan. Every link is checked exactly as a
        single code&apos;s is, and nothing is made until you confirm.
      </p>

      <BulkForm
        free={free}
        customLinks={canUseCustomCodes(entitlement)}
        logos={library.map(({ id, url, name }) => ({ id, url, name }))}
        uploads={uploadsEnabled()}
        codesOffer={codesOffer(entitlement, plans)}
      />

      {batches.length > 0 ? (
        <section aria-labelledby="batches-heading" className="mt-14 max-w-2xl">
          <h2 id="batches-heading" className="font-sarlotte text-2xl leading-none">
            Recent batches
          </h2>
          <ul className="mt-4">
            {batches.map((batch) => (
              <li key={batch.id} className="border-b border-[var(--paper-rule)] py-3 text-sm">
                <Link href={`/app/imports/${batch.id}`} className="underline underline-offset-4">
                  {batch.createdAt.toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Link>
                <span className="dash-num ml-3 text-[var(--paper-soft)]">
                  {batch.rowsCreated.toLocaleString("en-NG")} of {batch.rowsTotal.toLocaleString("en-NG")}{" "}
                  rows made
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </DashShell>
  );
}
