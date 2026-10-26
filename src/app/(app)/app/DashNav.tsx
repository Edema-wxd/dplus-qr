"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";
import { signOutAction } from "../auth/sign-in/actions";

/**
 * The dashboard sidebar.
 *
 * A fixed column on wide screens; below `lg` it folds into a top bar whose
 * menu button opens the same column as a drawer, so a phone keeps the whole
 * navigation without a second, smaller copy of it to drift out of step.
 *
 * Only routes that exist are listed. The status shortcuts are the codes
 * list's own `?status=` filter, not separate pages, so they add nothing to
 * the URL namespace a short code could collide with.
 */
export function DashNav({ usage }: { usage?: React.ReactNode }) {
  const pathname = usePathname();
  // The drawer is open *on a path*, so any navigation closes it: a drawer left
  // open would cover the page just chosen. A tap on a link closes it too, which
  // covers the status shortcuts, whose change is to the query alone.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-[var(--field)] px-4 py-3 text-[var(--field-ink)] lg:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="dash-sidebar"
          className="rounded-md px-2.5 py-1.5 text-sm text-[var(--field-soft)] transition-colors duration-150 hover:bg-white/10 hover:text-[var(--field-ink)]"
        >
          Menu
        </button>
      </div>

      {open ? (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        id="dash-sidebar"
        onClick={(event) => {
          if ((event.target as Element).closest("a")) setOpen(false);
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-[var(--field)] text-[var(--field-ink)] transition-transform duration-200 ease-[var(--ease-out)] lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-5">
          <Wordmark />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-md p-1.5 text-[var(--field-soft)] hover:bg-white/10 hover:text-[var(--field-ink)] lg:hidden"
          >
            <Icon d="M4 4l8 8M12 4l-8 8" />
          </button>
        </div>

        <div className="px-4">
          <Link
            href="/app/new"
            className="flex items-center justify-center gap-2 rounded-md bg-[var(--field-ink)] px-4 py-2.5 text-sm font-medium text-[var(--field)] no-underline transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
          >
            <Icon d="M8 3v10M3 8h10" />
            New code
          </Link>
        </div>

        <nav aria-label="Main" className="mt-6 flex-1 overflow-y-auto px-3">
          <Group label="Codes">
            <Suspense fallback={<CodeLinks status={null} pathname={pathname} />}>
              <CodeLinksWithStatus pathname={pathname} />
            </Suspense>
          </Group>

          <Group label="Account">
            <NavItem href="/billing" icon={ICONS.plan} active={pathname.startsWith("/billing")}>
              Plan and billing
            </NavItem>
            <NavItem href="/account" icon={ICONS.settings} active={pathname === "/account"}>
              Settings
            </NavItem>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className={itemClass(false)}>
                <Icon d={ICONS.contact} />
                Contact support
              </a>
            </li>
          </Group>
        </nav>

        {usage}

        <div className="border-t border-[var(--field-rule)] px-3 py-3">
          <form action={signOutAction}>
            <button type="submit" className={`${itemClass(false)} w-full`}>
              <Icon d={ICONS.signOut} />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

/**
 * `useSearchParams` sits in its own Suspense boundary: under Cache Components
 * a page that prerenders (the not-found page does) would otherwise fail the
 * build. The fallback is the same list with no status highlighted.
 */
function CodeLinksWithStatus({ pathname }: { pathname: string }) {
  const status = useSearchParams().get("status");
  return <CodeLinks status={status} pathname={pathname} />;
}

function CodeLinks({ status, pathname }: { status: string | null; pathname: string }) {
  const onList = pathname === "/app";
  const filtered = status === "active" || status === "paused";
  return (
    <>
      <NavItem
        href="/app"
        icon={ICONS.all}
        active={(onList && !filtered) || (pathname.startsWith("/app/") && pathname !== "/app/new")}
      >
        All codes
      </NavItem>
      <NavItem href="/app?status=active" icon={ICONS.live} active={onList && status === "active"}>
        Live
      </NavItem>
      <NavItem href="/app?status=paused" icon={ICONS.paused} active={onList && status === "paused"}>
        Paused
      </NavItem>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/app" className="shrink-0" aria-label={PRODUCT_NAME}>
      <Image
        src="/brand/qriate-wordmark-light.svg"
        alt={PRODUCT_NAME}
        width={104}
        height={43}
        priority
        className="h-auto w-[84px] lg:w-[96px]"
      />
    </Link>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--field-soft)]">
        {label}
      </p>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function itemClass(active: boolean) {
  return `flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition-colors duration-150 ${
    active
      ? "bg-white/10 text-[var(--field-ink)]"
      : "text-[var(--field-soft)] hover:bg-white/5 hover:text-[var(--field-ink)]"
  }`;
}

function NavItem({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
        <Icon d={icon} />
        {children}
      </Link>
    </li>
  );
}

const ICONS = {
  all: "M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z",
  live: "M2 12l3.5-4 3 2.5L14 4",
  paused: "M6 3.5v9M10 3.5v9",
  plan: "M2 4.5h12v7H2zM2 7h12",
  settings: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
  contact: "M2 3.5h12v9H2zM2 4l6 5 6-5",
  signOut: "M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6",
};

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <path d={d} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
