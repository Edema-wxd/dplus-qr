import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { CODE_ORIGIN } from "@/lib/brand";
import { LEGAL_PAGES } from "@/lib/legal";
import { listPublicPosts, type PostSummary } from "@/lib/blog";
import { postUrl } from "@/lib/blog-schema";

/**
 * Serves /sitemap.xml.
 *
 * The landing page, the pricing page, the three legal documents and the blog,
 * deliberately and only those.
 * Listing sign-in, sign-up or any status page would invite a crawler into pages
 * that exist for one person at one moment; the legal pages are the opposite --
 * they are meant to be found by a customer checking the refund position before
 * paying, and by a payment provider's review.
 *
 * Blog posts are read per request, so a post appears here the moment it is
 * public. A post kept out of search, or one whose canonical copy lives on
 * another site, is left out: a sitemap lists the pages this site wants
 * indexed as its own. If the read fails, the fixed pages are still served.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  let posts: PostSummary[] = [];
  try {
    posts = await listPublicPosts(1000);
  } catch (error) {
    console.error("[sitemap] could not list blog posts", error);
  }

  const indexed = posts.filter((post) => !post.noindex && !post.canonicalUrl);
  const newest = indexed[0];

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
    {
      url: `${CODE_ORIGIN}/blog`,
      lastModified: newest ? new Date(newest.contentUpdatedAt ?? newest.publishedAt ?? newest.updatedAt) : undefined,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...indexed.map((post) => ({
      url: postUrl(post.slug),
      lastModified: new Date(post.contentUpdatedAt ?? post.publishedAt ?? post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
      images: post.coverUrl ? [post.coverUrl] : undefined,
    })),
    ...LEGAL_PAGES.map((page) => ({
      url: `${CODE_ORIGIN}${page.href}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
