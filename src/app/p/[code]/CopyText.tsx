"use client";

import { toast } from "sonner";

/** A coupon code, large enough to read to a cashier, with a copy button. */
export function CopyText({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied", { id: "copy-text" });
    } catch {
      toast.error("Could not copy", {
        id: "copy-text",
        description: "Select the code and copy it by hand.",
      });
    }
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
        Copy
      </button>
    </div>
  );
}
