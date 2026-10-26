"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the page until the webhook has landed.
 *
 * `router.refresh()` rather than a status endpoint: the page already reads the
 * subscription on the server, so refreshing re-runs exactly the query that
 * decides, and there is no second code path to disagree with it.
 *
 * Gives up after a couple of minutes. A spinner that never stops is a worse
 * answer than "this is taking longer than usual" plus a way to get help --
 * and the payment is not lost either way, because Paystack will keep
 * redelivering the webhook.
 */
const EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 120_000;

/*
 * Takes no `done` prop. It had one, but the page renders this component only
 * inside the branch where the payment has *not* landed, so the prop was always
 * false and every guard reading it was dead -- a safety net that looked like
 * it was holding something. When the webhook lands, the refresh re-renders the
 * page into its other branch and this unmounts, which is the real stop
 * condition.
 */
export function Poller() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > GIVE_UP_AFTER_MS) {
        setGaveUp(true);
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, EVERY_MS);

    return () => clearInterval(timer);
  }, [router]);

  if (!gaveUp) return null;

  return (
    <p role="status" className="mt-4 text-sm text-[var(--paper-soft)]">
      This is taking longer than usual. Your payment is safe — we record it from
      our payment provider, not from this page, so it will land even if you
      close this tab.
    </p>
  );
}
