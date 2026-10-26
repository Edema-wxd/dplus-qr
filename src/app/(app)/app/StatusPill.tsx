import type { OwnedCode } from "@/lib/user-codes-shape";

const TONE: Record<OwnedCode["status"], { label: string; className: string }> = {
  active: {
    label: "Live",
    className: "border-[var(--live-ink)] text-[var(--live-ink)]",
  },
  paused: {
    label: "Paused",
    className: "border-[var(--pending-ink)] text-[var(--pending-ink)]",
  },
  blocked: {
    label: "Blocked",
    className: "border-[var(--struck-ink)] text-[var(--struck-ink)]",
  },
};

/**
 * State as colour doing a real job. The label is always present: colour alone
 * would leave the status unreadable to anyone who cannot distinguish these
 * three hues, and this is the one column a scan of the table depends on.
 */
export function StatusPill({ status }: { status: OwnedCode["status"] }) {
  const tone = TONE[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone.className}`}
    >
      {tone.label}
    </span>
  );
}
