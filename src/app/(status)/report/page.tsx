import { Suspense } from "react";
import type { Metadata } from "next";
import { StatusShell } from "../StatusShell";
import { ReportForm } from "./ReportForm";

export const metadata: Metadata = { title: "Report a link" };

type Props = { searchParams: Promise<{ code?: string }> };

export default function ReportPage({ searchParams }: Props) {
  return (
    <StatusShell
      accent="blue"
      heading="Report this link"
      detail={
        <Suspense fallback={<div className="h-64" aria-hidden />}>
          <PrefilledForm searchParams={searchParams} />
        </Suspense>
      }
    >
      <p>
        Tell us what is wrong with where this code led you. Reports go straight to
        the De Sign Plus team, and a code can be switched off within a minute.
      </p>
    </StatusShell>
  );
}

async function PrefilledForm({ searchParams }: Props) {
  const { code } = await searchParams;
  return <ReportForm code={code ?? ""} />;
}
