import { CODE_HOST, SUPPORT_EMAIL } from "@/lib/brand";
import { formatRespondBy, LEVEL_LABELS, type OwnerWarning } from "@/lib/warnings";
import { acknowledgeWarningAction } from "./actions";

/**
 * Warnings from staff, at the top of the owner's codes. A server component
 * with a plain form, so marking one as read works without JavaScript.
 *
 * Calm on purpose: amber for a notice or warning, coral only for a final
 * warning, and the message in the team's own words.
 */
export function WarningBanner({ warnings }: { warnings: OwnerWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mb-6 space-y-3">
      {warnings.map((warning) => {
        const final = warning.level === "final";
        return (
          <section
            key={warning.id}
            aria-label={LEVEL_LABELS[warning.level]}
            className={`rounded-lg border bg-[var(--paper-raised)] px-4 py-3 ${
              final ? "border-[var(--struck-ink)]/60" : "border-[var(--pending-ink)]/40"
            }`}
          >
            <p className={`text-xs font-medium uppercase tracking-[0.1em] ${final ? "text-[var(--struck-ink)]" : "text-[var(--pending-ink)]"}`}>
              {LEVEL_LABELS[warning.level]} from our team
              {warning.shortCode ? (
                <span className="ml-2 font-mono normal-case tracking-normal text-[var(--paper-soft)]">
                  {CODE_HOST}/{warning.shortCode}
                </span>
              ) : null}
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--paper-ink)]">{warning.message}</p>
            {final && warning.respondBy ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--paper-ink)]">
                <strong className="font-medium">Please put this right by {formatRespondBy(warning.respondBy)}.</strong>{" "}
                After that, our team may suspend your account, which shows a paused page on all your codes.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--paper-soft)]">
              <span>
                Questions, or already fixed? Write to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </span>
              {warning.acknowledged ? (
                <span>Marked as read</span>
              ) : (
                <form action={acknowledgeWarningAction}>
                  <input type="hidden" name="warningId" value={warning.id} />
                  <button
                    type="submit"
                    className="rounded-md px-2 py-1 text-sm text-[var(--paper-soft)] transition-colors duration-150 hover:text-[var(--paper-ink)]"
                  >
                    I&apos;ve read this
                  </button>
                </form>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * A suspended account's codes all show the paused page, and until now nothing
 * on the dashboard said so. It never says why in public; here, the owner is
 * told how to reach the team.
 */
export function SuspendedNotice() {
  return (
    <div className="mb-6 rounded-lg border border-[var(--struck-ink)]/60 bg-[var(--paper-raised)] px-4 py-3">
      <p className="text-sm leading-relaxed text-[var(--paper-ink)]">
        <strong className="font-medium">Your account is suspended.</strong> Every one of your codes shows a paused page
        instead of your link. To talk to our team about it, write to{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    </div>
  );
}
