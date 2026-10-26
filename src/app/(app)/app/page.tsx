import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { getEntitlement } from "@/lib/entitlement";
import { listCodes } from "@/lib/user-codes";
import { CODE_HOST, codeUrl } from "@/lib/brand";
import { QrSymbol } from "@/app/_landing/QrSymbol";
import { DashShell } from "./DashShell";
import { StatusPill } from "./StatusPill";
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

  const [codes, entitlement] = await Promise.all([
    listCodes(user.id),
    getEntitlement(user.id),
  ]);

  const atLimit = entitlement !== null && codes.length >= entitlement.maxCodes;

  // The header action appears only when there is a table to sit above. The
  // empty state carries its own copy of this form, and mounting both would put
  // two live disclosures on one page -- two elements sharing the field ids
  // their labels point at, and a validation error landing on whichever of the
  // two was not submitted.
  const hasCodes = codes.length > 0;

  return (
    <DashShell
      heading="Your codes"
      meta={
        entitlement ? (
          <span className="dash-num">
            {entitlement.planName} plan · {codes.length} of{" "}
            {entitlement.maxCodes} codes
          </span>
        ) : null
      }
      action={hasCodes ? <NewCodeForm disabled={atLimit} /> : null}
    >
      {user.emailVerified ? null : <VerifyBanner email={user.email} />}

      {codes.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              Your QR codes, newest first, with scans today, over seven days and
              over thirty days.
            </caption>
            <thead>
              <tr className="border-b border-[var(--paper-rule)] text-left text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">
                <th scope="col" className="px-4 py-3 font-medium">
                  Code
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Points to
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Today
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  7 days
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  30 days
                </th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr
                  key={code.id}
                  className="dash-row border-b border-[var(--paper-rule)] last:border-b-0"
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link
                      href={`/app/${code.id}`}
                      className="flex items-center gap-3 no-underline"
                    >
                      {/*
                        The signature move: the real symbol, generated from this
                        code's own short code, at every scale the product shows.
                        Not an icon standing in for a code.
                      */}
                      <QrSymbol
                        value={codeUrl(code.shortCode)}
                        px={44}
                        title={`QR code for ${code.name}`}
                        className="block h-auto w-11 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[var(--paper-ink)]">
                          {code.name}
                        </span>
                        <span className="dash-num block truncate font-mono text-xs text-[var(--paper-soft)]">
                          {CODE_HOST}/{code.shortCode}
                        </span>
                      </span>
                    </Link>
                  </th>
                  <td className="max-w-[18rem] px-4 py-3">
                    <span className="block truncate font-mono text-xs text-[var(--paper-soft)]">
                      {code.destinationUrl}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={code.status} />
                  </td>
                  <Figure value={code.scansToday} />
                  <Figure value={code.scans7d} />
                  <Figure value={code.scans30d} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {atLimit && entitlement ? (
        <p id="code-limit-hint" className="mt-4 text-sm text-[var(--paper-soft)]">
          You are using all {entitlement.maxCodes} codes on the{" "}
          {entitlement.planName} plan. A code you hold keeps its short code for
          good, so pausing one does not free a slot.
        </p>
      ) : null}
    </DashShell>
  );
}

/** Right-aligned and tabular, so the three columns compare down the page. */
function Figure({ value }: { value: number }) {
  return (
    <td
      className={`dash-num px-4 py-3 text-right ${
        value === 0 ? "text-[var(--paper-soft)]" : "text-[var(--paper-ink)]"
      }`}
    >
      {value.toLocaleString("en-NG")}
    </td>
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
