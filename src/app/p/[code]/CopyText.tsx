"use client";

import { useState } from "react";

/** A coupon code, large enough to read to a cashier, with a copy button. */
export function CopyText({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border-2 border-dashed border-foreground/40">
      <span className="flex-1 select-all px-4 py-3 text-center font-mono text-xl tracking-[0.12em]">
        {text}
      </span>
      <button
        type="button"
        onClick={copy}
        className="border-l-2 border-dashed border-foreground/40 px-4 text-sm"
      >
        <span aria-live="polite">
          {state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy"}
        </span>
      </button>
    </div>
  );
}
