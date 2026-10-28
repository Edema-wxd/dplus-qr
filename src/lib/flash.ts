import { cookies } from "next/headers";
import { FLASH_COOKIE, type FlashKey } from "./flash-messages";

/**
 * Leave a message for the page a Server Action is about to redirect to. Call
 * it just before `redirect()`; see `flash-messages.ts`.
 *
 * Readable by script on purpose (`FlashToast` reads and clears it), which is
 * safe because it holds only a key into a fixed list. A minute is ample for
 * the redirect it rides on, and short enough that a lost one never surfaces
 * on some unrelated later visit.
 */
export async function flash(key: FlashKey): Promise<void> {
  (await cookies()).set(FLASH_COOKIE, key, {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
}
