import { parse as parseYaml, stringify as stringifyYaml, YAMLParseError } from "yaml";
import { EMPTY_POST, type FaqItem, type PostFields, type Source, type Step } from "@/lib/blog-schema";

/**
 * Reading and writing `.md` files with YAML frontmatter.
 *
 * Staff write posts wherever they like and bring them in as files, so the
 * reader takes the keys the common static-site generators use (Hugo, Jekyll,
 * Astro, Next starters) as well as this blog's own names. Every key it
 * recognises is reported back, and every one it does not is named, so an
 * import never fills or ignores a field silently.
 *
 * The YAML is parsed by `yaml`, which builds plain data and has no way to run
 * code. `gray-matter` is deliberately not used: its `---js` frontmatter is
 * evaluated as JavaScript. Here a `---js` block is not frontmatter at all and
 * stays in the body as text.
 *
 * Nothing here decides whether a post is valid; `postSchema` does that when it
 * is saved, the same as for a post typed into the editor.
 */

/** Generous for prose (a 10,000-word post is about 60 KB) and well under the action body limit. */
export const MARKDOWN_FILE_MAX_BYTES = 200 * 1024;

/** Files per import. */
export const BLOG_IMPORT_MAX_FILES = 10;

/**
 * Bytes per import, all files together. A Server Action body is capped at
 * 1 MB, so the import form checks the total before sending and asks for
 * fewer files at a time rather than raising that cap for every action.
 */
export const BLOG_IMPORT_MAX_TOTAL_BYTES = 900 * 1024;

// The closing `---` must start its own line, so a `---` inside a value never ends the block.
const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** What an import found, beyond the fields themselves. */
export type ImportedPost = {
  fields: Partial<PostFields>;
  /** Publish date from the file, ISO. An import never publishes; it is kept for when staff do. */
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  /** Editor labels of the fields the file filled, in the editor's order. */
  filled: string[];
  /** Keys that were not understood, and values that could not be used. */
  warnings: string[];
};

export type ImportResult = ({ ok: true } & ImportedPost) | { ok: false; error: string };

const LABELS: Record<keyof PostFields, string> = {
  title: "Title",
  slug: "Address",
  excerpt: "Summary",
  bodyMd: "Body",
  seoTitle: "Search title",
  metaDescription: "Search description",
  focusKeyword: "Focus keyword",
  keywords: "Keywords",
  canonicalUrl: "Canonical address",
  noindex: "Hide from search",
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

/** Keys normalised to lower case with `-` and spaces as `_`, so `Meta-Title` and `meta_title` agree. */
function key(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const ALIASES: Record<string, keyof PostFields | "publishedAt" | "contentUpdatedAt" | "ignore"> = {
  title: "title",
  slug: "slug",
  excerpt: "excerpt",
  summary: "excerpt",
  dek: "excerpt",
  subtitle: "excerpt",
  lede: "excerpt",
  description: "metaDescription",
  meta_description: "metaDescription",
  metadescription: "metaDescription",
  seo_description: "metaDescription",
  seo_title: "seoTitle",
  meta_title: "seoTitle",
  metatitle: "seoTitle",
  focus_keyword: "focusKeyword",
  focus_keyphrase: "focusKeyword",
  keyphrase: "focusKeyword",
  keyword: "focusKeyword",
  keywords: "keywords",
  canonical: "canonicalUrl",
  canonical_url: "canonicalUrl",
  canonicalurl: "canonicalUrl",
  noindex: "noindex",
  og_title: "ogTitle",
  social_title: "ogTitle",
  og_description: "ogDescription",
  social_description: "ogDescription",
  og_image: "ogImageUrl",
  social_image: "ogImageUrl",
  cover: "coverUrl",
  cover_image: "coverUrl",
  image: "coverUrl",
  featured_image: "coverUrl",
  hero: "coverUrl",
  hero_image: "coverUrl",
  cover_alt: "coverAlt",
  image_alt: "coverAlt",
  alt: "coverAlt",
  answer: "answer",
  short_answer: "answer",
  tldr: "answer",
  tl_dr: "answer",
  takeaways: "takeaways",
  key_takeaways: "takeaways",
  highlights: "takeaways",
  faq: "faq",
  faqs: "faq",
  questions: "faq",
  steps: "steps",
  howto: "steps",
  how_to: "steps",
  sources: "sources",
  references: "sources",
  citations: "sources",
  about: "about",
  entities: "about",
  topics: "about",
  author: "authorName",
  author_name: "authorName",
  author_role: "authorRole",
  author_title: "authorRole",
  author_url: "authorUrl",
  category: "category",
  section: "category",
  categories: "category",
  tags: "tags",
  date: "publishedAt",
  published: "publishedAt",
  published_at: "publishedAt",
  publishdate: "publishedAt",
  publish_date: "publishedAt",
  pubdate: "publishedAt",
  updated: "contentUpdatedAt",
  updated_at: "contentUpdatedAt",
  lastmod: "contentUpdatedAt",
  last_modified: "contentUpdatedAt",
  modified: "contentUpdatedAt",
  // Understood and deliberately unused: an import is always a draft, and the
  // layout is this blog's own.
  draft: "ignore",
  status: "ignore",
  layout: "ignore",
  type: "ignore",
};

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** A YAML list, or a comma-separated line, as strings. */
function list(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(str).filter((item): item is string => Boolean(item));
  const single = str(value);
  if (single === null) return null;
  return single
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pick(record: Record<string, unknown>, ...names: string[]): unknown {
  for (const [rawKey, value] of Object.entries(record)) {
    if (names.includes(key(rawKey))) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function faqList(value: unknown): FaqItem[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter(isRecord)
    .map((row) => ({
      q: str(pick(row, "q", "question", "name")) ?? "",
      a: str(pick(row, "a", "answer", "text")) ?? "",
    }))
    .filter((row) => row.q || row.a);
}

function stepList(value: unknown): Step[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((row) =>
      isRecord(row)
        ? { name: str(pick(row, "name", "title", "step")) ?? "", text: str(pick(row, "text", "description", "body")) ?? "" }
        : { name: str(row) ?? "", text: str(row) ?? "" }
    )
    .filter((row) => row.name || row.text);
}

function sourceList(value: unknown): Source[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((row) => {
      if (isRecord(row)) {
        const url = str(pick(row, "url", "link", "href")) ?? "";
        return {
          title: str(pick(row, "title", "name")) ?? url,
          url,
          publisher: str(pick(row, "publisher", "site", "source")) ?? "",
        };
      }
      const url = str(row) ?? "";
      return { title: url, url, publisher: "" };
    })
    .filter((row) => row.url || row.title);
}

function isoDate(value: unknown): string | null {
  const raw = value instanceof Date ? value.toISOString() : str(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Split a file into frontmatter and body. A file with no frontmatter is all
 * body. Only a leading `---` line opens frontmatter; `---js` and `+++` (TOML)
 * do not, so neither is ever evaluated or misread.
 */
export function splitFrontmatter(text: string): { yaml: string | null; body: string; bodyLine: number } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { yaml: null, body: text.replace(/^\uFEFF/, ""), bodyLine: 1 };
  const consumed = match[0];
  return {
    yaml: match[1] ?? "",
    body: text.slice(consumed.length),
    bodyLine: consumed.split("\n").length,
  };
}

export function parseMarkdownFile(text: string): ImportResult {
  if (byteLength(text) > MARKDOWN_FILE_MAX_BYTES) {
    return { ok: false, error: `The file is over ${MARKDOWN_FILE_MAX_BYTES / 1024} KB. Split it into two posts.` };
  }

  const { yaml, body: rawBody } = splitFrontmatter(text);
  let data: Record<string, unknown> = {};
  if (yaml !== null && yaml.trim() !== "") {
    try {
      const parsed: unknown = parseYaml(yaml, { maxAliasCount: 50 });
      if (parsed !== null && !isRecord(parsed)) {
        return { ok: false, error: "The frontmatter must be a list of `key: value` lines." };
      }
      data = (parsed as Record<string, unknown>) ?? {};
    } catch (error) {
      if (error instanceof YAMLParseError) {
        // Frontmatter starts on the file's second line, after the opening `---`.
        const line = (error.linePos?.[0]?.line ?? 0) + 1;
        const reason = error.message.split("\n")[0].replace(/ at line \d+, column \d+:?$/, "");
        return { ok: false, error: `The frontmatter on line ${line} is not valid YAML: ${reason}` };
      }
      return { ok: false, error: "The frontmatter could not be read." };
    }
  }

  const fields: Partial<PostFields> = {};
  const warnings: string[] = [];
  let publishedAt: string | null = null;
  let contentUpdatedAt: string | null = null;
  const unknown: string[] = [];

  for (const [rawKey, value] of Object.entries(data)) {
    const target = ALIASES[key(rawKey)];
    if (!target) {
      unknown.push(rawKey);
      continue;
    }
    if (target === "ignore" || value === null || value === undefined) continue;

    switch (target) {
      case "publishedAt":
        publishedAt = isoDate(value);
        if (!publishedAt) warnings.push(`“${rawKey}” is not a date this can read, so it was left out.`);
        break;
      case "contentUpdatedAt":
        contentUpdatedAt = isoDate(value);
        if (!contentUpdatedAt) warnings.push(`“${rawKey}” is not a date this can read, so it was left out.`);
        break;
      case "noindex":
        fields.noindex = value === true || str(value)?.toLowerCase() === "true";
        break;
      case "keywords":
      case "takeaways":
      case "about":
      case "tags": {
        const items = list(value);
        if (items) fields[target] = items;
        break;
      }
      case "category": {
        const items = list(value);
        if (items?.[0]) fields.category = items[0];
        break;
      }
      case "faq": {
        const items = faqList(value);
        if (items) fields.faq = items;
        else warnings.push(`“${rawKey}” should be a list of questions with q and a.`);
        break;
      }
      case "steps": {
        const items = stepList(value);
        if (items) fields.steps = items;
        else warnings.push(`“${rawKey}” should be a list of steps.`);
        break;
      }
      case "sources": {
        const items = sourceList(value);
        if (items) fields.sources = items;
        else warnings.push(`“${rawKey}” should be a list of sources.`);
        break;
      }
      case "authorName": {
        if (isRecord(value)) {
          const name = str(pick(value, "name"));
          const role = str(pick(value, "role", "title", "job_title", "jobtitle"));
          const url = str(pick(value, "url", "link", "website"));
          if (name) fields.authorName = name;
          if (role) fields.authorRole = role;
          if (url) fields.authorUrl = url;
        } else {
          const name = Array.isArray(value) ? str(value[0]) : str(value);
          if (name) fields.authorName = name;
        }
        break;
      }
      case "coverUrl": {
        if (isRecord(value)) {
          const src = str(pick(value, "src", "url", "image"));
          const alt = str(pick(value, "alt", "description"));
          if (src) fields.coverUrl = src;
          if (alt) fields.coverAlt = alt;
        } else {
          const src = str(value);
          if (src) fields.coverUrl = src;
        }
        break;
      }
      case "slug": {
        // A permalink such as `/blog/how-to-size-a-code/` arrives as its last segment.
        const raw = str(value);
        const segment = raw?.split("/").filter(Boolean).at(-1);
        if (segment) fields.slug = segment.toLowerCase();
        break;
      }
      default: {
        const text = str(value);
        if (text !== null) (fields as Record<string, unknown>)[target] = text;
      }
    }
  }

  if (unknown.length > 0) {
    warnings.push(`Not used: ${unknown.map((name) => `“${name}”`).join(", ")}.`);
  }

  // A file whose first line is `# Title` carries its title there. The post's
  // title is already the page's one h1, so take it out of the body.
  let body = rawBody.replace(/^\s*\n/, "");
  const heading = /^#[ \t]+(.+?)[ \t#]*\r?\n/.exec(body);
  if (heading) {
    if (!fields.title) fields.title = heading[1].trim();
    if (fields.title === heading[1].trim()) body = body.slice(heading[0].length).replace(/^\s*\n/, "");
  }
  if (body.trim()) fields.bodyMd = body.replace(/\s+$/, "") + "\n";

  // A description with no separate summary does both jobs.
  if (!fields.excerpt && fields.metaDescription) fields.excerpt = fields.metaDescription;

  const filled = (Object.keys(LABELS) as (keyof PostFields)[])
    .filter((name) => fields[name] !== undefined)
    .map((name) => LABELS[name]);

  return { ok: true, fields, publishedAt, contentUpdatedAt, filled, warnings };
}

/** A post with an import laid over it: what the file says wins, what it leaves out stays. */
export function applyImport(base: PostFields, imported: Partial<PostFields>): PostFields {
  return { ...base, ...imported };
}

/**
 * A post as a `.md` file, frontmatter first. Empty fields are left out, so
 * the file reads like one a person wrote. Reading it back with
 * `parseMarkdownFile` gives the same post.
 */
export function toMarkdownFile(
  post: PostFields & { publishedAt?: string | null; contentUpdatedAt?: string | null }
): string {
  const front: Record<string, unknown> = {};
  const set = (name: string, value: unknown) => {
    if (value === "" || value === null || value === undefined || value === false) return;
    if (Array.isArray(value) && value.length === 0) return;
    front[name] = value;
  };

  set("title", post.title);
  set("slug", post.slug);
  set("summary", post.excerpt);
  set("seo_title", post.seoTitle);
  set("description", post.metaDescription);
  set("focus_keyword", post.focusKeyword);
  set("keywords", post.keywords);
  set("category", post.category);
  set("tags", post.tags);
  if (post.authorName || post.authorRole || post.authorUrl) {
    const author: Record<string, string> = {};
    if (post.authorName) author.name = post.authorName;
    if (post.authorRole) author.role = post.authorRole;
    if (post.authorUrl) author.url = post.authorUrl;
    front.author = author;
  }
  set("date", post.publishedAt ?? null);
  set("updated", post.contentUpdatedAt ?? null);
  set("cover", post.coverUrl);
  set("cover_alt", post.coverAlt);
  set("og_title", post.ogTitle);
  set("og_description", post.ogDescription);
  set("og_image", post.ogImageUrl);
  set("canonical", post.canonicalUrl);
  set("noindex", post.noindex);
  set("answer", post.answer);
  set("takeaways", post.takeaways);
  set("faq", post.faq);
  set("steps", post.steps);
  set(
    "sources",
    post.sources.map((source) => (source.publisher ? source : { title: source.title, url: source.url }))
  );
  set("about", post.about);

  const yaml = stringifyYaml(front, { lineWidth: 0 }).trimEnd();
  const body = post.bodyMd.replace(/\s+$/, "");
  return `---\n${yaml}\n---\n\n${body}\n`;
}

/** The fields a fresh import starts from, for an action creating a draft from a file. */
export function importedFields(imported: Partial<PostFields>): PostFields {
  return applyImport(EMPTY_POST, imported);
}

/**
 * The file staff download to start a post offline. Every key is optional
 * except the title; the comments say what each one is for.
 */
export const MARKDOWN_TEMPLATE = `---
# Only the title is required. Everything else can be filled in later in the editor.
title: How small can a printed QR code be?
# The address: qriateplus.com/blog/<slug>. Left out, it is made from the title.
slug: how-small-can-a-printed-qr-code-be
# One or two sentences under the headline, and on the blog's index.
summary: The smallest size that still scans depends on the distance and the code's length. Here is how to work it out.

# --- Search ---
# The title in search results, if it should differ from the headline. Aim for 30 to 60 characters.
seo_title: Minimum QR code size for print, worked out
# The description in search results. Aim for 70 to 160 characters.
description: How to work out the smallest QR code that still scans on packaging, labels and signs, from scanning distance and code length.
# The phrase you most want this post found for. The checklist looks for it in the title, description, address, first paragraph and a heading.
focus_keyword: minimum qr code size
keywords: [qr code size, printing qr codes, qr code on packaging]
category: Printing
tags: [printing, packaging]

# --- Who wrote it ---
author:
  name: Your name
  role: Your role
  url: https://example.com/about

# --- Answer engines (Google, ChatGPT, Perplexity, voice assistants) ---
# A direct answer to the question in the title, 40 to 60 words. Shown at the top of the post.
answer: A printed QR code should be at least one tenth of the distance it is scanned from. A code read from 30 cm needs to be about 3 cm wide; shorter code URLs make sparser symbols that scan smaller still.
# Three to five points a reader, or a machine, can quote on their own.
takeaways:
  - Size the code at one tenth of the scanning distance.
  - A shorter URL means fewer modules and a smaller code.
  - Leave a quiet margin of four modules around the symbol.
faq:
  - q: Does a dynamic QR code need to be bigger?
    a: No. A dynamic code encodes a short address, so it is usually sparser than a static code for the same link.
steps:
  - name: Measure the scanning distance
    text: Work out how far away most people will hold their phone.
  - name: Divide by ten
    text: The result is the smallest width the code should print at.
# Where the facts in the post come from.
sources:
  - title: QR Code specification (ISO/IEC 18004)
    url: https://www.iso.org/standard/62021.html
    publisher: ISO
# What the post is about, as things a search engine knows: products, places, standards.
about: [QR code, Packaging]

# --- Sharing and advanced (usually left out) ---
# cover: https://...           # an https image address, or upload one in the editor
# cover_alt: What the image shows
# og_title: A different title for social shares
# og_description: A different description for social shares
# canonical: https://...       # only if this post first appeared on another site
# noindex: true                # keep this post out of search results
# date: 2026-11-10             # the publish date, used when you publish
---

Start with the paragraph that answers the question. Search engines and answer
engines read the first paragraph first.

## A heading for each part

Write in plain Markdown. **Bold**, *italic*, [links](https://example.com),
lists, > quotes and tables all work. HTML does not: it shows as text.

![Describe the image for people who cannot see it](https://example.com/image.jpg "An optional caption")
`;
