"use client";

import Link from "next/link";
import {
  ErrorScreen,
  errorReference,
  retryButtonClass,
  secondaryButtonClass,
} from "@/components/ErrorScreen";
import { MAIN_SITE } from "@/lib/brand";

/**
 * A status page itself failing is the worst case this platform has: someone
 * scanned a printed code in good faith and has now hit two failures in a row.
 *
 * So the tone reassures rather than reports, and the accent is yellow, not
 * red -- nothing is wrong with the code they scanned, and telling them the
 * code is probably fine is the most useful thing on the screen. Neither the
 * code nor its destination is available here, so the only honest offers are to
 * try again and to reach the company directly.
 */
export default function StatusError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorScreen
      accent="yellow"
      heading="We could not check this code"
      reference={errorReference(error)}
      action={
        <>
          <button type="button" onClick={() => retry()} className={retryButtonClass}>
            Try again
          </button>
          <Link href={MAIN_SITE} className={secondaryButtonClass}>
            Visit De Sign Plus
          </Link>
        </>
      }
    >
      <p>
        This is a problem on our side, not with the code you scanned. The code
        itself is most likely working — scanning it again in a moment is worth
        a try.
      </p>
    </ErrorScreen>
  );
}
