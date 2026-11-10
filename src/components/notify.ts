"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

export type Notice = {
  title: string;
  description?: string;
  /** For a notice with an instruction in it, which needs longer to read. */
  duration?: number;
};

/**
 * Announce a Server Action's success as a toast.
 *
 * The rule across the site: a success is transient, so it is a toast and
 * takes no room on the page; an error is something to fix, so it stays
 * inline beside the control that caused it and remains until fixed. This
 * hook therefore only ever reports success. Callers keep rendering
 * `state.error` themselves.
 *
 * It fires once per answer, not per render: every action returns a new state
 * object, so an unchanged reference means nothing new happened, and the
 * initial state is never announced. `id` makes a repeated save replace its
 * own toast instead of stacking a second one.
 */
export function useSuccessToast<S extends object>(
  state: S,
  id: string,
  notice: (state: S) => Notice | null
) {
  const seen = useRef(state);
  // Read at fire time, so an inline function does not re-run the effect.
  const latest = useRef(notice);
  useEffect(() => {
    latest.current = notice;
  });

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    const shown = latest.current(state);
    if (shown) {
      toast.success(shown.title, {
        id,
        description: shown.description,
        duration: shown.duration,
      });
    }
  }, [state, id]);
}
