import Link from "next/link";
import Image from "next/image";
import { PRODUCT_NAME } from "@/lib/brand";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/plans", label: "Plans" },
  { href: "/admin/customers", label: "Customers" },
];

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
  current: "/admin" | "/admin/plans" | "/admin/customers";
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
