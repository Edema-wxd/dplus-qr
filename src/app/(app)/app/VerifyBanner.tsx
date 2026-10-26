"use client";

import { useState } from "react";

/**
 * Shown while the account's email is unverified.
 *
 * It does not block anything, and that is a product decision rather than a
 * missing piece: a printed code has to keep working, so an unconfirmed address
 * is a thing to chase, not a reason to lock someone out of the dashboard that
 * re-points it. Making this a gate is a one-line change if that ever becomes
 * the policy.
 *
 * The mail itself goes out through Neon Auth's own Resend SMTP, configured per
 * branch (`neon neon-auth config email-provider update`), which is why this
 * can state plainly that a link was sent.
 *
 * Dismissal is per-page-load on purpose: no storage, so nothing persists a
 * decision the user did not make deliberately.
 */
export function VerifyBanner({ email }: { email: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-[var(--pending-ink)]/40 bg-[var(--paper-raised)] px-4 py-3">
      <p className="text-sm leading-relaxed text-[var(--paper-ink)]">
        <strong className="font-medium">Confirm your email.</strong> We sent a
        link to <span className="font-mono text-xs">{email}</span>. Your codes
        work either way for now.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-md px-2 py-1 text-sm text-[var(--paper-soft)] transition-colors duration-150 hover:text-[var(--paper-ink)]"
      >
        Dismiss
      </button>
    </div>
  );
}
