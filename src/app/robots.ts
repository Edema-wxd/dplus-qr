import type { MetadataRoute } from "next";
import { CODE_HOST, CODE_ORIGIN } from "@/lib/brand";
import { isStagingDeploy } from "@/lib/staging";

/**
 * Serves /robots.txt.
 *
 * The landing page, pricing, the legal pages and the blog are the things on
 * this host that should be indexed. Everything else is either a client's
 * private account or a transient state of someone else's printed material,
 * and a short code is nobody's business but the person holding the print — so
 * crawlers are kept out of those. The root layout's `noindex` is the belt; this
 * is the braces. `/blog` needs no rule of its own: it is under `allow: "/"`,
 * and each blog page opts back in to indexing in its own metadata.
 *
 * `/robots` and `/sitemap` are already in RESERVED_CODES, and a generated code
 * can never contain a dot, so neither path can collide with a printed code.
 */
const DISALLOW = [
  "/auth/",
  "/account",
  "/api/",
  "/report",
  "/paused",
  "/blocked",
  "/unavailable",
  "/not-found-code",
];

/**
 * AI crawlers named outright, so the welcome is unambiguous. They get the same
 * disallow list as `*`, not a bare `Allow: /`: a crawler obeys only the most
 * specific group that names it, so a group of their own without the list
 * would open the sign-in and status pages to exactly these bots.
 */
const AI_CRAWLERS = [
  "ClaudeBot",
  "GPTBot",
  "OAI-SearchBot",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  // Staging is test data on a public address: no crawler, anywhere.
  if (isStagingDeploy()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${CODE_ORIGIN}/sitemap.xml`,
    // `Host` takes a bare hostname, not an origin.
    host: CODE_HOST,
  };
}
