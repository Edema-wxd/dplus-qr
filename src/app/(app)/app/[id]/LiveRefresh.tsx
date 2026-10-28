"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetch the code page every 30 seconds while it is on screen, so a scan
 * shows up while the owner is watching (test-scanning a fresh print, say)
 * without a reload.
 *
 * Only while the tab is visible: a page left open in a background tab all day
 * should cost nothing. `router.refresh()` re-renders the server components and
 * keeps client state, so the chosen date range and anything being typed into
 * a form survive it.
 */
const INTERVAL_MS = 30_000;

export function LiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => router.refresh(), INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const sync = () => {
      if (document.visibilityState === "visible") {
        // Coming back to the tab: catch up at once, then resume the interval.
        router.refresh();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [router]);

  return null;
}
