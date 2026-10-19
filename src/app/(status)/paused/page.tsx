import { Suspense } from "react";
import type { Metadata } from "next";
import { StatusShell, CodeFooter, DetailFallback } from "../StatusShell";
import { lookupDestination } from "@/lib/codes";
import { isValidCodeFormat } from "@/lib/short-code";

export const metadata: Metadata = { title: "This code is paused" };

type Props = { searchParams: Promise<{ code?: string }> };

export default function PausedPage({ searchParams }: Props) {
  return (
    <StatusShell
      accent="yellow"
      heading="This code is paused"
      detail={
        <Suspense fallback={<DetailFallback />}>
          <PausedDetail searchParams={searchParams} />
        </Suspense>
      }
    >
      <p>
        Nothing is wrong with the code you scanned. It will start working again
        once the owner restores it, so it is worth trying later.
      </p>
    </StatusShell>
  );
}

/**
 * Naming the business reassures the scanner that the code itself is genuine.
 * Streamed, so an unreachable database delays this line rather than the page.
 */
async function PausedDetail({ searchParams }: Props) {
  const { code } = await searchParams;

  let ownerName: string | null = null;
  if (code && isValidCodeFormat(code)) {
    try {
      const { destination } = await lookupDestination(code);
      ownerName = destination?.ownerName ?? null;
    } catch (error) {
      console.error("[paused] owner lookup failed", error);
    }
  }

  return (
    <div className="space-y-6">
      {ownerName ? (
        <p className="text-muted-foreground leading-relaxed">
          The link behind this code belongs to {ownerName}, and it is temporarily
          unavailable.
        </p>
      ) : null}
      <CodeFooter code={code} />
    </div>
  );
}
