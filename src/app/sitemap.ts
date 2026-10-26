import type { MetadataRoute } from "next";
import { CODE_ORIGIN } from "@/lib/brand";
import { LEGAL_PAGES } from "@/lib/legal";

/**
 * Serves /sitemap.xml.
 *
 * The landing page, the pricing page and the three legal documents,
 * deliberately and only those.
 * Listing sign-in, sign-up or any status page would invite a crawler into pages
 * that exist for one person at one moment; the legal pages are the opposite --
 * they are meant to be found by a customer checking the refund position before
 * paying, and by a payment provider's review.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: CODE_ORIGIN,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${CODE_ORIGIN}/pricing`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...LEGAL_PAGES.map((page) => ({
      url: `${CODE_ORIGIN}${page.href}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
