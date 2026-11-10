import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { listPublicPosts, type PostSummary } from "@/lib/blog";
import { FEED_URL, blogIndexJsonLd, blogIndexMetadata, jsonLdScript } from "@/lib/blog-seo";
import { BlogFooter, BlogHeader, frame } from "./_components/BlogChrome";
import { PostBoard } from "./_components/PostBoard";

export const metadata: Metadata = blogIndexMetadata();

/**
 * The blog's index: every public post, newest first, on the board.
 *
 * Read per request, like `/pricing`, so a post staff publish is listed on the
 * next load and `next build` never needs the database. A failed read shows
 * the page with no rows and says so, rather than an error.
 */
export const instant = false;

export default async function BlogIndex() {
  await connection();
  let posts: PostSummary[] = [];
  let failed = false;
  try {
    posts = await listPublicPosts();
  } catch (error) {
    console.error("[blog] could not list posts", error);
    failed = true;
  }

  return (
    <div className="lp min-h-dvh">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(blogIndexJsonLd(posts)) }} />
      <BlogHeader current="index" />

      <main className={`${frame} pb-20 pt-14 sm:pt-20 lg:pb-28 lg:pt-24`}>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
          <div>
            <h1 className="max-w-[16ch] font-sarlotte text-[clamp(2.75rem,6.4vw,5.25rem)] leading-[0.94] tracking-[-0.02em] text-balance">
              Printing QR codes that keep working
            </h1>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-(--chalk-soft)">
              Sizing, placement, packaging, menus and tracking, and how to change where a code points after it is
              printed.
            </p>
          </div>
          <a
            href={FEED_URL}
            className="text-sm text-(--chalk-soft) underline transition-colors duration-150 hover:text-(--chalk)"
          >
            Follow with RSS
          </a>
        </div>

        <div className="mt-12 sm:mt-16">
          {posts.length > 0 ? (
            <PostBoard posts={posts} />
          ) : (
            <div className="lp-board px-6 py-10 sm:px-8">
              <p className="font-sarlotte text-[1.6rem] leading-tight">
                {failed ? "The posts could not be loaded just now." : "Nothing posted yet."}
              </p>
              <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-(--chalk-muted)">
                {failed ? "Reload the page in a minute. " : "The first guide is on its way. "}
                In the meantime,{" "}
                <Link href="/" className="text-(--chalk) underline">
                  see how a dynamic code works
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </main>

      <BlogFooter />
    </div>
  );
}
