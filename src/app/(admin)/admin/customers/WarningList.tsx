import Link from "next/link";
import { CODE_HOST } from "@/lib/brand";
import { formatRespondBy, LEVEL_LABELS, type Warning } from "@/lib/warnings";
import { Tag, day } from "../AdminShell";
import { WarningActions } from "./WarnForm";

const RESOLUTION_LABELS: Record<NonNullable<Warning["resolution"]>, string> = {
  suspended: "Led to suspension",
  complied: "Put right",
  withdrawn: "Withdrawn",
};

/** An account's warnings, newest first, each with its state and what staff can still do. */
export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return <p className="mt-4 text-sm text-[var(--paper-soft)]">No warnings sent.</p>;
  }
  return (
    <ul className="mt-4 space-y-3">
      {warnings.map((warning) => (
        <li key={warning.id} className="rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--paper-soft)]">
            <Tag tone={warning.level === "final" ? "struck" : "soft"}>{LEVEL_LABELS[warning.level]}</Tag>
            <span className="dash-num">{day(warning.createdAt)}</span>
            <span>by {warning.issuedBy ?? "a removed staff account"}</span>
            {warning.shortCode && warning.qrId ? (
              <Link href={`/admin/codes/${warning.qrId}`} className="font-mono">
                {CODE_HOST}/{warning.shortCode}
              </Link>
            ) : null}
            <span>{warning.emailedAt ? "emailed" : "not emailed"}</span>
            <span>{warning.acknowledgedAt ? `read ${day(warning.acknowledgedAt)}` : "not yet read"}</span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap">{warning.message}</p>
          {warning.respondBy ? (
            <p className={`mt-1.5 text-xs ${warning.due ? "font-medium text-[var(--struck-ink)]" : "text-[var(--paper-soft)]"}`}>
              {warning.due ? "Due since " : "Due "}
              {formatRespondBy(warning.respondBy)}
            </p>
          ) : null}
          <div className="mt-3">
            {warning.resolution ? (
              <p className="text-xs text-[var(--paper-soft)]">
                {RESOLUTION_LABELS[warning.resolution]} on {day(warning.resolvedAt)} by{" "}
                {warning.resolvedBy ?? "a removed staff account"}
              </p>
            ) : (
              <WarningActions warningId={warning.id} final={warning.level === "final"} due={warning.due} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
