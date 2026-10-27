import Link from "next/link";
import Image from "next/image";
import { PRODUCT_NAME } from "@/lib/brand";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/codes", label: "Codes" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/monitor", label: "Monitor" },
] as const;

/**
 * The staff admin's frame: the dashboard's materials, ink bar over paper, so
 * staff read the same type and figures customers do, with a label that makes
 * it unmistakable which side of the product this is.
 */
export function AdminShell({
  heading,
  current,
  meta,
  children,
}: {
  heading: string;
  current: (typeof NAV)[number]["href"];
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dash min-h-dvh">
      <header className="bg-[var(--field)] text-[var(--field-ink)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Link href="/admin" aria-label={`${PRODUCT_NAME} admin`}>
              <Image
                src="/brand/qriate-wordmark-light.svg"
                alt={PRODUCT_NAME}
                width={104}
                height={43}
                className="h-auto w-[84px]"
              />
            </Link>
            <span className="rounded border border-[var(--field-rule)] px-1.5 py-0.5 text-[11px] uppercase tracking-[0.14em] text-[var(--field-soft)]">
              Staff
            </span>
          </div>
          <nav aria-label="Admin" className="flex items-center gap-0.5 text-sm">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === current ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 no-underline transition-colors duration-150 ${
                  item.href === current
                    ? "bg-white/10 text-[var(--field-ink)]"
                    : "text-[var(--field-soft)] hover:bg-white/5 hover:text-[var(--field-ink)]"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/app"
              className="ml-2 rounded-md px-2.5 py-1.5 text-[var(--field-soft)] no-underline hover:text-[var(--field-ink)]"
            >
              Back to app
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        <h1 className="font-sarlotte text-[2.1rem] leading-none tracking-[-0.015em] sm:text-[2.5rem]">
          {heading}
        </h1>
        {meta ? <div className="mt-2 text-sm text-[var(--paper-soft)]">{meta}</div> : null}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

/** A headline figure. */
export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-white px-4 py-3.5">
      <dt className="text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">{label}</dt>
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
  "customer.warn": "Warning sent",
  "warning.complied": "Warning closed, put right",
  "warning.withdrawn": "Warning withdrawn",
  "report.actioned": "Report actioned",
  "report.dismissed": "Report dismissed",
};

const LEVEL_WORDS: Record<string, string> = { notice: "notice", warning: "warning", final: "final warning" };

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
          {typeof entry.detail.level === "string" ? (
            <span className="text-[var(--paper-soft)]">{LEVEL_WORDS[entry.detail.level] ?? entry.detail.level}</span>
          ) : null}
          {typeof entry.detail.warningId === "number" && entry.action === "customer.suspend" ? (
            <span className="text-[var(--paper-soft)]">after a final warning</span>
          ) : null}
          {typeof entry.detail.reason === "string" ? (
            <span className="text-[var(--paper-soft)]">“{entry.detail.reason}”</span>
          ) : null}
          <span className="text-[var(--paper-soft)]">by {entry.actor || "a removed staff account"}</span>
        </li>
      ))}
    </ol>
  );
}
