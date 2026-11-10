import type { Metadata } from "next";
import { CODE_ORIGIN, COMPANY_NAME, MAIN_SITE, PRODUCT_NAME } from "@/lib/brand";
import {
  BLOG_TARGETS,
  countWords,
  postUrl,
  slugify,
  type Post,
  type PostFields,
} from "@/lib/blog-schema";
import type { RenderedPost } from "@/lib/blog-markdown";

/**
 * Everything a post says about itself to machines: the page metadata, the
 * structured data, and the checklist the editor shows while it is written.
 *
 * Pure. The page, the feed and the editor all read these, so the preview's
 * search result is the one the post is published with.
 *
 * - Search engines read the title, description, canonical address and robots
 *   rules, and the BlogPosting, BreadcrumbList and FAQPage data.
 * - Answer engines (featured snippets, voice) read the short answer, named as
 *   `abstract` and marked `speakable`, and the FAQ.
 * - Generative engines read all of that plus the sources (`citation`), the
 *   entities the post is `about`, and a clean Markdown copy linked from the
 *   page and from llms.txt.
 */

export const BLOG_PATH = "/blog";
export const BLOG_URL = `${CODE_ORIGIN}${BLOG_PATH}`;
export const FEED_URL = `${BLOG_URL}/rss.xml`;
export const BLOG_NAME = `The ${PRODUCT_NAME} blog`;
export const BLOG_DESCRIPTION =
  "Guides to printing QR codes that keep working: sizing, placement, packaging, menus, tracking, and changing where a code points after it is printed.";
export const LANGUAGE = "en-NG";

const ORG_ID = `${CODE_ORIGIN}/#organization`;
const WEBSITE_ID = `${CODE_ORIGIN}/#website`;
const BLOG_ID = `${BLOG_URL}#blog`;

type Publishable = PostFields & Pick<Post, "publishedAt" | "contentUpdatedAt" | "updatedAt">;

// ---------------------------------------------------------------------------
// What the post is called where
// ---------------------------------------------------------------------------

/** The `<title>`: exactly what staff wrote for search, or the headline with the product name. */
export function searchTitle(post: Pick<PostFields, "seoTitle" | "title">): string {
  return post.seoTitle || `${post.title} · ${PRODUCT_NAME}`;
}

export function searchDescription(post: Pick<PostFields, "metaDescription" | "excerpt">): string {
  return post.metaDescription || post.excerpt;
}

export function canonicalUrl(post: Pick<PostFields, "canonicalUrl" | "slug">): string {
  return post.canonicalUrl || postUrl(post.slug);
}

/** The Markdown copy, for LLMs: the llms.txt convention of the page's address plus `.md`. */
export function markdownUrl(slug: string): string {
  return `${postUrl(slug)}.md`;
}

/**
 * The generated social card. The version is the last save, so a platform
 * that has cached the old card fetches the new one after an edit.
 */
export function cardUrl(post: Pick<Post, "slug" | "updatedAt">): string {
  const version = Math.floor(new Date(post.updatedAt).getTime() / 1000).toString(36);
  return `${postUrl(post.slug)}/card?v=${version}`;
}

export function socialImage(post: Pick<Post, "slug" | "updatedAt" | "ogImageUrl" | "coverAlt" | "title">) {
  return post.ogImageUrl
    ? { url: post.ogImageUrl, alt: post.coverAlt || post.title }
    : { url: cardUrl(post), width: 1200, height: 630, alt: post.title };
}

/** The date a reader is told the post was last changed in substance. */
export function modifiedAt(post: Pick<Post, "publishedAt" | "contentUpdatedAt">): string | null {
  return post.contentUpdatedAt ?? post.publishedAt;
}

// ---------------------------------------------------------------------------
// Page metadata
// ---------------------------------------------------------------------------

export function postMetadata(post: Publishable): Metadata {
  const title = searchTitle(post);
  const description = searchDescription(post);
  const canonical = canonicalUrl(post);
  const image = socialImage(post);
  const published = post.publishedAt ?? undefined;
  const modified = modifiedAt(post) ?? undefined;
  const keywords = [post.focusKeyword, ...post.keywords].filter(Boolean);

  return {
    title: { absolute: title },
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    authors: post.authorName ? [{ name: post.authorName, url: post.authorUrl || undefined }] : undefined,
    category: post.category || undefined,
    alternates: {
      canonical,
      types: {
        "application/rss+xml": [{ url: FEED_URL, title: BLOG_NAME }],
        "text/markdown": [{ url: markdownUrl(post.slug), title: `${post.title} (Markdown)` }],
      },
    },
    robots: post.noindex
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
    // Next merges `openGraph` shallowly, so this is the whole object, not a patch.
    openGraph: {
      type: "article",
      url: canonical,
      siteName: PRODUCT_NAME,
      locale: "en_NG",
      title: post.ogTitle || post.seoTitle || post.title,
      description: post.ogDescription || description,
      publishedTime: published,
      modifiedTime: modified,
      authors: post.authorName ? [post.authorUrl || post.authorName] : undefined,
      section: post.category || undefined,
      tags: post.tags.length > 0 ? post.tags : undefined,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: post.ogTitle || post.seoTitle || post.title,
      description: post.ogDescription || description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}

export function blogIndexMetadata(): Metadata {
  return {
    title: { absolute: `Blog · ${PRODUCT_NAME}` },
    description: BLOG_DESCRIPTION,
    alternates: {
      canonical: BLOG_URL,
      types: { "application/rss+xml": [{ url: FEED_URL, title: BLOG_NAME }] },
    },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    openGraph: {
      type: "website",
      url: BLOG_URL,
      siteName: PRODUCT_NAME,
      locale: "en_NG",
      title: BLOG_NAME,
      description: BLOG_DESCRIPTION,
    },
    twitter: { card: "summary_large_image", title: BLOG_NAME, description: BLOG_DESCRIPTION },
  };
}

// ---------------------------------------------------------------------------
// Structured data (JSON-LD)
// ---------------------------------------------------------------------------

type Node = Record<string, unknown>;

/** Drop empty strings, empty arrays and undefined, so a node says only what is known. */
function compact<T extends Node>(node: T): T {
  const out: Node = {};
  for (const [name, value] of Object.entries(node)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[name] = value;
  }
  return out as T;
}

function organization(): Node {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: PRODUCT_NAME,
    url: CODE_ORIGIN,
    logo: { "@type": "ImageObject", url: `${CODE_ORIGIN}/brand/qriate-wordmark.svg` },
    parentOrganization: { "@type": "Organization", name: COMPANY_NAME, url: MAIN_SITE },
  };
}

function website(): Node {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: PRODUCT_NAME,
    url: CODE_ORIGIN,
    inLanguage: LANGUAGE,
    publisher: { "@id": ORG_ID },
  };
}

function blog(extra: Node = {}): Node {
  return {
    "@type": "Blog",
    "@id": BLOG_ID,
    name: BLOG_NAME,
    url: BLOG_URL,
    description: BLOG_DESCRIPTION,
    inLanguage: LANGUAGE,
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
    ...extra,
  };
}

function breadcrumbs(trail: { name: string; url: string }[]): Node {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/** Which blocks of the page the short answer and takeaways render into. */
export const SPEAKABLE_IDS = { answer: "short-answer", takeaways: "key-takeaways" } as const;

export function postJsonLd(post: Publishable, rendered: Pick<RenderedPost, "words" | "readingMinutes">): Node {
  const url = canonicalUrl(post);
  const image = socialImage(post);
  const keywords = [post.focusKeyword, ...post.keywords].filter(Boolean);
  const speakable = [
    post.answer ? `#${SPEAKABLE_IDS.answer}` : null,
    post.takeaways.length > 0 ? `#${SPEAKABLE_IDS.takeaways}` : null,
  ].filter((selector): selector is string => selector !== null);

  const author = post.authorName
    ? compact({
        "@type": "Person",
        name: post.authorName,
        jobTitle: post.authorRole || undefined,
        url: post.authorUrl || undefined,
        worksFor: { "@id": ORG_ID },
      })
    : { "@id": ORG_ID };

  const article = compact({
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: post.title.slice(0, 110),
    name: post.title,
    description: searchDescription(post) || undefined,
    abstract: post.answer || undefined,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: [post.coverUrl, image.url].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index),
    datePublished: post.publishedAt ?? undefined,
    dateModified: modifiedAt(post) ?? undefined,
    author,
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": BLOG_ID },
    articleSection: post.category || undefined,
    keywords: keywords.length > 0 ? keywords.join(", ") : undefined,
    about: post.about.map((name) => ({ "@type": "Thing", name })),
    citation: post.sources.map((source) =>
      compact({
        "@type": "CreativeWork",
        name: source.title,
        url: source.url,
        publisher: source.publisher ? { "@type": "Organization", name: source.publisher } : undefined,
      })
    ),
    wordCount: rendered.words,
    timeRequired: `PT${rendered.readingMinutes}M`,
    inLanguage: LANGUAGE,
    speakable: speakable.length > 0 ? { "@type": "SpeakableSpecification", cssSelector: speakable } : undefined,
  });

  const graph: Node[] = [
    organization(),
    website(),
    blog(),
    article,
    breadcrumbs([
      { name: PRODUCT_NAME, url: CODE_ORIGIN },
      { name: "Blog", url: BLOG_URL },
      { name: post.title, url },
    ]),
  ];

  if (post.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      inLanguage: LANGUAGE,
      mainEntity: post.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }

  if (post.steps.length > 0) {
    graph.push(
      compact({
        "@type": "HowTo",
        "@id": `${url}#steps`,
        name: post.title,
        description: post.answer || searchDescription(post) || undefined,
        inLanguage: LANGUAGE,
        step: post.steps.map((item, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          name: item.name,
          text: item.text,
          url: `${url}#step-${index + 1}`,
        })),
      })
    );
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

export function blogIndexJsonLd(
  posts: Pick<Post, "slug" | "title" | "excerpt" | "metaDescription" | "publishedAt" | "contentUpdatedAt">[]
): Node {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organization(),
      website(),
      blog({
        blogPost: posts.map((post) =>
          compact({
            "@type": "BlogPosting",
            headline: post.title.slice(0, 110),
            url: postUrl(post.slug),
            description: searchDescription(post) || undefined,
            datePublished: post.publishedAt ?? undefined,
            dateModified: modifiedAt(post) ?? undefined,
          })
        ),
      }),
      {
        "@type": "ItemList",
        itemListElement: posts.map((post, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: postUrl(post.slug),
          name: post.title,
        })),
      },
      breadcrumbs([
        { name: PRODUCT_NAME, url: CODE_ORIGIN },
        { name: "Blog", url: BLOG_URL },
      ]),
    ],
  };
}

/**
 * JSON for a `<script type="application/ld+json">`. Escaping `<` keeps a
 * title containing `</script>` from closing the tag early.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// ---------------------------------------------------------------------------
// The editor's checklist
// ---------------------------------------------------------------------------

export type CheckGroup = "Search" | "Answer engines" | "Readers";

export type Check = {
  id: string;
  group: CheckGroup;
  label: string;
  pass: boolean;
  /** What was measured, or what to do: shown beside the item. */
  detail: string;
};

function normalise(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim();
}

function contains(haystack: string, needle: string): boolean {
  return needle !== "" && normalise(haystack).includes(normalise(needle));
}

function within(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * How well a post is set up to be found, answered from and quoted. Guidance
 * only: nothing here blocks a save or a publish, because a short news post
 * can rightly fail the length check.
 */
export function auditPost(post: PostFields, rendered: RenderedPost): Check[] {
  const title = searchTitle(post);
  const description = searchDescription(post);
  const keyword = post.focusKeyword.trim();
  const noKeyword = "Set a focus keyword first.";
  const answerWords = countWords(post.answer);
  const headingText = rendered.headings.filter((h) => h.level === 2 || h.level === 3).map((h) => h.text);
  const missingAlt = rendered.images.filter((image) => !image.alt.trim()).length + (post.coverUrl && !post.coverAlt ? 1 : 0);
  const imageCount = rendered.images.length + (post.coverUrl ? 1 : 0);

  let skipped = false;
  let previous = 1;
  for (const heading of rendered.headings) {
    if (heading.level > previous + 1) skipped = true;
    previous = heading.level;
  }

  const internalLinks = rendered.links.filter((link) => link.internal).length;
  const t = BLOG_TARGETS;
  // The editor counts rows as they are typed; a blank row is not an entry.
  const takeaways = post.takeaways.filter((item) => item.trim()).length;
  const faq = post.faq.filter((item) => item.q.trim() && item.a.trim()).length;
  const sources = post.sources.filter((item) => item.url.trim()).length;

  const checks: Check[] = [
    {
      id: "title-length",
      group: "Search",
      label: `Search title is ${t.seoTitle.min}–${t.seoTitle.max} characters`,
      pass: within(title.length, t.seoTitle.min, t.seoTitle.max),
      detail: `${title.length} characters`,
    },
    {
      id: "description-length",
      group: "Search",
      label: `Search description is ${t.metaDescription.min}–${t.metaDescription.max} characters`,
      pass: within(description.length, t.metaDescription.min, t.metaDescription.max),
      detail: description ? `${description.length} characters` : "None yet. The summary is used when this is empty.",
    },
    {
      id: "keyword",
      group: "Search",
      label: "A focus keyword is set",
      pass: keyword !== "",
      detail: keyword ? `“${keyword}”` : "The phrase you most want this post found for.",
    },
    {
      id: "keyword-title",
      group: "Search",
      label: "Focus keyword is in the search title",
      pass: contains(title, keyword),
      detail: keyword ? (contains(title, keyword) ? "Found" : "Not found") : noKeyword,
    },
    {
      id: "keyword-description",
      group: "Search",
      label: "Focus keyword is in the search description",
      pass: contains(description, keyword),
      detail: keyword ? (contains(description, keyword) ? "Found" : "Not found") : noKeyword,
    },
    {
      id: "keyword-slug",
      group: "Search",
      label: "Focus keyword is in the address",
      pass: keyword !== "" && post.slug.includes(slugify(keyword)),
      detail: keyword ? `/blog/${post.slug || "…"}` : noKeyword,
    },
    {
      id: "keyword-intro",
      group: "Search",
      label: "Focus keyword is in the first paragraph",
      pass: contains(rendered.firstParagraph, keyword),
      detail: keyword
        ? rendered.firstParagraph
          ? contains(rendered.firstParagraph, keyword)
            ? "Found"
            : "Not found"
          : "The body has no paragraph yet."
        : noKeyword,
    },
    {
      id: "keyword-heading",
      group: "Search",
      label: "Focus keyword is in a subheading",
      pass: headingText.some((heading) => contains(heading, keyword)),
      detail: keyword ? `${headingText.length} subheadings` : noKeyword,
    },
    {
      id: "internal-link",
      group: "Search",
      label: "Links to another page on this site",
      pass: internalLinks > 0,
      detail: internalLinks > 0 ? `${internalLinks} ${internalLinks === 1 ? "link" : "links"}` : "Link to a related post, /pricing, or the home page.",
    },
    {
      id: "image-alt",
      group: "Search",
      label: "Every image is described",
      pass: missingAlt === 0,
      detail: imageCount === 0 ? "No images" : missingAlt === 0 ? `${imageCount} described` : `${missingAlt} missing a description`,
    },
    {
      id: "answer",
      group: "Answer engines",
      label: `Short answer is ${t.answerWords.min}–${t.answerWords.max} words`,
      pass: within(answerWords, t.answerWords.min, t.answerWords.max),
      detail: post.answer ? `${answerWords} words` : "The direct answer to the question in the title.",
    },
    {
      id: "takeaways",
      group: "Answer engines",
      label: `${t.takeaways.min} to ${t.takeaways.max} key takeaways`,
      pass: within(takeaways, t.takeaways.min, t.takeaways.max),
      detail: `${takeaways} so far`,
    },
    {
      id: "faq",
      group: "Answer engines",
      label: `At least ${t.faq.min} questions answered`,
      pass: faq >= t.faq.min,
      detail: `${faq} so far`,
    },
    {
      id: "sources",
      group: "Answer engines",
      label: "Cites at least one source",
      pass: sources > 0,
      detail: sources > 0 ? `${sources} cited` : "Where the facts in the post come from.",
    },
    {
      id: "length",
      group: "Readers",
      label: `At least ${t.words.min} words`,
      pass: rendered.words >= t.words.min,
      detail: `${rendered.words} words, ${rendered.readingMinutes} min read`,
    },
    {
      id: "no-h1",
      group: "Readers",
      label: "No second headline in the body",
      pass: !rendered.headings.some((heading) => heading.level === 1),
      detail: rendered.headings.some((heading) => heading.level === 1)
        ? "Use ## for sections. The title is already the page’s one # heading."
        : "Sections start at ##",
    },
    {
      id: "heading-order",
      group: "Readers",
      label: "Heading levels run in order",
      pass: !skipped,
      detail: skipped ? "A heading skips a level, such as ## then ####." : "No levels skipped",
    },
    {
      id: "author",
      group: "Readers",
      label: "Names its author",
      pass: post.authorName.trim() !== "",
      detail: post.authorName || "A named author makes advice easier to trust.",
    },
  ];

  return checks;
}
