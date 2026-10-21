import { createLogoUploadUrl } from "@/lib/storage";

/**
 * Validation runs before the S3 client is touched, so these cases need no
 * credentials and no network.
 */
describe("createLogoUploadUrl validation", () => {
  const userId = "00000000-0000-4000-8000-000000000001";

  it.each([
    ["SVG, which can carry script", "image/svg+xml"],
    ["HTML masquerading as an image", "text/html"],
    ["a PDF", "application/pdf"],
    ["an empty content type", ""],
  ])("rejects %s", async (_label, contentType) => {
    await expect(
      createLogoUploadUrl({ userId, contentType, byteLength: 1_000 })
    ).rejects.toThrow(/PNG, JPEG or WebP/);
  });

  it("rejects a file over 1 MB", async () => {
    await expect(
      createLogoUploadUrl({ userId, contentType: "image/png", byteLength: 1_048_577 })
    ).rejects.toThrow(/under 1 MB/);
  });

  it("checks the type before the size, so the message names the real problem", async () => {
    await expect(
      createLogoUploadUrl({ userId, contentType: "image/svg+xml", byteLength: 5_000_000 })
    ).rejects.toThrow(/PNG, JPEG or WebP/);
  });

  it("accepts a legitimate PNG at the size limit", async () => {
    // Storage is unconfigured under test, so this gets past validation and
    // fails on configuration -- which is itself the proof validation passed.
    await expect(
      createLogoUploadUrl({ userId, contentType: "image/png", byteLength: 1_048_576 })
    ).rejects.toThrow(/not configured/);
  });
});
