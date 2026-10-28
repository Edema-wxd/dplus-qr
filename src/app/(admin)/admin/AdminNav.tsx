"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/brand";

export type AdminSection = "/admin" | "/admin/reports" | "/admin/customers" | "/admin/codes" | "/admin/plans";

/** Counts the server read for this request; a badge shows only when non-zero. */
export type AdminBadges = { reports: number; overdue: number };

const ITEMS: { href: AdminSection; label: string; icon: string; badge?: keyof AdminBadges }[] = [
  { href: "/admin", label: "Overview", icon: "M2.5 8.5 8 3l5.5 5.5M4 7v6.5h8V7" },
  { href: "/admin/reports", label: "Reports", icon: "M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8", badge: "reports" },
  { href: "/admin/customers", label: "Customers", icon: "M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4", badge: "overdue" },
  { href: "/admin/codes", label: "Codes", icon: "M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" },
  { href: "/admin/plans", label: "Plans", icon: "M2 4.5h12v7H2zM2 7h12" },
];

/**
 * The staff admin's sidebar: the dashboard's own shape (a column on wide
 * screens, a drawer below `lg`), so moving between the two sides of the
 * product changes the label, not the habits. Badges count what is waiting:
 * open reports and overdue accounts.
 */
export function AdminNav({ current, badges }: { current: AdminSection; badges: AdminBadges }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const waiting = badges.reports + badges.overdue;

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-[var(--field)] px-4 py-3 text-[var(--field-ink)] lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpenOn(pathname)}
          aria-expanded={open}
          aria-controls="admin-sidebar"
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[var(--field-soft)] transition-colors duration-150 hover:bg-white/10 hover:text-[var(--field-ink)]"
        >
          Menu
          {waiting > 0 ? <Badge count={waiting} label={`${waiting} waiting`} /> : null}
        </button>
      </div>

      {open ? (
        <div aria-hidden onClick={() => setOpenOn(null)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
      ) : null}

      <aside
        id="admin-sidebar"
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpenOn(null);
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--field)] text-[var(--field-ink)] transition-transform duration-200 ease-[var(--ease-out)] lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Brand />
          <button
            type="button"
            onClick={() => setOpenOn(null)}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-[var(--field-soft)] hover:bg-white/10 hover:text-[var(--field-ink)] lg:hidden"
          >
            <Icon d="M4 4l8 8M12 4l-8 8" />
          </button>
        </div>

        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-0.5">
            {ITEMS.map((item) => {
              const active = item.href === current;
              const count = item.badge ? badges[item.badge] : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition-colors duration-150 ${
                      active
                        ? "bg-white/10 text-[var(--field-ink)]"
                        : "text-[var(--field-soft)] hover:bg-white/5 hover:text-[var(--field-ink)]"
                    }`}
                  >
                    <Icon d={item.icon} />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 ? (
                      <Badge
                        count={count}
                        label={item.badge === "reports" ? `${count} open` : `${count} overdue`}
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[var(--field-rule)] px-3 py-3">
          <Link
            href="/app"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--field-soft)] no-underline transition-colors duration-150 hover:bg-white/5 hover:text-[var(--field-ink)]"
          >
            <Icon d="M10 3 5 8l5 5" />
            Back to the app
          </Link>
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 no-underline" aria-label={`${PRODUCT_NAME} staff admin`}>
      <Image
        src="/brand/qriate-wordmark-light.svg"
        alt=""
        width={104}
        height={43}
        priority
        className="h-auto w-[80px]"
      />
      <span className="rounded border border-[var(--field-rule)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--field-soft)]">
        Staff
      </span>
    </Link>
  );
}

/** A count that wants attention. The label carries the meaning for screen readers. */
function Badge({ count, label }: { count: number; label: string }) {
  return (
    <span
      aria-label={label}
      className="dash-num inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--struck-ink)] px-1.5 text-[11px] font-medium leading-5 text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path d={d} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
