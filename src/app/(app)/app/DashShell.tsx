import Link from "next/link";
import { LegalLinks } from "@/components/LegalLinks";
import { DashNav } from "./DashNav";

/**
 * The dashboard shell.
 *
 * A separate frame from `AuthShell`, which is a narrow centred column built
 * for a sign-in form and would fight a table. The navigation reads as
 * navigation and the controls are plain web components: on a working screen
 * the world contributes type, palette and density, not the furniture.
 *
 * Navigation is a sidebar (`DashNav`): ink for the shell, paper for the work
 * area, with room for more than three
 * destinations without crowding a phone-width row.
 */
export function DashShell({
  heading,
  meta,
  action,
  back,
  children,
}: {
  heading: string;
  /** Short status line under the heading — plan usage, or the code's URL. */
  meta?: React.ReactNode;
  /** The page's primary action, top right. */
  action?: React.ReactNode;
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="dash min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <DashNav />

      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8 sm:py-12">
        {back ? (
          <Link
            href={back.href}
            className="mb-5 inline-flex items-center gap-1.5 text-sm text-[var(--paper-soft)] transition-colors duration-150 hover:text-[var(--paper-ink)]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M10 3 5 8l5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {back.label}
          </Link>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <h1 className="font-sarlotte text-[2.1rem] leading-none tracking-[-0.015em] sm:text-[2.5rem]">
              {heading}
            </h1>
            {meta ? (
              <div className="mt-2 text-sm text-[var(--paper-soft)]">{meta}</div>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className="mt-8">{children}</div>

        <footer className="mt-16 border-t border-[var(--paper-rule)] pt-5">
          <LegalLinks tone="paper" />
        </footer>
      </main>
    </div>
  );
}

/** Shared control styles, so every form on the surface agrees. */
export const inputClass =
  "w-full rounded-md border border-[var(--paper-rule)] bg-white px-3 py-2 text-sm text-[var(--paper-ink)] placeholder:text-[var(--paper-soft)] transition-colors duration-150 focus:border-[var(--pin-ink)]";

export const primaryButtonClass =
  "inline-flex items-center justify-center rounded-md bg-[var(--paper-ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-[var(--paper-rule)] bg-white px-3.5 py-2 text-sm text-[var(--paper-ink)] transition-colors duration-150 hover:border-[var(--paper-ink)] disabled:opacity-60";
