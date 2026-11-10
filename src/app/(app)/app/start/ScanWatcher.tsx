"use client";

import { useEffect, useState } from "react";
import { QrMark } from "@/components/QrMark";
import { finishAction } from "./actions";
import { obPrimaryClass } from "./controls";

type Scan = { at: string; where: string };

/** Often enough that a scan feels answered, rare enough to cost nothing. */
const INTERVAL_MS = 3_000;
/** Then it stops asking. A reload starts it again. */
const GIVE_UP_MS = 10 * 60_000;

/**
 * Screen 6: wait for the first scan, then show what it recorded.
 *
 * Polls `/app/start/scan` while the tab is visible, the same rule as the code
 * page's live refresh: a tab left open in the background costs nothing. The
 * scan itself is written by the redirect in `after()`, so it arrives here a
 * moment after the phone has already opened the destination.
 *
 * This is the first sight of scan data most people get, so the answer is the
 * real record, in a sentence: when, on what, and where.
 */
export function ScanWatcher({ initial }: { initial: Scan | null }) {
  const [scan, setScan] = useState<Scan | null>(initial);
  const [stopped, setStopped] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (scan) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/app/start/scan", { cache: "no-store" });
        if (response.ok) {
          const body = (await response.json()) as { scan: Scan | null };
          if (!cancelled && body.scan) {
            setScan(body.scan);
            return true;
          }
        }
      } catch {
        // A dropped poll is retried on the next tick.
      }
      return false;
    };

    const tick = async () => {
      if (cancelled) return;
      if (await check()) return;
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setStopped(true);
        return;
      }
      timer = setTimeout(tick, INTERVAL_MS);
    };

    timer = setTimeout(tick, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [scan]);

  // Keeps "12 seconds ago" true while the screen stays open.
  useEffect(() => {
    if (!scan) return;
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [scan]);

  return (
    <div>
      <div aria-live="polite" className="min-h-[5.5rem]">
        {scan ? (
          <div className="ob-slip rounded-lg border border-[var(--live-ink)]/35 bg-white px-4 py-4">
            <p className="flex items-start gap-3 text-[17px] leading-snug text-[var(--paper-ink)]">
              <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-[2px] bg-[var(--live-ink)]" />
              {/* The server and the browser read the clock moments apart. */}
              <span suppressHydrationWarning>
                Scanned {ago(scan.at, now)}
                {scan.where ? ` ${scan.where}` : ""}.
              </span>
            </p>
            <p className="mt-2 pl-[1.375rem] text-sm leading-relaxed text-[var(--paper-soft)]">
              Every scan is counted like this: when, on what device, and
              roughly where. Nobody&apos;s name or number is ever recorded.
            </p>
          </div>
        ) : stopped ? (
          <p className="text-[15px] leading-relaxed text-[var(--paper-soft)]">
            No scan yet. Reload this page once you have scanned it, or carry on
            and test it later: every scan shows on the code&apos;s page.
          </p>
        ) : (
          <div className="flex items-center gap-4">
            <QrMark size="md" />
            <p className="text-[15px] leading-relaxed text-[var(--paper-soft)]">
              Waiting for the first scan. It shows up here a moment after your
              phone opens the link.
            </p>
          </div>
        )}
      </div>

      <form action={finishAction} className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="submit" className={obPrimaryClass}>
          Go to your dashboard
        </button>
        {scan ? null : (
          <span className="text-sm text-[var(--paper-soft)]">You can test it later too.</span>
        )}
      </form>
    </div>
  );
}

function ago(at: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  return `on ${new Date(at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}`;
}
