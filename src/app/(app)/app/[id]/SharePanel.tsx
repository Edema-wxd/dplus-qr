"use client";

import Link from "next/link";
import { useActionState } from "react";
import { shareStatsAction, type ShareState } from "../actions";
import { CopyLink } from "../CopyLink";
import { primaryButtonClass, secondaryButtonClass } from "@/components/controls";

/**
 * Share this code's scan statistics with someone who has no account: a client
 * the owner prints for, a manager, a partner.
 *
 * Off until the owner turns it on. The page behind the link shows the code's
 * name, short link and stats, never its destination. "New link" replaces the
 * old one, which stops working at once; "Turn off" withdraws it.
 */
export function SharePanel({
  id,
  origin,
  initialToken,
  allowed,
  reason,
}: {
  id: string;
  /** This deployment's own origin, which share links are served from. */
  origin: string;
  initialToken: string | null;
  allowed: boolean;
  reason?: string;
}) {
  const [state, action, pending] = useActionState(shareStatsAction, {
    token: initialToken,
  } as ShareState);
  const token = state.token === undefined ? initialToken : state.token;
  const url = token ? `${origin}/s/${token}` : null;

  return (
    <section aria-labelledby="share-heading">
      <h2 id="share-heading" className="font-sarlotte text-2xl leading-none">
        Share stats
      </h2>

      {url ? (
        <div className="mt-4 space-y-3">
          <p className="max-w-[56ch] text-sm leading-relaxed text-[var(--paper-soft)]">
            Anyone with this link can see this code&apos;s scan statistics. They
            cannot see where it points or change anything.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="dash-num min-w-0 max-w-full truncate rounded-md border border-[var(--paper-rule)] bg-white px-3 py-1.5 font-mono text-xs">
              {url}
            </span>
            <CopyLink url={url} />
          </div>
          <form action={action} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              name="intent"
              value="create"
              disabled={pending || !allowed}
              className={secondaryButtonClass}
            >
              New link
            </button>
            <button
              type="submit"
              name="intent"
              value="revoke"
              disabled={pending}
              className={secondaryButtonClass}
            >
              Turn off sharing
            </button>
          </form>
          <p className="text-xs text-[var(--paper-soft)]">
            A new link stops the old one working straight away.
          </p>
        </div>
      ) : allowed ? (
        <form action={action} className="mt-4 space-y-3">
          <input type="hidden" name="id" value={id} />
          <p className="max-w-[56ch] text-sm leading-relaxed text-[var(--paper-soft)]">
            Give someone without an account a read-only view of this code&apos;s
            scans. They will not see where it points. You can turn it off at any
            time.
          </p>
          <button
            type="submit"
            name="intent"
            value="create"
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Creating…" : "Create a share link"}
          </button>
        </form>
      ) : (
        <p className="mt-4 max-w-[56ch] text-sm leading-relaxed text-[var(--paper-soft)]">
          {reason ?? "Share links come with Pro and Business."}{" "}
          <Link href="/billing" className="underline underline-offset-4">
            See plans
          </Link>
        </p>
      )}

      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
