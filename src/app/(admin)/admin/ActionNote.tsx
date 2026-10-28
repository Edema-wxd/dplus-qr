import { useSuccessToast } from "@/components/notify";
import { cn } from "@/lib/utils";
import type { AdminFormState } from "./actions";

/**
 * The answer to a staff form: what the change did as a toast, or the error
 * inline under the form, where it stays until the next attempt.
 */
export function ActionNote({
  state,
  id,
  className = "mt-3",
}: {
  state: AdminFormState;
  /** One per form, so a repeated change replaces its own toast. */
  id: string;
  className?: string;
}) {
  useSuccessToast(state, id, (s) => (s.notice ? { title: s.notice } : null));
  return state.error ? (
    <p role="alert" className={cn(className, "text-sm text-[var(--struck-ink)]")}>{state.error}</p>
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
