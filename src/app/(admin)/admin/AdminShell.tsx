import Link from "next/link";
import { attentionCounts } from "@/lib/reports";
import { AdminNav, type AdminBadges, type AdminSection } from "./AdminNav";

/** Nav badges, or none at all if the counts cannot be read: the page still renders. */
async function readBadges(): Promise<AdminBadges> {
  try {
    const counts = await attentionCounts();
    return { reports: counts.openReports, overdue: counts.overdueAccounts };
  } catch (error) {
    console.error("[admin] could not read attention counts", error);
    return { reports: 0, overdue: 0 };
  }
}

/**
 * The staff admin's frame: the dashboard's materials and its sidebar, so
 * staff read the same type and figures customers do, with a Staff label that
 * makes it unmistakable which side of the product this is.
 *
 * Only ever rendered by a page that has already passed `requireStaff`, so the
 * counts it reads are never shown to anyone else.
 */
export async function AdminShell({
  heading,
  current,
  meta,
  back,
  actions,
  children,
}: {
  heading: string;
  current: AdminSection;
  meta?: React.ReactNode;
  /** Where "up" is from a detail page. */
  back?: { href: string; label: string };
  /** The page's primary action, beside the heading. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const badges = await readBadges();

  return (
    <div className="dash min-h-dvh lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
      <AdminNav current={current} badges={badges} />

      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        {back ? (
          <Link
            href={back.href}
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--paper-soft)] no-underline transition-colors duration-150 hover:text-[var(--paper-ink)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {back.label}
          </Link>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="break-words font-sarlotte text-[2rem] leading-none tracking-[-0.015em] sm:text-[2.4rem]">
              {heading}
            </h1>
            {meta ? <div className="mt-2 text-sm text-[var(--paper-soft)]">{meta}</div> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * A headline figure. With `href` the whole tile is a link, to the list the
 * figure counts, so a number on the overview is always one click from the
 * accounts behind it.
 */
export function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  href?: string;
}) {
  return (
    <div className={`relative bg-white px-4 py-3.5 ${href ? "transition-colors duration-150 hover:bg-[var(--paper-raised)]" : ""}`}>
      <dt className="text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">
        {href ? (
          <Link href={href} className="no-underline after:absolute after:inset-0 after:content-['']">
            {label}
          </Link>
        ) : (
          label
        )}
      </dt>
      <dd className="dash-num mt-1 text-2xl leading-none text-[var(--paper-ink)]">{value}</dd>
      {note ? <dd className="mt-1 text-xs text-[var(--paper-soft)]">{note}</dd> : null}
    </div>
  );
}

export function SectionHeading({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]"
    >
      {children}
    </h2>
  );
}

export const tableClass = "w-full border-collapse text-sm";
export const thClass =
  "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-[0.1em] text-[var(--paper-soft)]";
export const tdClass = "px-4 py-2.5 align-top";

/** Dates as staff read them: day, short month, year. */
export function day(date: Date | null): string {
  return date ? date.toLocaleDateString("en-NG", { dateStyle: "medium" }) : "—";
}

/** A small outlined label, for states that sit beside a status pill. */
export function Tag({ children, tone = "soft" }: { children: React.ReactNode; tone?: "soft" | "struck" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        tone === "struck"
          ? "border-[var(--struck-ink)] text-[var(--struck-ink)]"
          : "border-[var(--paper-rule)] text-[var(--paper-soft)]"
      }`}
    >
      {children}
    </span>
  );
}

/** What an audit action is called on screen. Unknown actions show as stored. */
const ACTION_LABELS: Record<string, string> = {
  "code.block": "Blocked",
  "code.unblock": "Unblocked",
  "code.pause": "Paused",
  "code.resume": "Resumed",
  "code.archive": "Archived",
  "code.unarchive": "Unarchived",
  "code.rescreen": "Re-screened",
  "customer.suspend": "Suspended",
  "customer.unsuspend": "Suspension lifted",
  "customer.block_all": "Blocked every code",
  "customer.archive": "Archived",
  "customer.unarchive": "Unarchived",
  "customer.erase": "Erased",
  "customer.remove_sign_in": "Sign-in account removed",
  "subscription.assign": "Plan assigned",
  "report.action": "Report marked handled",
  "report.dismiss": "Report dismissed",
};

/** The history of what staff changed on one code or account. */
export function StaffHistory({
  entries,
}: {
  entries: { action: string; actor: string | null; detail: Record<string, unknown>; createdAt: Date }[];
}) {
  if (entries.length === 0) {
    return <p className="mt-4 text-sm text-[var(--paper-soft)]">No staff changes yet.</p>;
  }
  return (
    <ol className="mt-4 space-y-2.5 text-sm">
      {entries.map((entry, index) => (
        <li key={index} className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="dash-num whitespace-nowrap text-[var(--paper-soft)]">
            {entry.createdAt.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
          </span>
          <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span>
          {typeof entry.detail.reason === "string" ? (
            <span className="text-[var(--paper-soft)]">“{entry.detail.reason}”</span>
          ) : null}
          <span className="text-[var(--paper-soft)]">by {entry.actor || "a removed staff account"}</span>
        </li>
      ))}
    </ol>
  );
}
