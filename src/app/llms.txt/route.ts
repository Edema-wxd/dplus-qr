import { connection } from "next/server";
import { listPublicPlans } from "@/lib/plans";
import { groupTiers, type Tier } from "@/lib/plan-tiers";
import { llmsTxt, type LlmsPost } from "@/lib/llms-txt";
import { listPublicPosts } from "@/lib/blog";

/**
 * Serves /llms.txt, read per request so its prices are the ones checkout
 * charges and its blog list is the one the site shows. A failed read still
 * serves the file, minus the figures or the posts.
 *
 * `llms` is in RESERVED_CODES, and a generated code never contains a dot, so
 * this path cannot collide with a printed code.
 */
export async function GET() {
  await connection();
  let tiers: Tier[] | null = null;
  try {
    tiers = groupTiers(await listPublicPlans());
  } catch {
    tiers = null;
  }
  // The latest posts a model may read and cite. Indexed, self-canonical
  // posts only, the same set the sitemap lists.
  let posts: LlmsPost[] = [];
  try {
    posts = (await listPublicPosts(20))
      .filter((post) => !post.noindex && !post.canonicalUrl)
      .map((post) => ({ title: post.title, slug: post.slug, summary: post.metaDescription || post.excerpt }));
  } catch {
    posts = [];
  }
  return new Response(llmsTxt(tiers, posts), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
