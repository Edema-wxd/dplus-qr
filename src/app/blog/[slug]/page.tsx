import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { PRODUCT_NAME } from "@/lib/brand";
import { getPublicPost, relatedPosts, type PostSummary } from "@/lib/blog";
import { renderMarkdown } from "@/lib/blog-markdown";
import { SLUG_PATTERN } from "@/lib/blog-schema";
import { jsonLdScript, postJsonLd, postMetadata } from "@/lib/blog-seo";
import { Article } from "../_components/Article";
import { BlogFooter, BlogHeader, frame } from "../_components/BlogChrome";

/**
 * One read per request, shared by the metadata and the page. An address that
 * cannot be a slug is answered without asking the database.
 */
const load = cache(async (slug: string) => {
  if (!SLUG_PATTERN.test(slug)) return null;
  return getPublicPost(slug);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  try {
    const found = await load(slug);
    if (found && "post" in found) return postMetadata(found.post);
  } catch {
    // The page reports the failure; metadata must not fail it twice.
  }
  return {};
}

/**
 * A published post.
 *
 * Read per request, like `/pricing`: an edit is live on the next load, a
 * scheduled post appears the moment its date passes, and `next build` needs
 * no database. Drafts, scheduled posts and unknown addresses get the site's
 * ordinary 404. An address the post used to have answers with a permanent
 * redirect to where it lives now, so links and rankings survive a rename.
 */
export const instant = false;

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const found = await load(slug);
  if (!found) notFound();
  if ("movedTo" in found) permanentRedirect(`/blog/${found.movedTo}`);

  const { post } = found;
  const rendered = renderMarkdown(post.bodyMd);
  let related: PostSummary[] = [];
  try {
    related = await relatedPosts(post);
  } catch (error) {
    // Related posts are a courtesy; the post itself still renders.
    console.error("[blog] could not read related posts", error);
  }

  return (
    <div className="lp min-h-dvh">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(postJsonLd(post, rendered)) }} />
      <BlogHeader current="post" />

      <main>
        <Article post={post} rendered={rendered} related={related} />

        <section aria-labelledby="closing-heading" className="post-chrome">
          <div className={`${frame} grid gap-8 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:py-24`}>
            <div>
              <h2
                id="closing-heading"
                className="max-w-[20ch] font-sarlotte text-[clamp(2rem,4.4vw,3.25rem)] leading-[1.02] tracking-[-0.015em] text-balance"
              >
                Print the code once. Change where it points whenever you need to.
              </h2>
              <p className="mt-4 max-w-[46ch] text-[17px] leading-relaxed text-(--chalk-soft)">
                A {PRODUCT_NAME} code is dynamic: the symbol on the print stays the same, and you choose where it leads
                from your dashboard.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/auth/sign-up" className="lp-btn lp-btn-cyan px-5 py-3.5 text-xl leading-none" data-plain>
                Create a code
              </Link>
              <Link href="/pricing" className="lp-btn lp-btn-line px-5 py-3.5 text-xl leading-none text-(--chalk)" data-plain>
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <BlogFooter />
    </div>
  );
}
