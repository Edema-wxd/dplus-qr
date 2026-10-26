import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { DashShell } from "./app/DashShell";

/**
 * A missing thing inside the signed-in app.
 *
 * The root `not-found.tsx` is written for the other audience entirely -- it
 * talks about typing a seven-character code off printed material -- and it
 * renders without the dashboard frame, so a client who followed a stale link
 * to one of their own codes lost the navigation along with the page. This
 * keeps the shell, so the way back is where it always is.
 *
 * Reached by `notFound()` in `app/[id]` when an id is malformed or belongs to
 * someone else. Those two cases are deliberately the same answer: saying "that
 * code is not yours" would confirm the row exists.
 */
export default function NotFound() {
  return (
    <DashShell heading="Not found" back={{ href: "/app", label: "All codes" }}>
      <div className="max-w-[52ch] space-y-4 text-sm leading-relaxed text-[var(--paper-soft)]">
        <p>
          We could not find that page on your account. A code you have deleted
          does not exist — codes are never deleted, so a link that no longer
          works was most likely cut short, or belongs to a different account.
        </p>
        <p>
          <Link
            href="/app"
            className="text-[var(--paper-ink)] underline underline-offset-4"
          >
            Your codes
          </Link>{" "}
          lists everything this account holds. If something printed is missing
          from it, that is worth telling us about:{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-[var(--paper-ink)] underline underline-offset-4"
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </DashShell>
  );
}
