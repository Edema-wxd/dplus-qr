import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only. Needed to open the app from a phone on the same network, which
  // is the only way to test a real camera scan before there is a public host.
  // Next blocks cross-origin access to dev resources (HMR) by default.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.171"],
  /* config options here */
  cacheComponents: true,
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
