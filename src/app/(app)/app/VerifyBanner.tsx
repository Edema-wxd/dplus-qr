"use client";

import { useState } from "react";

/**
 * Shown while the account's email is unverified.
 *
 * It does not block anything. Verification *links* need custom SMTP, which is
 * still outstanding, so gating the dashboard on `emailVerified` would lock out
 * every account until that lands. This states the position honestly instead,
 * and becomes a real gate in one line once SMTP is configured.
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
