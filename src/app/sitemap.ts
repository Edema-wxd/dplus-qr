import type { MetadataRoute } from "next";
import { CODE_ORIGIN } from "@/lib/brand";

/**
 * Serves /sitemap.xml.
 *
 * One entry, deliberately. Listing sign-in, sign-up or any status page would
 * invite a crawler into pages that exist for one person at one moment.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: CODE_ORIGIN,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
