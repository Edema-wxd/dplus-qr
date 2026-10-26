"use client";

import Link from "next/link";
import {
  ErrorScreen,
  errorReference,
  retryButtonClass,
  secondaryButtonClass,
} from "@/components/ErrorScreen";

/**
 * A render failure inside the signed-in app.
 *
 * The root boundary offers "Start over" to `/`, which is the landing page --
 * the right offer for a visitor and the wrong one for a client who was part
 * way through re-pointing a code. This one sends them back to their codes.
 *
 * It states the thing that is actually at stake, because this group is the
 * only surface where someone has to wonder: a dashboard that will not load has
 * no bearing on whether the printed codes are still redirecting. They are
 * served by a different route that shares nothing with this page.
 */
export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <ErrorScreen
      accent="red"
      heading="We could not load that"
      reference={errorReference(error)}
      action={
        <>
          <button type="button" onClick={() => retry()} className={retryButtonClass}>
            Try again
          </button>
          <Link href="/app" className={secondaryButtonClass}>
            Your codes
          </Link>
        </>
      }
    >
      <p>
        Something failed on our side while building this page. Trying again
        often clears it.
      </p>
      <p>
        Your codes are unaffected. Scans are served by a separate path that does
        not touch this page, so anything printed keeps redirecting while this is
        broken.
      </p>
    </ErrorScreen>
  );
}
