/**
 * Shared control styles, so every form agrees, on the dashboard and on the
 * public pricing page. They read only the paper tokens, which both the `.dash`
 * and `.legal` surfaces define.
 */
export const inputClass =
  "w-full rounded-md border border-[var(--paper-rule)] bg-white px-3 py-2 text-sm text-[var(--paper-ink)] placeholder:text-[var(--paper-soft)] transition-colors duration-150 focus:border-[var(--pin-ink)]";

export const primaryButtonClass =
  "inline-flex items-center justify-center rounded-md bg-[var(--paper-ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-60 disabled:active:scale-100";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-[var(--paper-rule)] bg-white px-3.5 py-2 text-sm text-[var(--paper-ink)] transition-colors duration-150 hover:border-[var(--paper-ink)] disabled:opacity-60";
