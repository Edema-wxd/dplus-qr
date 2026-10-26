const TONE: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "border-[var(--live-ink)] text-[var(--live-ink)]" },
  past_due: { label: "Overdue", className: "border-[var(--pending-ink)] text-[var(--pending-ink)]" },
  cancelled: { label: "Cancelled", className: "border-[var(--paper-rule)] text-[var(--paper-soft)]" },
  incomplete: { label: "Incomplete", className: "border-[var(--paper-rule)] text-[var(--paper-soft)]" },
};

/**
 * A subscription's state, labelled in words as the dashboard's status pill
 * is, so colour is never the only signal. A platform suspension outranks the
 * plan: a suspended account serves nothing whatever it has paid for.
 */
export function SubscriptionStatus({
  status,
  cancelAtPeriodEnd = false,
  suspended = false,
}: {
  status: string | null;
  cancelAtPeriodEnd?: boolean;
  suspended?: boolean;
}) {
  const tone = suspended
    ? { label: "Suspended", className: "border-[var(--struck-ink)] text-[var(--struck-ink)]" }
    : status
      ? (TONE[status] ?? { label: status, className: "border-[var(--paper-rule)] text-[var(--paper-soft)]" })
      : { label: "No plan", className: "border-[var(--paper-rule)] text-[var(--paper-soft)]" };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone.className}`}>
        {tone.label}
      </span>
      {cancelAtPeriodEnd && !suspended ? (
        <span className="text-xs text-[var(--paper-soft)]">not renewing</span>
      ) : null}
    </span>
  );
}
