import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/brand";
import type { PostSummary } from "@/lib/blog";
import type { RenderedPost } from "@/lib/blog-markdown";
import type { Post } from "@/lib/blog-schema";
import { SPEAKABLE_IDS } from "@/lib/blog-seo";
import { isOptimisableImage } from "@/lib/upload-host";
import { frame } from "./BlogChrome";
import { longDate } from "./dates";

const sectionHeading = "font-sarlotte text-[clamp(1.6rem,3.2vw,1.95rem)] leading-[1.1] tracking-[-0.012em] text-balance";
const smallHeading = "font-sarlotte text-[1.3rem] leading-none";

/**
 * A post on paper. The published page and the staff preview both render
 * this, from the same `renderMarkdown` output, so a preview cannot drift from
 * what goes out.
 *
 * The order is the order a reader, and an answer engine, wants: what the
 * post is, who wrote it and when, the short answer, the takeaways, then the
 * body, the steps, the questions and the sources. On wide screens the left
 * column carries the breadcrumb and a sticky table of contents, like a label
 * column on a ledger; below 1024px the contents fold into one disclosure.
 */
export function Article({
  post,
  rendered,
  related = [],
}: {
  post: Post;
  rendered: RenderedPost;
  related?: PostSummary[];
}) {
  const published = post.publishedAt;
  const updated =
    post.contentUpdatedAt && (!published || new Date(post.contentUpdatedAt) > new Date(published))
      ? post.contentUpdatedAt
      : null;

  return (
    <article className="post-sheet">
      <div className={`${frame} pb-16 pt-10 sm:pt-14 lg:pb-24`}>
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,46rem)] lg:gap-x-14 xl:grid-cols-[15rem_minmax(0,46rem)] xl:gap-x-20">
          <nav aria-label="Breadcrumb" className="text-sm text-(--paper-soft) lg:col-start-1 lg:row-start-1 lg:pt-4">
            <ol className="flex flex-wrap items-center gap-x-2">
              <li>
                <Link href="/blog" className="underline underline-offset-4 hover:text-(--paper-ink)">
                  Blog
                </Link>
              </li>
              {post.category ? (
                <>
                  <li aria-hidden>/</li>
                  <li>{post.category}</li>
                </>
              ) : null}
            </ol>
          </nav>

          <header className="mt-5 lg:col-start-2 lg:row-start-1 lg:mt-0">
            <h1 className="max-w-[22ch] font-sarlotte text-[clamp(2.4rem,5.6vw,4rem)] leading-[0.98] tracking-[-0.02em] text-balance">
              {post.title}
            </h1>
            {post.excerpt ? (
              <p className="mt-5 max-w-[46ch] text-[19px] leading-[1.55] text-(--paper-soft)">{post.excerpt}</p>
            ) : null}

            <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-(--paper-rule) py-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-(--paper-soft)">{post.authorName ? "Written by" : "Published by"}</dt>
                <dd className="mt-1 text-[15px] leading-snug">
                  {post.authorName ? (
                    post.authorUrl ? (
                      <a href={post.authorUrl} rel="author noopener" className="underline underline-offset-4">
                        {post.authorName}
                      </a>
                    ) : (
                      post.authorName
                    )
                  ) : (
                    PRODUCT_NAME
                  )}
                  {post.authorRole ? <span className="block text-[13px] text-(--paper-soft)">{post.authorRole}</span> : null}
                </dd>
              </div>
              {published ? (
                <div>
                  <dt className="text-xs text-(--paper-soft)">Published</dt>
                  <dd className="mt-1 text-[15px]">
                    <time dateTime={published}>{longDate(published)}</time>
                  </dd>
                </div>
              ) : null}
              {updated ? (
                <div>
                  <dt className="text-xs text-(--paper-soft)">Updated</dt>
                  <dd className="mt-1 text-[15px]">
                    <time dateTime={updated}>{longDate(updated)}</time>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-(--paper-soft)">Reading time</dt>
                <dd className="lp-num mt-1 text-[15px]">
                  {rendered.readingMinutes} {rendered.readingMinutes === 1 ? "minute" : "minutes"}
                </dd>
              </div>
            </dl>
          </header>

          {post.coverUrl ? (
            <figure className="mt-10 lg:col-start-2 lg:row-start-2">
              {isOptimisableImage(post.coverUrl) ? (
                <Image
                  src={post.coverUrl}
                  alt={post.coverAlt}
                  width={1600}
                  height={900}
                  sizes="(min-width: 1024px) 46rem, 100vw"
                  priority
                  className="h-auto w-full"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a host next/image is not configured for
                <img src={post.coverUrl} alt={post.coverAlt} fetchPriority="high" className="h-auto w-full" />
              )}
            </figure>
          ) : null}

          {rendered.toc.length > 0 ? (
            <aside className="post-chrome hidden lg:col-start-1 lg:row-start-3 lg:mt-12 lg:block">
              <nav aria-label="On this page" className="sticky top-24">
                <p className="font-sarlotte text-[1.1rem] leading-none">On this page</p>
                <Contents items={rendered.toc} />
              </nav>
            </aside>
          ) : null}

          <div className="mt-10 lg:col-start-2 lg:row-start-3 lg:mt-12">
            {rendered.toc.length > 0 ? (
              <details className="lp-faq post-chrome mb-10 border-y border-(--paper-rule) lg:hidden">
                <summary className="flex items-center justify-between gap-6 py-3.5 text-[15px]">
                  On this page
                  <Plus aria-hidden className="lp-plus size-4 shrink-0" strokeWidth={1.75} />
                </summary>
                <div className="pb-4">
                  <Contents items={rendered.toc} />
                </div>
              </details>
            ) : null}

            {post.answer ? (
              <section
                id={SPEAKABLE_IDS.answer}
                aria-labelledby="short-answer-heading"
                className="border-t border-(--paper-ink) pt-5"
              >
                <h2 id="short-answer-heading" className={smallHeading}>
                  In short
                </h2>
                <p className="mt-3 max-w-[60ch] text-[19px] leading-[1.6]">{post.answer}</p>
              </section>
            ) : null}

            {post.takeaways.length > 0 ? (
              <section id={SPEAKABLE_IDS.takeaways} aria-labelledby="takeaways-heading" className={post.answer ? "mt-10" : ""}>
                <h2 id="takeaways-heading" className={smallHeading}>
                  Key takeaways
                </h2>
                <ul className="mt-4 border-t border-(--paper-rule)">
                  {post.takeaways.map((item) => (
                    <li key={item} className="border-b border-(--paper-rule)/70 py-3 text-[16px] leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div
              className={`post-body ${post.answer || post.takeaways.length > 0 ? "mt-12" : ""}`}
              dangerouslySetInnerHTML={{ __html: rendered.html }}
            />

            {post.steps.length > 0 ? (
              <section aria-labelledby="steps-heading" className="mt-16">
                <h2 id="steps-heading" className={sectionHeading}>
                  Step by step
                </h2>
                <ol className="mt-5 border-t border-(--paper-rule)">
                  {post.steps.map((step, index) => (
                    <li
                      key={`${index}-${step.name}`}
                      id={`step-${index + 1}`}
                      className="grid scroll-mt-24 grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 border-b border-(--paper-rule)/70 py-5"
                    >
                      <span aria-hidden className="lp-num font-sarlotte text-[1.7rem] leading-none">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="text-[17px] font-semibold leading-snug">{step.name}</h3>
                        <p className="mt-1.5 max-w-[60ch] text-[16px] leading-relaxed text-(--paper-soft)">{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {post.faq.length > 0 ? (
              <section id="faq" aria-labelledby="faq-heading" className="mt-16 scroll-mt-24">
                <h2 id="faq-heading" className={sectionHeading}>
                  Questions
                </h2>
                <div className="mt-5 border-t border-(--paper-rule)">
                  {post.faq.map((item) => (
                    <details key={item.q} className="lp-faq border-b border-(--paper-rule)">
                      <summary className="flex items-start justify-between gap-6 py-4 text-[17px] font-medium leading-snug">
                        {item.q}
                        <Plus aria-hidden className="lp-plus mt-0.5 size-5 shrink-0 text-(--pin-ink)" strokeWidth={1.75} />
                      </summary>
                      <p className="max-w-[62ch] pb-5 text-[16px] leading-relaxed text-(--paper-soft)">{item.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}

            {post.sources.length > 0 ? (
              <section aria-labelledby="sources-heading" className="mt-16">
                <h2 id="sources-heading" className={sectionHeading}>
                  Sources
                </h2>
                <ol className="mt-5 border-t border-(--paper-rule)">
                  {post.sources.map((source, index) => (
                    <li
                      key={`${index}-${source.url}`}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] border-b border-(--paper-rule)/70 py-3 text-[15px] leading-relaxed"
                    >
                      <span className="lp-num text-(--paper-soft)">{index + 1}.</span>
                      <span>
                        <a href={source.url} rel="noopener" className="text-(--pin-ink) underline underline-offset-4">
                          {source.title}
                        </a>
                        {source.publisher ? <span className="text-(--paper-soft)">, {source.publisher}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="post-chrome border-t border-(--paper-rule)">
          <div className={`${frame} py-12 sm:py-16`}>
            <div className="lg:grid lg:grid-cols-[13rem_minmax(0,46rem)] lg:gap-x-14 xl:grid-cols-[15rem_minmax(0,46rem)] xl:gap-x-20">
              <h2 id="related-heading" className="font-sarlotte text-[1.5rem] leading-none lg:pt-1">
                Keep reading
              </h2>
              <ul className="mt-6 border-t border-(--paper-rule) lg:mt-0">
                {related.map((item) => (
                  <li key={item.id} className="border-b border-(--paper-rule)/70">
                    <Link
                      href={`/blog/${item.slug}`}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 py-4"
                    >
                      <span className="font-sarlotte text-[1.3rem] leading-snug text-balance group-hover:underline group-hover:underline-offset-4">
                        {item.title}
                      </span>
                      <span className="lp-num text-sm text-(--paper-soft)">{item.readingMinutes} min</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </article>
  );
}

function Contents({ items }: { items: RenderedPost["toc"] }) {
  return (
    <ol className="mt-3 space-y-1.5 text-[14px] leading-snug">
      {items.map((item) => (
        <li key={item.id} className={item.level === 3 ? "pl-3.5" : undefined}>
          <a
            href={`#${item.id}`}
            className={`underline-offset-4 hover:text-(--paper-ink) hover:underline ${
              item.level === 3 ? "text-(--paper-soft)" : "text-(--paper-ink)"
            }`}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );
}
