import type { NextConfig } from "next";
import { UPLOADTHING_APP_HOST } from "./src/lib/upload-host";

const nextConfig: NextConfig = {
  // Dev only. Needed to open the app from a phone on the same network, which
  // is the only way to test a real camera scan before there is a public host.
  // Next blocks cross-origin access to dev resources (HMR) by default.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.171"],
  /* config options here */
  cacheComponents: true,
  // Hosted pages serve customers' photos to phones, often on metered mobile
  // data. Uploads can be 4MB each; through the optimiser a phone gets a WebP
  // sized to its screen instead, usually a few hundred KB.
  images: {
    // Only this app's own UploadThing files. See src/lib/upload-host.ts.
    remotePatterns: [{ protocol: "https", hostname: UPLOADTHING_APP_HOST, pathname: "/f/**" }],
    // WebP only. AVIF is smaller but slow to encode, and every format doubles
    // the transformations a page costs.
    formats: ["image/webp"],
    // Pages are one column no wider than 28rem (448px), so nothing needs more
    // than 1080 wide even on a 3x phone. Fewer sizes, fewer transformations.
    deviceSizes: [384, 640, 828, 1080],
    imageSizes: [64, 128, 256],
    // A file's URL is its UploadThing key, which never points at new bytes,
    // so a resized copy can be kept for the maximum Vercel allows.
    minimumCacheTTL: 2_678_400,
    // Uploads are capped at 4MB; refuse anything far beyond that.
    maximumResponseBody: 5_000_000,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
