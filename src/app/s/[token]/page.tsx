import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CODE_HOST, PRODUCT_NAME } from "@/lib/brand";
import {
  canSeeInsights,
  canShareStats,
  chartDaysAllowed,
  getEntitlement,
} from "@/lib/entitlement";
import { loadSharedCode } from "@/lib/stat-shares";
import { ANALYTICS_WINDOWS, codeAnalytics } from "@/lib/user-codes";
import { LegalLinks } from "@/components/LegalLinks";
import { AnalyticsPanel } from "@/app/(app)/app/[id]/Analytics";

// A customer's numbers, shared with someone they chose: never for a search
// engine, and never from a cache.
export const metadata: Metadata = {
  title: "Scan stats",
  robots: { index: false, follow: false },
};

// Wholly per-request: the link can be turned off at any moment.
export const instant = false;

/**
 * A code's scan statistics, read-only, for whoever holds the link.
 *
 * Shown only while all of these hold, checked on every view:
 *   - the link is live (not turned off or replaced);
 *   - moderation has not taken the code or its owner down (`loadSharedCode`);
 *   - the owner's plan still includes share links.
 * Anything else is the ordinary not-found page, which says nothing about
 * whether the link ever existed.
 *
 * The visitor is not the customer, so there is no plan talk: only the windows
 * the owner's plan covers are offered, and nothing is locked or for sale. The
 * code's destination is never shown.
 */
export default async function SharedStatsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await connection();
  const { token } = await params;

  const shared = await loadSharedCode(token);
  if (!shared) notFound();

  const entitlement = await getEntitlement(shared.userId);
  if (!canShareStats(entitlement).ok) notFound();

  const insights = canSeeInsights(entitlement);
  const historyDays = chartDaysAllowed(entitlement);
  const windows = await Promise.all(
    ANALYTICS_WINDOWS.filter((days) => days <= historyDays).map(async (days) => ({
      days,
      data: await codeAnalytics(shared.userId, shared.codeId, days, { detail: insights }),
    }))
  );
  if (windows.length === 0) notFound();

  return (
    <div className="dash min-h-dvh">
      <main className="mx-auto w-full max-w-5xl px-5 py-9 sm:px-8 sm:py-12">
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">
          Scan statistics shared by {shared.ownerName}
        </p>
        <h1 className="mt-2 font-sarlotte text-[2.1rem] leading-none tracking-[-0.015em] sm:text-[2.5rem]">
          {shared.name}
        </h1>
        <p className="dash-num mt-2 font-mono text-sm text-[var(--paper-soft)]">
          {CODE_HOST}/{shared.shortCode}
        </p>

        <div className="mt-10">
          <AnalyticsPanel
            windows={windows}
            insights={insights}
            historyDays={historyDays}
            createdAt={shared.createdAt.toISOString()}
            audience="public"
          />
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--paper-rule)] pt-5">
          <Link href="/" aria-label={PRODUCT_NAME}>
            <Image src="/brand/qriate-wordmark.svg" alt={PRODUCT_NAME} width={84} height={35} className="h-auto w-[84px]" />
          </Link>
          <LegalLinks tone="paper" />
        </footer>
      </main>
    </div>
  );
}
