"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import type { UpgradeOffer } from "@/lib/upgrade-offers";
import { useBillingOwner } from "./BillingOwner";

/**
 * The answer to clicking something the plan does not include: what it is, why
 * it is locked, the cheapest plan that has it, and a way to plans.
 *
 * A native `<dialog>` opened with `showModal()`, so focus moves into it, Escape
 * closes it and the page behind is inert, with no focus-trap code of our own.
 * It informs and offers; it never blocks work, and "Not now" is always there.
 */
export function UpgradeDialog({
  offer,
  open,
  onClose,
}: {
  offer: UpgradeOffer;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // A team member cannot change the team's plan: say who can, and offer no
  // way to plans, which would be their own account's.
  const owner = useBillingOwner();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const headingId = `upgrade-${offer.gate}-title`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] p-0 text-[var(--paper-ink)] shadow-xl backdrop:bg-black/40"
    >
      <div className="px-5 pb-5 pt-5 sm:px-6">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--paper-soft)]">
          <LockIcon />
          {owner ? "Not on this account's plan" : "Not on your plan"}
        </p>
        <h2 id={headingId} className="mt-2 font-sarlotte text-[1.6rem] leading-tight">
          {offer.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">{offer.benefit}</p>
        {/* `why` says "your ... plan", which is the owner's, not a member's. */}
        {owner ? null : <p className="mt-3 text-sm leading-relaxed text-[var(--paper-soft)]">{offer.why}</p>}
        {owner ? (
          <p className="mt-3 rounded-md border border-[var(--paper-rule)] bg-white px-3 py-2 text-sm">
            {owner} manages the plan for this account. Ask them if you need it.
          </p>
        ) : offer.unlock ? (
          <p className="mt-3 rounded-md border border-[var(--paper-rule)] bg-white px-3 py-2 text-sm">
            Included from <strong className="font-medium">{offer.unlock.name}</strong>,{" "}
            <span className="dash-num">{offer.unlock.price}</span>.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={owner ? primaryButtonClass : secondaryButtonClass}>
            {owner ? "Close" : "Not now"}
          </button>
          {owner ? null : (
            <Link href="/billing" className={`${primaryButtonClass} no-underline`}>
              {offer.unlock ? `See ${offer.unlock.name} and other plans` : "See plans"}
            </Link>
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * A locked control: it looks like the thing the customer wanted, with a lock,
 * and clicking it explains instead of doing nothing. Use it in place of a
 * disabled button or link wherever a plan gate is the only reason it is off.
 */
export function LockedButton({
  offer,
  className = "",
  children,
}: {
  offer: UpgradeOffer;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={className}
      >
        {children}
        <span className="sr-only"> (not on your plan, opens details)</span>
      </button>
      <UpgradeDialog offer={offer} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden className={`shrink-0 ${className}`}>
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
