import { z } from "zod";
import { CODE_ORIGIN } from "@/lib/brand";

/**
 * A blog post's fields, their limits and their validation.
 *
 * Pure, with no database import, so the editor in the browser checks a post
 * against exactly the rules the server saves it under (the same split as
 * `pricing-content.ts` and `site-content.ts`). `src/lib/blog.ts` holds the SQL.
 *
 * Optional text is an empty string here and `null` in the database; the
 * mapping is done once, in `blog.ts`, so forms never juggle nulls.
 */

/** Hard limits: past these a save is refused. */
export const BLOG_LIMITS = {
  slug: 80,
  title: 120,
  excerpt: 300,
  body: 200_000,
  seoTitle: 70,
  metaDescription: 200,
  focusKeyword: 80,
  keyword: 60,
  keywords: 12,
  url: 500,
  ogTitle: 120,
  ogDescription: 300,
  coverAlt: 200,
  answer: 800,
  takeaway: 240,
  takeaways: 7,
  faqQuestion: 200,
  faqAnswer: 1500,
  faq: 12,
  stepName: 120,
  stepText: 1000,
  steps: 15,
  sourceTitle: 200,
  publisher: 120,
  sources: 20,
  aboutItem: 80,
  about: 10,
  authorName: 80,
  authorRole: 120,
  category: 60,
  tag: 40,
  tags: 12,
} as const;

/**
 * Ranges that read well in a search result or an answer box. Guidance only:
 * the editor's counters and the checklist use them, a save never does.
 */
export const BLOG_TARGETS = {
  seoTitle: { min: 30, max: 60 },
  metaDescription: { min: 70, max: 160 },
  answerWords: { min: 40, max: 60 },
  takeaways: { min: 3, max: 5 },
  faq: { min: 2 },
  words: { min: 600 },
} as const;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type FaqItem = { q: string; a: string };
export type Step = { name: string; text: string };
export type Source = { title: string; url: string; publisher: string };

/** Everything staff write. The same shape for the editor, an import and a save. */
export type PostFields = {
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  seoTitle: string;
  metaDescription: string;
  focusKeyword: string;
  keywords: string[];
  canonicalUrl: string;
  noindex: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  coverUrl: string;
  coverAlt: string;
  answer: string;
  takeaways: string[];
  faq: FaqItem[];
  steps: Step[];
  sources: Source[];
  about: string[];
  authorName: string;
  authorRole: string;
  authorUrl: string;
  category: string;
  tags: string[];
};

export type PostStatus = "draft" | "published";

/** A stored post. Dates are ISO strings, so the shape crosses to the browser intact. */
export type Post = PostFields & {
  id: number;
  status: PostStatus;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_POST: PostFields = {
  slug: "",
  title: "",
  excerpt: "",
  bodyMd: "",
  seoTitle: "",
  metaDescription: "",
  focusKeyword: "",
  keywords: [],
  canonicalUrl: "",
  noindex: false,
  ogTitle: "",
  ogDescription: "",
  ogImageUrl: "",
  coverUrl: "",
  coverAlt: "",
  answer: "",
  takeaways: [],
  faq: [],
  steps: [],
  sources: [],
  about: [],
  authorName: "",
  authorRole: "",
  authorUrl: "",
  category: "",
  tags: [],
};

/** Only the fields a post's stored row carries, picked off a wider object. */
export function pickFields(post: PostFields): PostFields {
  const out = {} as Record<keyof PostFields, unknown>;
  for (const key of Object.keys(EMPTY_POST) as (keyof PostFields)[]) out[key] = post[key];
  return out as PostFields;
}

/**
 * A URL-safe slug from a title: lower case, accents folded, "&" said as
 * "and", anything else between words a single hyphen, trimmed to the limit
 * at a word boundary so a slug never ends mid-word.
 */
export function slugify(text: string, max: number = BLOG_LIMITS.slug): string {
  const base = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= max) return base;
  const cut = base.slice(0, max + 1);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : base.slice(0, max)).replace(/-+$/g, "");
}

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function postPath(slug: string): string {
  return `/blog/${slug}`;
}

export function postUrl(slug: string): string {
  return `${CODE_ORIGIN}${postPath(slug)}`;
}

/** Public when published and the publish date has passed: one rule, used everywhere. */
export function isPublic(post: Pick<Post, "status" | "publishedAt">, now: Date = new Date()): boolean {
  return post.status === "published" && post.publishedAt !== null && new Date(post.publishedAt) <= now;
}

export type PostState = "draft" | "scheduled" | "published";

export function postState(post: Pick<Post, "status" | "publishedAt">, now: Date = new Date()): PostState {
  if (post.status === "draft") return "draft";
  return isPublic(post, now) ? "published" : "scheduled";
}

export const POST_STATE_LABELS: Record<PostState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
};

/** Words in a piece of plain text, the way a reader would count them. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);

const httpsUrl = text(BLOG_LIMITS.url).refine((value) => value === "" || isHttpsUrl(value), {
  message: "Use a full address starting with https://",
});

/** A list of short strings, blanks dropped and repeats removed (ignoring case). */
const stringList = (itemMax: number, count: number, lowerCase = false) =>
  z
    .array(z.string())
    .transform((items) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of items) {
        const item = lowerCase ? raw.trim().toLowerCase() : raw.trim();
        const key = item.toLowerCase();
        if (!item || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
      return out;
    })
    .pipe(
      z
        .array(z.string().max(itemMax, `Keep each one under ${itemMax} characters.`))
        .max(count, `Up to ${count}.`)
    );

/** Rows the editor sends with every field blank are not entries; drop them before checking. */
function withoutBlankRows<T extends Record<string, unknown>>(rows: unknown): unknown {
  if (!Array.isArray(rows)) return rows;
  return rows.filter(
    (row: T) =>
      row && typeof row === "object" && Object.values(row).some((value) => typeof value === "string" && value.trim() !== "")
  );
}

const faqItem = z.object({
  q: text(BLOG_LIMITS.faqQuestion).min(1, "Each question needs its question."),
  a: text(BLOG_LIMITS.faqAnswer).min(1, "Each question needs an answer."),
});

const step = z.object({
  name: text(BLOG_LIMITS.stepName).min(1, "Each step needs a name."),
  text: text(BLOG_LIMITS.stepText).min(1, "Each step needs its instructions."),
});

const source = z.object({
  title: text(BLOG_LIMITS.sourceTitle).min(1, "Each source needs a title."),
  url: httpsUrl.refine((value) => value !== "", { message: "Each source needs its address." }),
  publisher: text(BLOG_LIMITS.publisher).default(""),
});

export const postFieldsSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Give the post an address.")
    .max(BLOG_LIMITS.slug, `Keep the address under ${BLOG_LIMITS.slug} characters.`)
    .regex(SLUG_PATTERN, "Use lower-case letters, numbers and single hyphens only."),
  title: text(BLOG_LIMITS.title).min(1, "Give the post a title."),
  excerpt: text(BLOG_LIMITS.excerpt),
  bodyMd: z.string().max(BLOG_LIMITS.body, "The post is too long to save in one piece."),
  seoTitle: text(BLOG_LIMITS.seoTitle),
  metaDescription: text(BLOG_LIMITS.metaDescription),
  focusKeyword: text(BLOG_LIMITS.focusKeyword),
  keywords: stringList(BLOG_LIMITS.keyword, BLOG_LIMITS.keywords),
  canonicalUrl: httpsUrl,
  noindex: z.boolean(),
  ogTitle: text(BLOG_LIMITS.ogTitle),
  ogDescription: text(BLOG_LIMITS.ogDescription),
  ogImageUrl: httpsUrl,
  coverUrl: httpsUrl,
  coverAlt: text(BLOG_LIMITS.coverAlt),
  answer: text(BLOG_LIMITS.answer),
  takeaways: stringList(BLOG_LIMITS.takeaway, BLOG_LIMITS.takeaways),
  faq: z.preprocess(withoutBlankRows, z.array(faqItem).max(BLOG_LIMITS.faq, `Up to ${BLOG_LIMITS.faq} questions.`)),
  steps: z.preprocess(withoutBlankRows, z.array(step).max(BLOG_LIMITS.steps, `Up to ${BLOG_LIMITS.steps} steps.`)),
  sources: z.preprocess(
    withoutBlankRows,
    z.array(source).max(BLOG_LIMITS.sources, `Up to ${BLOG_LIMITS.sources} sources.`)
  ),
  about: stringList(BLOG_LIMITS.aboutItem, BLOG_LIMITS.about),
  authorName: text(BLOG_LIMITS.authorName),
  authorRole: text(BLOG_LIMITS.authorRole),
  authorUrl: httpsUrl,
  category: text(BLOG_LIMITS.category),
  tags: stringList(BLOG_LIMITS.tag, BLOG_LIMITS.tags, true),
});

/** A post that is already saved reads back through the schema it was saved under. */
export const postSchema = postFieldsSchema.superRefine((post, ctx) => {
  if (post.coverUrl && !post.coverAlt) {
    ctx.addIssue({
      code: "custom",
      path: ["coverAlt"],
      message: "Describe the cover image for people who cannot see it.",
    });
  }
});

const FIELD_LABELS: Partial<Record<keyof PostFields, string>> = {
  slug: "Address",
  title: "Title",
  excerpt: "Summary",
  bodyMd: "Body",
  seoTitle: "Search title",
  metaDescription: "Search description",
  focusKeyword: "Focus keyword",
  keywords: "Keywords",
  canonicalUrl: "Canonical address",
  ogTitle: "Social title",
  ogDescription: "Social description",
  ogImageUrl: "Social image",
  coverUrl: "Cover image",
  coverAlt: "Cover description",
  answer: "Short answer",
  takeaways: "Key takeaways",
  faq: "Questions",
  steps: "Steps",
  sources: "Sources",
  about: "Topics",
  authorName: "Author",
  authorRole: "Author role",
  authorUrl: "Author page",
  category: "Section",
  tags: "Tags",
};

/** The first problem, said the way the editor labels the field. */
export function firstPostIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Check the post.";
  const [field, index] = issue.path;
  const label = FIELD_LABELS[field as keyof PostFields] ?? "Post";
  const which = typeof index === "number" ? ` ${index + 1}` : "";
  return `${label}${which}: ${issue.message}`;
}
