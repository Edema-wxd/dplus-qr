"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/**
 * One slim, dismissible prompt on the codes list for a free account, shown at
 * a moment that gives it a reason: the first scans have arrived, or the
 * account is one code from its limit. The page decides which, if either.
 *
 * Dismissing hides it for 30 days in this browser. It never pops over the
 * page or blocks anything; the header's Upgrade button is always there for
 * anyone who wants it sooner.
 *
 * Read through `useSyncExternalStore` so the server render (no storage) and
 * the first client render agree: it renders nothing until the browser has
 * said whether it was dismissed, so a dismissed banner never flashes.
 */
const KEY = "qriate:upgrade-banner-dismissed-until";
const QUIET_DAYS = 30;

function dismissedUntil(): number {
  try {
    return Number(window.localStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function UpgradeBanner({ reason }: { reason: "scans" | "limit" }) {
  const hidden = useSyncExternalStore(
    subscribe,
    () => dismissedUntil() > Date.now(),
    () => true
  );
  if (hidden) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(KEY, String(Date.now() + QUIET_DAYS * 86_400_000));
    } catch {
      // Storage refused (a private window): it simply shows again next time.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3 text-sm">
      <p className="min-w-0 flex-1 leading-relaxed">
        {reason === "scans" ? (
          <>
            <strong className="font-medium">Your codes are being scanned.</strong>{" "}
            Paid plans show unique scans, phones and cities, keep longer scan history and
            hold more codes.
          </>
        ) : (
          <>
            <strong className="font-medium">You are close to your plan&apos;s code limit.</strong>{" "}
            Paid plans hold more codes and keep longer scan history.
          </>
        )}
      </p>
      <div className="flex items-center gap-3">
        <Link href="/billing" className="font-medium underline underline-offset-4">
          See plans
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
