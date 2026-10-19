import { Suspense } from "react";
import type { Metadata } from "next";
import { StatusShell, CodeFooter, DetailFallback } from "../StatusShell";

export const metadata: Metadata = { title: "Link disabled" };

type Props = { searchParams: Promise<{ code?: string }> };

export default function BlockedPage({ searchParams }: Props) {
  return (
    <StatusShell
      accent="red"
      heading="This link has been disabled"
      detail={
        <Suspense fallback={<DetailFallback />}>
          <BlockedDetail searchParams={searchParams} />
        </Suspense>
      }
    >
      <p>
        We have switched this link off because it did not meet our acceptable use
        rules. You have not been taken anywhere, and nothing has been installed.
      </p>
      <p>
        If you believe this was a mistake, or you own this code, get in touch and
        we will look at it again.
      </p>
    </StatusShell>
  );
}

async function BlockedDetail({ searchParams }: Props) {
  const { code } = await searchParams;
  return <CodeFooter code={code} />;
}
