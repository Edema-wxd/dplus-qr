import type { AdminFormState } from "./actions";

/** The answer under a staff form: an error, or what the change did. */
export function ActionNote({ state }: { state: AdminFormState }) {
  return state.error ? (
    <p role="alert" className="mt-3 text-sm text-[var(--struck-ink)]">{state.error}</p>
  ) : state.notice ? (
    <p role="status" className="mt-3 text-sm text-[var(--live-ink)]">{state.notice}</p>
  ) : null;
}

/** For changes that take something out of service. */
export const dangerButtonClass =
  "inline-flex items-center justify-center rounded-md border border-[var(--struck-ink)] bg-white px-3.5 py-2 text-sm text-[var(--struck-ink)] transition-colors duration-150 hover:bg-[var(--struck-ink)] hover:text-white disabled:opacity-60";

/** Stop a submit unless staff confirm it. For the changes a misclick would hurt. */
export function confirmFirst(message: string) {
  return (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(message)) event.preventDefault();
  };
}
