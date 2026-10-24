"use client";

import Link from "next/link";
import {
  ErrorScreen,
  errorReference,
  retryButtonClass,
  secondaryButtonClass,
} from "@/components/ErrorScreen";

/**
 * Catches a render failure anywhere below the root layout that has not got a
 * closer boundary.
 *
 * `retry` re-fetches and re-renders this boundary's children, which is the
 * right first offer: most of what can fail here is a database or Redis call
 * that is fine a second later.
 */
export default function Error({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorScreen
      accent="red"
      heading="Something went wrong"
      reference={errorReference(error)}
      action={
        <>
          <button type="button" onClick={() => retry()} className={retryButtonClass}>
            Try again
          </button>
          <Link href="/" className={secondaryButtonClass}>
            Start over
          </Link>
        </>
      }
    >
      <p>
        We could not finish loading this page. It is our side, not yours, and
        trying again often clears it.
      </p>
    </ErrorScreen>
  );
}
