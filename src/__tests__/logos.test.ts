import { isUploadThingUrl, LOGO_MIME_TYPES, parseLogoId } from "@/lib/logos";

/**
 * Pure guards only; the SQL is covered against a real database, as elsewhere.
 */

describe("isUploadThingUrl", () => {
  it.each([
    "https://abc123.ufs.sh/f/key-1",
    "https://utfs.io/f/key-1",
  ])("accepts %s", (url) => {
    expect(isUploadThingUrl(url)).toBe(true);
  });

  it.each([
    "http://abc123.ufs.sh/f/key-1",
    "https://ufs.sh.evil.example/f/key",
    "https://evil.example/abc.ufs.sh",
    "https://utfs.io.evil.example/f/key",
    "https://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "not a url",
    "",
  ])("refuses %s, so the server can only be made to fetch from UploadThing", (url) => {
    expect(isUploadThingUrl(url)).toBe(false);
  });
});

describe("parseLogoId", () => {
  it("accepts a positive bigint", () => {
    expect(parseLogoId("42")).toBe("42");
  });

  it.each(["0", "-1", "01", "1.5", "abc", "1".repeat(20), ""])("refuses %p", (raw) => {
    expect(parseLogoId(raw)).toBeNull();
  });
});

describe("LOGO_MIME_TYPES", () => {
  it("never accepts SVG, which can carry script", () => {
    expect(LOGO_MIME_TYPES).not.toContain("image/svg+xml");
  });
});
