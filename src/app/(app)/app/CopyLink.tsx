"use client";

import { toast } from "sonner";
import { secondaryButtonClass } from "@/components/controls";

/**
 * Copy a code's URL, the thing an owner pastes into a print brief or a chat.
 *
 * The result is a toast, which is announced to screen readers as well as
 * shown, and a refused clipboard (an insecure origin, or a browser that asks
 * and is told no) says so instead of pretending: the URL is printed beside
 * the button, so it can still be selected by hand.
 */
export function CopyLink({ url }: { url: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { id: "copy-link", description: url });
    } catch {
      toast.error("Could not copy the link", {
        id: "copy-link",
        description: "Select it beside the button and copy it by hand.",
      });
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`${secondaryButtonClass} px-2.5 py-1 text-xs`}
    >
      Copy link
    </button>
  );
}
