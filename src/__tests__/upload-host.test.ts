import nextConfig from "../../next.config";
import { isOptimisableImage, UPLOADTHING_APP_HOST } from "@/lib/upload-host";

/**
 * Hosted-page photos go through `next/image`, which throws on a host that
 * `remotePatterns` does not list. These hold the two halves together: the
 * guard says yes only to what the config allows, so a page never renders an
 * `<Image>` that would crash it.
 */

describe("isOptimisableImage", () => {
  it("accepts this app's UploadThing files", () => {
    expect(isOptimisableImage(`https://${UPLOADTHING_APP_HOST}/f/abc123`)).toBe(true);
  });

  it.each([
    "https://otherapp.ufs.sh/f/abc123",
    `http://${UPLOADTHING_APP_HOST}/f/abc123`,
    `https://${UPLOADTHING_APP_HOST}/not-a-file`,
    `https://${UPLOADTHING_APP_HOST}.evil.example/f/abc`,
    "https://utfs.io/f/abc123",
    "not a url",
  ])("falls back to a plain <img> for %s", (url) => {
    expect(isOptimisableImage(url)).toBe(false);
  });
});

describe("next.config images", () => {
  const images = nextConfig.images!;

  it("lists exactly this app's UploadThing host, so the optimiser cannot be borrowed", () => {
    expect(images.remotePatterns).toEqual([
      { protocol: "https", hostname: UPLOADTHING_APP_HOST, pathname: "/f/**" },
    ]);
  });

  it("serves one format, so each picture costs as few transformations as possible", () => {
    expect(images.formats).toEqual(["image/webp"]);
  });

  it("never offers a width beyond what a 448px column on a 3x phone needs", () => {
    expect(Math.max(...images.deviceSizes!)).toBeLessThanOrEqual(1440);
  });
});
