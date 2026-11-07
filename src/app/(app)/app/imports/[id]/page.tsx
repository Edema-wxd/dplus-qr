import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { CODE_HOST } from "@/lib/brand";
import { canBulkCreate, getEntitlement } from "@/lib/entitlement";
import { getBatch, parseImportId } from "@/lib/bulk-create";
import { listPublicPlans } from "@/lib/plans";
import { featureOffer } from "@/lib/upgrade-offers";
import { dynamicType, isDynamicKind } from "@/lib/qr-types";
import { primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { DashShell } from "../../DashShell";
import { StatusPill } from "../../StatusPill";
import { LockIcon, LockedButton } from "../../UpgradePrompt";

export const metadata: Metadata = { title: "Batch" };
export const instant = false;

/**
 * One batch from bulk creation: what it made, what it left out, and every
 * code's artwork as one zip. The rows that were left out are not stored, so
 * they are counted here, not listed: the owner downloaded them to fix when
 * the batch was checked.
 */
export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;

  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  const id = parseImportId(raw);
  if (!id) notFound();

  const [batch, entitlement] = await Promise.all([getBatch(user.id, id), getEntitlement(user.id)]);
  if (!batch) notFound();

  const zips = canBulkCreate(entitlement);
  const offer = zips ? null : featureOffer("bulk_creation", entitlement, await listPublicPlans());
  const leftOut = batch.rowsInvalid + batch.rowsOverLimit;
  const made = batch.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

  return (
    <DashShell
      heading={`Batch of ${batch.rowsCreated.toLocaleString("en-NG")} ${batch.rowsCreated === 1 ? "code" : "codes"}`}
      meta={
        <span className="dash-num">
          Made {made} from {batch.source === "csv" ? "a CSV file" : "pasted rows"} ·{" "}
          {batch.rowsTotal.toLocaleString("en-NG")} {batch.rowsTotal === 1 ? "row" : "rows"}
        </span>
      }
      back={{ href: "/app", label: "All codes" }}
    >
      {leftOut > 0 ? (
        <p className="mb-6 max-w-[62ch] text-sm leading-relaxed text-[var(--paper-soft)]">
          {batch.rowsInvalid > 0
            ? `${batch.rowsInvalid.toLocaleString("en-NG")} ${batch.rowsInvalid === 1 ? "row had a problem" : "rows had problems"}`
            : null}
          {batch.rowsInvalid > 0 && batch.rowsOverLimit > 0 ? " and " : null}
          {batch.rowsOverLimit > 0
            ? `${batch.rowsOverLimit.toLocaleString("en-NG")} ${batch.rowsOverLimit === 1 ? "row was" : "rows were"} over your plan's limit`
            : null}
          , so {leftOut === 1 ? "it was" : "they were"} left out. Fix them and{" "}
          <Link href="/app/new/bulk" className="underline underline-offset-4">
            make another batch
          </Link>
          .
        </p>
      ) : null}

      <div className="mb-10 flex flex-wrap gap-2">
        {zips ? (
          <>
            <a href={`/app/imports/${batch.id}/zip?format=svg`} download className={`${primaryButtonClass} no-underline`}>
              Download all as SVG (zip)
            </a>
            <a href={`/app/imports/${batch.id}/zip?format=png`} download className={`${secondaryButtonClass} no-underline`}>
              PNG 1024 (zip)
            </a>
          </>
        ) : offer ? (
          <LockedButton offer={offer} className={`${secondaryButtonClass} gap-1.5 border-dashed`}>
            <LockIcon />
            Download all as a zip
          </LockedButton>
        ) : null}
        <a href={`/app/imports/${batch.id}/codes.csv`} download className={`${secondaryButtonClass} no-underline`}>
          List as CSV
        </a>
      </div>

      {batch.codes.length === 0 ? (
        <p className="text-sm text-[var(--paper-soft)]">None of this batch&apos;s codes are on your account any more.</p>
      ) : (
        <ol>
          {batch.codes.map((code) => (
            <li
              key={code.id}
              className="grid gap-x-5 gap-y-1 border-b border-[var(--paper-rule)] py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-center"
            >
              <Link href={`/app/${code.id}`} className="min-w-0 truncate text-sm underline underline-offset-4">
                {code.name}
              </Link>
              <span className="min-w-0 text-xs text-[var(--paper-soft)]">
                <span className="dash-num block truncate font-mono text-[var(--paper-ink)]">
                  {CODE_HOST}/{code.shortCode}
                </span>
                <span className="block truncate font-mono">
                  {isDynamicKind(code.kind) ? `${dynamicType(code.kind).label} · ` : ""}
                  {code.destination}
                </span>
              </span>
              <StatusPill status={code.status as "active" | "paused" | "blocked"} />
            </li>
          ))}
        </ol>
      )}
    </DashShell>
  );
}
