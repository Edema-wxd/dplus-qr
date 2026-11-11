"use client";

import { useActionState, useState } from "react";
import { useSuccessToast } from "@/components/notify";
import { resendVerificationAction, type VerifyState } from "./verify-actions";

/**
 * Shown while the account's email is unverified.
 *
 * It never locks anyone out of the dashboard: a printed code has to keep
 * working, so the page that re-points it must stay open. What depends on the
 * address is whether the codes serve:
 *
 * - `held`: the account was created unverified after 11 November 2026, so its
 *   codes show the paused page until the link is clicked (migration 033,
 *   security audit M3). Not dismissable, because it explains why a scan
 *   does not open.
 * - otherwise the account predates the hold and its codes work regardless,
 *   so this is a reminder and can be dismissed.
 *
 * The mail itself goes out through Neon Auth's own Resend SMTP, configured per
 * branch (`neon neon-auth config email-provider update`), which is why this
 * can state plainly that a link was sent.
 *
 * Dismissal is per-page-load on purpose: no storage, so nothing persists a
 * decision the user did not make deliberately.
 */
export function VerifyBanner({ email, held }: { email: string; held: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [state, action, pending] = useActionState(resendVerificationAction, {} as VerifyState);
  useSuccessToast(state, "verify-resend", (s) =>
    s.sent ? { title: "Link sent", description: `Check ${s.sent}, including spam.` } : null
  );
  if (dismissed && !held) return null;

  return (
    <div
      role={held ? "status" : undefined}
      className="mb-6 rounded-lg border border-[var(--pending-ink)]/40 bg-[var(--paper-raised)] px-4 py-3"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm leading-relaxed text-[var(--paper-ink)]">
          <strong className="font-medium">Confirm your email.</strong> We sent a
          link to <span className="font-mono text-xs [overflow-wrap:anywhere]">{email}</span>.{" "}
          {held ? (
            <>
              Your codes don&apos;t open for anyone until you click it: a scan
              shows a &ldquo;not active&rdquo; page. Once you have, reload this page.
            </>
          ) : (
            <>Your codes work either way for now.</>
          )}
        </p>
        {held ? null : (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-[var(--paper-soft)] transition-colors duration-150 hover:text-[var(--paper-ink)]"
          >
            Dismiss
          </button>
        )}
      </div>
      <form action={action} className="mt-2">
        <button
          type="submit"
          disabled={pending}
          className="text-sm text-[var(--paper-ink)] underline underline-offset-4 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send the link again"}
        </button>
        {state.error ? (
          <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
