import { FLASH_MESSAGES, isFlashKey } from "@/lib/flash-messages";

/**
 * The flash cookie is readable and writable by anything in the browser, so
 * the only text it can ever surface is a message from the fixed list.
 */
describe("flash message keys", () => {
  it("accepts every key in the list", () => {
    for (const key of Object.keys(FLASH_MESSAGES)) expect(isFlashKey(key)).toBe(true);
  });

  it("refuses text that is not a key", () => {
    expect(isFlashKey("Your account is suspended. Call this number")).toBe(false);
    expect(isFlashKey("")).toBe(false);
  });

  it("refuses names inherited from Object", () => {
    // A plain `key in FLASH_MESSAGES` check would let these through.
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(isFlashKey(key)).toBe(false);
    }
  });
});
