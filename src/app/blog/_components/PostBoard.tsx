import Link from "next/link";
import { Flaps } from "@/app/_landing/Flaps";
import type { PostSummary } from "@/lib/blog";
import { boardDate, otherYear } from "./dates";

/**
 * The blog's index as a departures board: one row per post, newest first,
 * its date set on flaps the way a board sets a departure time.
 *
 * The flaps turn over once, on load, cascading down the first rows; that is
 * the page's one authored motion, and it sits inside `prefers-reduced-motion:
 * no-preference` with the rest of `lp-flip`. Each row is a single link, so
 * the whole row is the target, not just its title.
 */
export function PostBoard({ posts }: { posts: PostSummary[] }) {
  const now = new Date();

  return (
    <div className="lp-board overflow-hidden">
      <div
        aria-hidden
        className="hidden grid-cols-[6.5rem_minmax(0,1fr)_9rem_4.5rem] gap-x-6 border-b border-(--board-rule) px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-(--chalk-muted) sm:grid"
      >
        <span>Posted</span>
        <span>Article</span>
        <span>Section</span>
        <span className="text-right">Read</span>
      </div>

      <ol>
        {posts.map((post, index) => {
          const published = post.publishedAt ?? post.updatedAt;
          const year = otherYear(published, now);
          return (
            <li key={post.id} className={index > 0 ? "border-t border-(--board-rule)" : undefined}>
              <Link
                href={`/blog/${post.slug}`}
                className="blog-row grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-4 px-4 py-5 no-underline sm:grid-cols-[6.5rem_minmax(0,1fr)_9rem_4.5rem] sm:gap-x-6 sm:px-6 sm:py-6"
                data-plain
              >
                <span className="pt-1">
                  <time dateTime={published}>
                    <Flaps
                      text={boardDate(published)}
                      cells={6}
                      flip
                      delayMs={Math.min(index, 7) * 70}
                      className="text-[13px] sm:text-[15px]"
                    />
                  </time>
                  {year ? <span className="lp-num mt-1.5 block text-[11px] text-(--chalk-muted)">{year}</span> : null}
                </span>

                <span className="min-w-0">
                  <span className="blog-row-title block font-sarlotte text-[1.4rem] leading-[1.12] text-balance text-(--chalk) sm:text-[1.65rem]">
                    {post.title}
                  </span>
                  {post.excerpt ? (
                    <span className="mt-2 block max-w-[62ch] text-[15px] leading-relaxed text-(--chalk-muted)">
                      {post.excerpt}
                    </span>
                  ) : null}
                  <span className="mt-2.5 flex flex-wrap gap-x-4 text-xs text-(--chalk-muted) sm:hidden">
                    {post.category ? <span>{post.category}</span> : null}
                    <span className="lp-num">{post.readingMinutes} min read</span>
                  </span>
                </span>

                <span className="hidden pt-1.5 text-sm text-(--chalk-soft) sm:block">{post.category || "—"}</span>
                <span className="lp-num hidden pt-1.5 text-right text-sm text-(--chalk-soft) sm:block">
                  {post.readingMinutes} min
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
