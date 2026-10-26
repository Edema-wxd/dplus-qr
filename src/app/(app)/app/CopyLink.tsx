"use client";

import { useState } from "react";
import { secondaryButtonClass } from "./DashShell";

/**
 * Copy a code's URL, the thing an owner pastes into a print brief or a chat.
 *
 * The result is announced rather than only shown, and a refused clipboard
 * (an insecure origin, or a browser that asks and is told no) says so instead
 * of pretending: the URL is printed beside the button, so it can still be
 * selected by hand.
 */
export function CopyLink({ url }: { url: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`${secondaryButtonClass} px-2.5 py-1 text-xs`}
    >
      <span aria-live="polite">
        {state === "copied"
          ? "Copied"
          : state === "failed"
            ? "Copy failed, select the link"
            : "Copy link"}
      </span>
    </button>
  );
}
