"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { FLASH_COOKIE, FLASH_MESSAGES, isFlashKey } from "@/lib/flash-messages";

/**
 * Shows the message a redirecting Server Action left behind, then clears it.
 *
 * It sits in the root layout, which does not remount between pages, so it
 * checks again whenever the pathname changes: a redirect from a Server Action
 * is a client-side navigation, and its cookie has already landed by the time
 * the new page commits. Reading the cookie here, in the browser, keeps the
 * pages themselves from having to read it on the server.
 */
export function FlashToast() {
  const pathname = usePathname();

  useEffect(() => {
    const entry = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${FLASH_COOKIE}=`));
    if (!entry) return;

    // Secure to match how it was set in production; a browser refuses to let
    // a cookie without it replace one that has it.
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${FLASH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    const key = decodeURIComponent(entry.slice(FLASH_COOKIE.length + 1));
    if (!isFlashKey(key)) return;

    const message: { title: string; description?: string } = FLASH_MESSAGES[key];
    // Keyed, so a double run of this effect shows the message once.
    toast.success(message.title, { id: `flash-${key}`, description: message.description });
  }, [pathname]);

  return null;
}
