import type { MetadataRoute } from "next";
import { CODE_ORIGIN } from "@/lib/brand";

/**
 * Serves /robots.txt.
 *
 * The landing page is the only thing on this host that should be indexed.
 * Everything else is either a client's private account or a transient state of
 * someone else's printed material, and a short code is nobody's business but
 * the person holding the print — so crawlers are pointed at `/` and kept out of
 * the rest. The root layout's `noindex` is the belt; this is the braces.
 *
 * `/robots` and `/sitemap` are already in RESERVED_CODES, and a generated code
 * can never contain a dot, so neither path can collide with a printed code.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/auth/",
          "/account",
          "/api/",
          "/report",
          "/paused",
          "/blocked",
          "/unavailable",
          "/not-found-code",
        ],
      },
    ],
    sitemap: `${CODE_ORIGIN}/sitemap.xml`,
    host: CODE_ORIGIN,
  };
}
