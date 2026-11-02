/**
 * Messages that outlive a redirect.
 *
 * A Server Action that ends in `redirect()` has nowhere to put a "done"
 * message: the form that would show it is gone. So the action leaves a key in
 * a short-lived cookie (`flash` in `flash.ts`), and `FlashToast` turns it into
 * a toast on the page it lands on.
 *
 * The cookie carries a key, never text. Anything can set a cookie the browser
 * then sends back, so the words shown are only ever the ones written here.
 */
export const FLASH_COOKIE = "qr_flash";

export const FLASH_MESSAGES = {
  "code-created": {
    title: "Code created",
    description: "Download the artwork when you are ready to print.",
  },
  "signed-out": { title: "Signed out" },
  "plan-created": { title: "Plan created" },
} as const satisfies Record<string, { title: string; description?: string }>;

export type FlashKey = keyof typeof FLASH_MESSAGES;

export function isFlashKey(value: string): value is FlashKey {
  return Object.hasOwn(FLASH_MESSAGES, value);
}
