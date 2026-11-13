import type { NextConfig } from "next";
import { UPLOADTHING_APP_HOST } from "./src/lib/upload-host";
import { securityHeaders } from "./src/lib/csp";
import { isStagingDeploy } from "./src/lib/staging";

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
  // Security headers on every response: framing limited to this origin,
  // nosniff, HSTS with subdomains, and the Content Security Policy, which is
  // report-only until a clean week of reports. See src/lib/csp.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...securityHeaders({
            dev: process.env.NODE_ENV === "development",
            preview: isStagingDeploy(),
          }),
          // Staging (every preview) is never indexed. Vercel adds this to its
          // own preview URLs, but not to a custom domain like staging's.
          ...(isStagingDeploy() ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
        ],
      },
    ];
  },
  partialPrefetching: true,
  // A blog post's Markdown copy lives at its address plus `.md`, the llms.txt
  // convention. A dynamic segment cannot end in a fixed suffix, so the route
  // is `/blog/{slug}/md` and this maps the conventional address onto it.
  async rewrites() {
    return [{ source: "/blog/:slug.md", destination: "/blog/:slug/md" }];
  },
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
