# Blog blueprint: Markdown posts built for search, answer engines and AI, edited from an admin

This file specifies the blog built for qriateplus.com in November 2026, in enough detail to build it again on another website. It covers the data model, the field list, the Markdown pipeline, the `.md` import, every SEO, AEO and GEO output, the status-code handling, the public layout, the admin editor and the tests.

**How to use it.** Give this file to the developer, or the AI agent, building the blog on the new site. Set the per-site values in section 2 first. Everything else carries over as written.

- **Copy as is:** the pure modules (schema, Markdown, frontmatter, SEO) in sections 7 to 13. They have no framework or database dependency.
- **Translate for another stack:** the routes, proxy and admin, which are written for Next.js 16 (App Router) on Postgres.
- **Re-skin:** the visual layer (section 16), whose layout rules are fixed but whose colours, fonts and index metaphor belong to each brand.

**What the three acronyms mean here:**

- **SEO** is search engine optimisation: ranking in Google and Bing results.
- **AEO** is answer engine optimisation: being the text quoted in answer boxes, "People also ask" and voice assistants.
- **GEO** is generative engine optimisation: being read, quoted and cited by ChatGPT, Perplexity, Claude and Google's AI Overviews.

---

## Contents

1. [What it does](#1-what-it-does)
2. [Per-site settings](#2-per-site-settings)
3. [Stack and dependencies](#3-stack-and-dependencies)
4. [Architecture and routes](#4-architecture-and-routes)
5. [Data model](#5-data-model)
6. [Field reference](#6-field-reference)
7. [Validation](#7-validation)
8. [Publishing rules](#8-publishing-rules)
9. [Markdown rendering](#9-markdown-rendering)
10. [Markdown file import and export](#10-markdown-file-import-and-export)
11. [Page metadata](#11-page-metadata)
12. [Structured data (JSON-LD)](#12-structured-data-json-ld)
13. [The editor's checklist](#13-the-editors-checklist)
14. [Machine-readable outputs](#14-machine-readable-outputs)
15. [Real status codes: 404 and 308](#15-real-status-codes-404-and-308)
16. [Public layout and design](#16-public-layout-and-design)
17. [The admin](#17-the-admin)
18. [Security rules](#18-security-rules)
19. [Tests to port](#19-tests-to-port)
20. [Launch checklist](#20-launch-checklist)
21. [Pitfalls already hit](#21-pitfalls-already-hit)

---

## 1. What it does

**Writing (staff only, from the admin):**

- **A Markdown editor** with a toolbar (H2, H3, bold, italic, link, bulleted list, numbered list, quote, table, image), keyboard shortcuts (⌘B, ⌘I, ⌘K, ⌘S), and ⌘Z undo that also works on toolbar edits.
- **A Write / Preview switch.** The preview uses the exact renderer the public page uses.
- **`.md` import, single.** Drop a file on the body or pick one. Its YAML frontmatter fills every field it names, the editor lists which fields were filled, and the import can be undone.
- **`.md` import, bulk.** Up to 10 files at once from the post list, each becoming a draft. Taken addresses get `-2` to `-5` appended, and the result says so.
- **`.md` export and a template.** Any post downloads as a `.md` file that imports back to the same post. A commented template file can be downloaded from the editor.
- **Fields for search, answer engines and generative engines:**
  - search title and description, focus keyword, keywords, canonical override and noindex;
  - a short answer, key takeaways, FAQ and how-to steps;
  - cited sources, the topics (entities) the post is about, and the author's name, role and page;
  - section and tags;
  - cover image and alt text, plus social title, description and image.
- **Live previews** of the Google result and the shared-link card.
- **A live 18-point checklist** across Search, Answer engines and Readers. It is guidance only and never blocks publishing.
- **Publishing:** save as draft, publish, schedule with a future date (no cron job needed), unpublish, and delete (drafts only).
- **An honest "Updated" date.** It changes only when staff tick "Mark as updated today".
- **Renames keep old links.** Changing a published post's address makes the old address redirect permanently.
- **Image uploads** for the cover, the social image and inline figures.
- **An audit row** for every change.

**Reading (public):**

- **The index** at `/blog`: one row per post, newest first.
- **The post page,** in this order:
  - breadcrumb, headline, summary, author/date/reading-time strip and cover;
  - a sticky table of contents;
  - "In short" (the short answer) and "Key takeaways";
  - the body;
  - "Step by step", "Questions" and "Sources";
  - "Keep reading", which lists related posts by shared tags.
- **Head tags:** canonical URL, robots, Open Graph `article` and Twitter card.
- **JSON-LD:**
  - the site: Organization, WebSite and Blog;
  - the post: BlogPosting, with `abstract`, `speakable`, `citation` and `about`;
  - BreadcrumbList;
  - FAQPage and HowTo, only when the post has them.
- **A generated 1200×630 social card for each post,** carrying a real QR code that scans to the post.
- **Machine-readable copies:**
  - a full-text RSS feed;
  - the sitemap (with cover images);
  - `llms.txt` listing posts;
  - a clean Markdown copy of each post at `/blog/<slug>.md`.
- **Real status codes:** 404 for drafts, scheduled posts and unknown addresses; 308 from old or capitalised addresses.

---

## 2. Per-site settings

Set these once. The reference values are QRiate+'s.

| Name | Meaning | Reference value |
|---|---|---|
| `SITE_ORIGIN` | Absolute origin, no trailing slash | `https://qriateplus.com` |
| `SITE_HOST` | Host without `www.`, used to classify internal links | `qriateplus.com` |
| `SITE_NAME` | Product or site name, used in titles and the publisher | `QRiate+` |
| `PARENT_ORG` | Optional parent company, as `{ name, url }` | `De Sign Plus`, `https://de-signplus.com` |
| `LOGO_URL` | Absolute URL of the logo for Organization data | `${SITE_ORIGIN}/brand/qriate-wordmark.svg` |
| `BLOG_PATH` | Where the blog lives | `/blog` |
| `BLOG_NAME` | Feed and Blog name | `The QRiate+ blog` |
| `BLOG_DESCRIPTION` | One sentence, used for the index description and the feed | "Guides to printing QR codes that keep working: sizing, placement, packaging, menus, tracking, and changing where a code points after it is printed." |
| `LANGUAGE` | BCP 47 language tag for `inLanguage` and the feed | `en-NG` |
| `OG_LOCALE` | Open Graph locale | `en_NG` |
| `TIME_ZONE` | Zone readers' dates are shown in | `Africa/Lagos` |
| `WORDS_PER_MINUTE` | Reading speed | `230` (reference material reads slower than prose) |
| Index H1 and lede | The index page's headline | "Printing QR codes that keep working" / "Sizing, placement, packaging, menus and tracking, and how to change where a code points after it is printed." |
| Closing call to action | The band under every post | "Print the code once. Change where it points whenever you need to." with "Create a code" and "See pricing" |

---

## 3. Stack and dependencies

| Need | Reference choice | Notes |
|---|---|---|
| Framework | Next.js 16, App Router, React 19 | Anything with server rendering works. Section 15 matters for any framework that streams. |
| Database | Postgres, raw SQL through `pg` | The schema uses `text[]`, `jsonb`, a partial index and a GIN index. |
| Markdown | `markdown-it` 15.0.3 + `@types/markdown-it` | Pin exact versions. |
| Frontmatter | `yaml` 2.9.1 | **Not `gray-matter`.** It evaluates `---js` frontmatter as JavaScript, which is code execution from an uploaded file. |
| Validation | `zod` 4 | One schema, used by both the browser editor and the server. |
| Social card | `next/og` (`ImageResponse`, Satori) + `qrcode` | Any server-side image renderer works. |
| Image upload | UploadThing | Any storage that returns an https URL works. |

---

## 4. Architecture and routes

### Module map

Four pure modules carry all of the logic. "Pure" means no database import and no framework import, so the browser editor runs exactly the code the server publishes with. The preview cannot drift from the published page, and the validation cannot disagree between client and server.

| Module | Kind | Job |
|---|---|---|
| `lib/blog-schema.ts` | Pure | Field types, limits, targets, the slug pattern, `slugify`, the zod schemas, the public predicate, `postState`, `countWords` |
| `lib/blog-markdown.ts` | Pure | `renderMarkdown(md)` → HTML plus contents, headings, links, images, words, reading time and the first paragraph. `plainText(md)` |
| `lib/blog-frontmatter.ts` | Pure | Parse a `.md` file into fields (with aliases and warnings), write a post back out as `.md`, and the template |
| `lib/blog-seo.ts` | Pure | Head metadata, the JSON-LD graphs, the checklist (`auditPost`), card and canonical URLs |
| `lib/blog.ts` | Server | All SQL: public reads, staff reads and writes, slug history, related posts |
| `proxy.ts` (middleware) | Server | Decides 404 or 308 for `/blog/<slug>` before the page streams |

### Public routes

| Route | Serves |
|---|---|
| `/blog` | The index |
| `/blog/<slug>` | A post |
| `/blog/<slug>.md` | The post as Markdown. A rewrite sends it to `/blog/<slug>/md`. |
| `/blog/<slug>/card?v=<version>` | The generated 1200×630 PNG card |
| `/blog/rss.xml` | RSS 2.0 with full content |
| `/sitemap.xml` | Existing sitemap, plus the blog and its posts |
| `/llms.txt` | Existing file, plus a `## Blog` section |
| `/robots.txt` | No change needed if `/` is allowed |

The rewrite in `next.config.ts`:

```ts
async rewrites() {
  return [{ source: "/blog/:slug.md", destination: "/blog/:slug/md" }];
}
```

### Admin routes (staff only)

| Route | Page title | What |
|---|---|---|
| `/admin/blog` | "Blog posts" | Post list, New post, bulk import |
| `/admin/blog/new` | "New post" | The editor, empty |
| `/admin/blog/<id>` | "Edit post" | The editor, filled in |
| `/admin/blog/<id>/preview` | "Post preview" | The saved post rendered by the public `Article` component, under a status bar |

Server actions: `savePostAction` (intents: save, publish, unpublish), `deletePostAction` and `importPostsAction`.

> If your site gives URL paths to user content (as QRiate+'s short codes do), add `blog` to the reserved names so no user can be issued `/blog`.

---

## 5. Data model

Two tables for posts, one for uploaded images. `users` stands for your staff/user table.

```sql
create table blog_posts (
  id                  bigserial    primary key,
  slug                text         not null,
  status              text         not null default 'draft',
  title               text         not null,
  -- The dek: the sentence under the headline, and the fallback description.
  excerpt             text         not null default '',
  body_md             text         not null default '',

  -- Search. Each falls back to the field above it when null.
  seo_title           text,
  meta_description    text,
  focus_keyword       text,
  keywords            text[]       not null default '{}',
  -- Set only when the post first appeared elsewhere; otherwise the post's own URL.
  canonical_url       text,
  noindex             boolean      not null default false,

  -- Sharing.
  og_title            text,
  og_description      text,
  og_image_url        text,
  cover_url           text,
  cover_alt           text,

  -- Answer and generative engines.
  answer              text,
  takeaways           text[]       not null default '{}',
  faq                 jsonb        not null default '[]',   -- [{ q, a }]
  steps               jsonb        not null default '[]',   -- [{ name, text }]
  sources             jsonb        not null default '[]',   -- [{ title, url, publisher }]
  about               text[]       not null default '{}',

  author_name         text,
  author_role         text,
  author_url          text,

  category            text,
  tags                text[]       not null default '{}',

  -- In the future means scheduled. A draft can carry one (from an import).
  published_at        timestamptz,
  -- Set on the first publish and never cleared: only an address that was once
  -- live is worth redirecting when the slug changes.
  ever_published      boolean      not null default false,
  -- The visible "Updated" date. Set only when staff mark a change substantive.
  content_updated_at  timestamptz,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now(),
  created_by          uuid         references users (id) on delete set null,
  updated_by          uuid         references users (id) on delete set null,

  constraint blog_posts_slug_key unique (slug),
  constraint blog_posts_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint blog_posts_status_check check (status in ('draft', 'published')),
  constraint blog_posts_published_check
    check (status = 'draft' or published_at is not null),
  constraint blog_posts_faq_check check (jsonb_typeof(faq) = 'array'),
  constraint blog_posts_steps_check check (jsonb_typeof(steps) = 'array'),
  constraint blog_posts_sources_check check (jsonb_typeof(sources) = 'array')
);

-- The public list, newest first: index, feed, sitemap.
create index blog_posts_public_idx on blog_posts (published_at desc) where status = 'published';

-- Related posts are the ones sharing a tag.
create index blog_posts_tags_idx on blog_posts using gin (tags);

-- Old addresses of renamed posts, answered with a 308 to the current one.
create table blog_post_slugs (
  slug        text         primary key,
  post_id     bigint       not null references blog_posts (id) on delete cascade,
  created_at  timestamptz  not null default now()
);
create index blog_post_slugs_post_idx on blog_post_slugs (post_id);

-- Uploaded images. A table of its own so no "unreferenced upload" sweep ever
-- deletes a post's cover.
create table blog_images (
  id           bigserial    primary key,
  file_key     text         not null,
  url          text         not null,
  name         text         not null,
  mime_type    text         not null,
  size_bytes   integer      not null,
  uploaded_by  uuid         references users (id) on delete set null,
  created_at   timestamptz  not null default now(),
  constraint blog_images_file_key_key unique (file_key)
);
```

**Storage conventions:**

- Optional text is `null` in the database and `""` in the app. Map it once, in the data layer, so forms never handle nulls.
- Dates cross to the browser as ISO strings.

---

## 6. Field reference

The **hard limit** refuses a save. The **target** is guidance only, used by the counters and the checklist. "Frontmatter keys" lists every name the importer accepts, compared after lower-casing and turning spaces and `-` into `_`.

| Field | Column | Hard limit | Target | Used for | Frontmatter keys |
|---|---|---|---|---|---|
| `title` | `title` | 120 | | H1, fallback `<title>`, card | `title` (or a leading `# Heading` in the body) |
| `slug` | `slug` | 80, pattern `^[a-z0-9]+(-[a-z0-9]+)*$` | short, keyword-led | URL | `slug` (a permalink like `/blog/x/` keeps its last segment) |
| `excerpt` | `excerpt` | 300 | 80–220 characters | Dek under the H1, index rows, fallback description | `excerpt`, `summary`, `dek`, `subtitle`, `lede` |
| `bodyMd` | `body_md` | 200,000 characters | ≥ 600 words | Article body | (the file body) |
| `seoTitle` | `seo_title` | 70 | 30–60 characters | `<title>`, OG/Twitter title fallback | `seo_title`, `meta_title`, `metatitle` |
| `metaDescription` | `meta_description` | 200 | 70–160 characters | Meta description, feed, llms.txt | `description`, `meta_description`, `metadescription`, `seo_description` |
| `focusKeyword` | `focus_keyword` | 80 | | Checklist; first entry of `keywords` | `focus_keyword`, `focus_keyphrase`, `keyphrase`, `keyword` |
| `keywords` | `keywords[]` | 12 × 60 | | Meta keywords, JSON-LD `keywords` | `keywords` (YAML list or comma line) |
| `canonicalUrl` | `canonical_url` | https, 500 | empty unless the post appeared elsewhere first | `<link rel=canonical>`; excludes the post from the sitemap and llms.txt | `canonical`, `canonical_url`, `canonicalurl` |
| `noindex` | `noindex` | boolean | | Robots noindex; excludes the post from the sitemap and llms.txt | `noindex` |
| `ogTitle` | `og_title` | 120 | | OG and Twitter title | `og_title`, `social_title` |
| `ogDescription` | `og_description` | 300 | | OG and Twitter description | `og_description`, `social_description` |
| `ogImageUrl` | `og_image_url` | https, 500 | 1200×630 | Replaces the generated card | `og_image`, `social_image` |
| `coverUrl` | `cover_url` | https, 500 | | Cover figure, JSON-LD image, sitemap image | `cover`, `cover_image`, `image`, `featured_image`, `hero`, `hero_image` (or an object `{src, alt}`) |
| `coverAlt` | `cover_alt` | 200, **required when there is a cover** | | Cover alt text | `cover_alt`, `image_alt`, `alt` |
| `answer` | `answer` | 800 | 40–60 words | "In short" block, JSON-LD `abstract`, `speakable`, feed lead | `answer`, `short_answer`, `tldr`, `tl_dr` |
| `takeaways` | `takeaways[]` | 7 × 240 | 3–5 | "Key takeaways" list, `speakable` | `takeaways`, `key_takeaways`, `highlights` |
| `faq` | `faq` jsonb | 12; q 200, a 1500 | ≥ 2 | "Questions" block, FAQPage | `faq`, `faqs`, `questions` (rows may use `q`/`question`/`name` and `a`/`answer`/`text`) |
| `steps` | `steps` jsonb | 15; name 120, text 1000 | | "Step by step" block, HowTo | `steps`, `howto`, `how_to` (rows may use `name`/`title`/`step` and `text`/`description`/`body`, or be bare strings) |
| `sources` | `sources` jsonb | 20; title 200, publisher 120, https URL | ≥ 1 | "Sources" block, JSON-LD `citation` | `sources`, `references`, `citations` (rows may use `url`/`link`/`href`, `title`/`name`, `publisher`/`site`/`source`, or be bare URLs) |
| `about` | `about[]` | 10 × 80 | | JSON-LD `about` (Thing) | `about`, `entities`, `topics` |
| `authorName` | `author_name` | 80 | set | Byline, Person in JSON-LD, `dc:creator` | `author`, `author_name` (an `author` object may hold `name`, `role`/`title`/`job_title`, `url`/`link`/`website`) |
| `authorRole` | `author_role` | 120 | | Byline second line, `jobTitle` | `author_role`, `author_title` |
| `authorUrl` | `author_url` | https, 500 | | Byline link `rel="author"`, Person `url` | `author_url` |
| `category` | `category` | 60 | one or two words | Breadcrumb, index "Section" column, `articleSection`, card | `category`, `section`, `categories` (first item) |
| `tags` | `tags[]` | 12 × 40, lower-cased | | Related posts, OG `article:tag`, feed categories | `tags` |
| publish date | `published_at` | | | Scheduling, dates shown, `datePublished` | `date`, `published`, `published_at`, `publishdate`, `publish_date`, `pubdate` |
| updated date | `content_updated_at` | | | "Updated" date, `dateModified` | `updated`, `updated_at`, `lastmod`, `last_modified`, `modified` |

The importer recognises `draft`, `status`, `layout` and `type`, then ignores them on purpose: an import is always a draft. Any other key is reported as "Not used: …".

---

## 7. Validation

The same zod schema validates three times: in the browser while typing, in the server action on save, and in the importer. Rules:

- Every text field is trimmed and given its maximum length.
- The slug is lower-cased, then must match the pattern.
- All URLs must be `https://` with a host. An empty string means "not set".
- Every list:
  - is trimmed, with blank items dropped;
  - loses repeats, compared case-insensitively;
  - is capped at its item length and count.
- Tags are also lower-cased.
- FAQ, step and source rows with every field blank are dropped before checking. A half-filled row is an error naming its number ("Questions 2: Each question needs an answer.").
- **Publishing needs more than saving:** a non-empty body, and alt text for any cover. A draft saves with whatever it has.

Errors are reported in the editor's own labels through `firstPostIssue`, for example `Search title: Keep it under 70 characters.`

```ts
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A URL-safe slug: lower case, accents folded, "&" as "and", trimmed at a word boundary. */
export function slugify(text: string, max = 80): string {
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

/** Words the way a reader counts them: tokens containing a letter or digit. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);
const httpsUrl = text(500).refine((v) => v === "" || isHttpsUrl(v), {
  message: "Use a full address starting with https://",
});

/** Blanks dropped, repeats removed ignoring case, then capped. */
const stringList = (itemMax: number, count: number, lowerCase = false) =>
  z.array(z.string())
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
    .pipe(z.array(z.string().max(itemMax, `Keep each one under ${itemMax} characters.`)).max(count, `Up to ${count}.`));

function withoutBlankRows(rows: unknown): unknown {
  if (!Array.isArray(rows)) return rows;
  return rows.filter((row) => row && typeof row === "object" &&
    Object.values(row).some((v) => typeof v === "string" && v.trim() !== ""));
}

export const postFieldsSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1, "Give the post an address.").max(80)
    .regex(SLUG_PATTERN, "Use lower-case letters, numbers and single hyphens only."),
  title: text(120).min(1, "Give the post a title."),
  excerpt: text(300),
  bodyMd: z.string().max(200_000, "The post is too long to save in one piece."),
  seoTitle: text(70),
  metaDescription: text(200),
  focusKeyword: text(80),
  keywords: stringList(60, 12),
  canonicalUrl: httpsUrl,
  noindex: z.boolean(),
  ogTitle: text(120),
  ogDescription: text(300),
  ogImageUrl: httpsUrl,
  coverUrl: httpsUrl,
  coverAlt: text(200),
  answer: text(800),
  takeaways: stringList(240, 7),
  faq: z.preprocess(withoutBlankRows, z.array(z.object({
    q: text(200).min(1, "Each question needs its question."),
    a: text(1500).min(1, "Each question needs an answer."),
  })).max(12)),
  steps: z.preprocess(withoutBlankRows, z.array(z.object({
    name: text(120).min(1, "Each step needs a name."),
    text: text(1000).min(1, "Each step needs its instructions."),
  })).max(15)),
  sources: z.preprocess(withoutBlankRows, z.array(z.object({
    title: text(200).min(1, "Each source needs a title."),
    url: httpsUrl.refine((v) => v !== "", { message: "Each source needs its address." }),
    publisher: text(120).default(""),
  })).max(20)),
  about: stringList(80, 10),
  authorName: text(80),
  authorRole: text(120),
  authorUrl: httpsUrl,
  category: text(60),
  tags: stringList(40, 12, true),
});

/** What publishing needs on top: a cover must be described. (The body check is in the action.) */
export const postSchema = postFieldsSchema.superRefine((post, ctx) => {
  if (post.coverUrl && !post.coverAlt) {
    ctx.addIssue({ code: "custom", path: ["coverAlt"], message: "Describe the cover image for people who cannot see it." });
  }
});
```

---

## 8. Publishing rules

These hold everywhere: index, post, feed, sitemap, llms.txt, card and `.md` copy.

1. **One public predicate:** `status = 'published' and published_at <= now()`. A post with a future date is scheduled and goes live on its own when the date passes, with no job to run.
2. **Three states shown to staff:** Draft, Scheduled (published with a future date) and Published.
3. **Publish sets the date this way:** `published_at = coalesce(<date staff gave>, published_at, now())`. Re-publishing an old post never makes it look new. Publishing also sets `ever_published = true`, which is never cleared.
4. **Unpublish** returns the post to draft and keeps its date, for when it goes out again. Its address then answers 404.
5. **Only drafts can be deleted.** A live post must be unpublished first, so nothing live disappears with one click. Delete asks for confirmation.
6. **The "Updated" date is honest.** `content_updated_at = now()` is set only when staff tick "Mark as updated today" while saving a published post. A typo fix never makes a post look fresher. The page shows "Updated" only when that date is later than the publish date.
7. **Renames keep their links.** When the slug of a post that was ever published changes, the old slug goes into `blog_post_slugs`, and requests for it get a 308 to the new address. Renaming back to an old address removes it from the redirect list.
8. **Slug clashes are settled by the unique index,** with no check first, because checking first races. A Postgres `23505` on `blog_posts_slug_key` becomes "Another post already lives at /blog/x. Choose another address." A slug that is another post's former address is refused too, with "/blog/x redirects to “Title”. Choose another address.", because that address already lives in other people's links.
9. **Imports never publish.** A file's date is kept on the draft for when staff publish it.
10. **Every action is audited,** with who, what and when: create, update (as a field-by-field before/after diff, with the body summarised by length), publish, schedule, unpublish, delete and import.

The SQL for these (Postgres, `$n` parameters):

```sql
-- Public list
select … from blog_posts
where status = 'published' and published_at <= now()
order by published_at desc, id desc limit $1;

-- Reading time without loading the body
coalesce(array_length(regexp_split_to_array(btrim(body_md), '\s+'), 1), 0) as word_estimate

-- One-query status lookup for the proxy (section 15)
select
  exists (select 1 from blog_posts where slug = $1 and status = 'published' and published_at <= now()) as live,
  (select p.slug from blog_post_slugs s join blog_posts p on p.id = s.post_id
    where s.slug = $1 and p.status = 'published' and p.published_at <= now()) as moved_to;

-- Related posts: most shared tags, then newest
select …, cardinality(array(select unnest(tags) intersect select unnest($2::text[]))) as shared
from blog_posts
where status = 'published' and published_at <= now() and id <> $1
order by shared desc, published_at desc
limit 3;

-- Publish or schedule
update blog_posts
set status = 'published',
    published_at = coalesce($2::timestamptz, published_at, now()),
    ever_published = true, updated_by = $3, updated_at = now()
where id = $1 returning …;

-- Delete: drafts only
delete from blog_posts where id = $1 and status = 'draft' returning id;
```

Saving a rename runs as one transaction:

1. Lock the row: `select slug, ever_published … for update`.
2. If the slug changed:
   - refuse it when it is another post's former address;
   - delete `(new slug, this post)` from `blog_post_slugs`;
   - if `ever_published`, upsert `(old slug → this post)`.
3. Update the fields.

---

## 9. Markdown rendering

**Safe by construction, not by cleaning afterwards:**

- `html: false`: raw HTML is escaped and shown as text, never rendered.
- Links are allowed only for http(s), `mailto:`, `tel:`, site-relative paths and `#` anchors. Anything else, including `javascript:`, `data:` and protocol-relative `//`, is left as plain text.
- Images must be https, or they render as their alt text.

**What the renderer adds:**

- **Heading ids and contents:** `id`s on h2 and h3, kept unique (`-2`, `-3`, …), and a table of contents built from them.
- **Figures:** an image alone in its paragraph becomes a `<figure>`, and its Markdown title becomes the `<figcaption>`.
- **Tables:** each table is wrapped in `.post-table`, so a wide one scrolls inside its own frame.
- **External links:** they get `rel="noopener"`.
- **Images:** they get `loading="lazy" decoding="async"`.

**What it reports for the checklist,** from the same parse: every heading with its level, the links (marked internal or not), the images with their alt text, the word count, the reading time and the first paragraph.

```ts
import createMarkdownIt, { type MarkdownIt, type Token } from "markdown-it";

export type TocItem = { level: 2 | 3; id: string; text: string };
export type RenderedPost = {
  html: string;
  toc: TocItem[];
  headings: { level: number; text: string }[];
  words: number;
  readingMinutes: number;
  firstParagraph: string;
  links: { href: string; internal: boolean }[];
  images: { src: string; alt: string }[];
};
type Collected = Omit<RenderedPost, "html" | "words" | "readingMinutes" | "firstParagraph"> & {
  ids: Set<string>; text: string[]; firstParagraph: string | null;
};

const WORDS_PER_MINUTE = 230;
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

function isInternal(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try { return new URL(href).hostname.replace(/^www\./, "") === SITE_HOST; } catch { return false; }
}

/** Readable text of an inline run: words, inline code, and line breaks as spaces. */
function inlineText(children: Token[]): string {
  return children
    .map((c) => (c.type === "text" || c.type === "code_inline" ? c.content
      : c.type === "softbreak" || c.type === "hardbreak" ? " " : ""))
    .join("").replace(/\s+/g, " ").trim();
}

function createRenderer(): MarkdownIt {
  const md = createMarkdownIt({ html: false, linkify: true, typographer: true });
  md.validateLink = (url: string) => SAFE_LINK.test(url.trim());

  md.core.ruler.push("post_structure", (state) => {
    const env = state.env as Collected;
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];

      if (token.type === "heading_open") {
        const level = Number(token.tag.slice(1));
        const label = inlineText(tokens[i + 1]?.children ?? []);
        env.headings.push({ level, text: label });
        if (level === 2 || level === 3) {
          const base = slugify(label, 60) || "section";
          let id = base;
          for (let n = 2; env.ids.has(id); n += 1) id = `${base}-${n}`;
          env.ids.add(id);
          token.attrSet("id", id);
          env.toc.push({ level, id, text: label });
        }
      }

      if (token.type === "paragraph_open") {
        const inline = tokens[i + 1];
        const children = inline?.children ?? [];
        const onlyImage = children.length === 1 && children[0].type === "image";
        if (onlyImage && tokens[i + 2]?.type === "paragraph_close") {
          token.tag = "figure";
          tokens[i + 2].tag = "figure";
          children[0].meta = { ...(children[0].meta ?? {}), figure: true };
        } else if (env.firstParagraph === null && inline?.type === "inline") {
          const paragraph = inlineText(children);
          if (paragraph) env.firstParagraph = paragraph;
        }
      }

      if (token.type === "inline") {
        for (const child of token.children ?? []) {
          if (child.type === "text" || child.type === "code_inline") env.text.push(child.content);
        }
      }
      if (token.type === "fence" || token.type === "code_block") env.text.push(token.content);
    }
  });

  const defaultLinkOpen = md.renderer.rules.link_open
    ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const href = String(token.attrGet("href") ?? "");
    const internal = isInternal(href);
    if (!href.startsWith("#")) (env as Collected).links.push({ href, internal });
    if (!internal && /^https?:/i.test(href)) token.attrSet("rel", "noopener");
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const src = String(token.attrGet("src") ?? "");
    const alt = self.renderInlineAsText(token.children ?? [], options, env);
    const title = String(token.attrGet("title") ?? "");
    const escapedAlt = md.utils.escapeHtml(alt);
    if (!isHttpsUrl(src)) return escapedAlt;
    (env as Collected).images.push({ src, alt });
    const img = `<img src="${md.utils.escapeHtml(src)}" alt="${escapedAlt}" loading="lazy" decoding="async">`;
    if (token.meta?.figure && title) return `${img}<figcaption>${md.utils.escapeHtml(title)}</figcaption>`;
    return title ? img.replace("<img ", `<img title="${md.utils.escapeHtml(title)}" `) : img;
  };

  md.renderer.rules.table_open = () => '<div class="post-table"><table>\n';
  md.renderer.rules.table_close = () => "</table></div>\n";
  return md;
}

let renderer: MarkdownIt | null = null;
const freshEnv = (): Collected =>
  ({ toc: [], headings: [], ids: new Set(), text: [], firstParagraph: null, links: [], images: [] });

export function renderMarkdown(source: string): RenderedPost {
  renderer ??= createRenderer();
  const env = freshEnv();                 // always a fresh env: the core rule writes into it
  const html = renderer.render(source, env);
  const words = countWords(env.text.join(" "));
  return {
    html, toc: env.toc, headings: env.headings, words,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    firstParagraph: env.firstParagraph ?? "", links: env.links, images: env.images,
  };
}

/** Plain text, for summaries; trimmed at a word with an ellipsis. */
export function plainText(source: string, max = Infinity): string {
  renderer ??= createRenderer();
  const parts = renderer.parse(source, freshEnv())
    .filter((t) => t.type === "inline").map((t) => inlineText(t.children ?? []));
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length <= max) return joined;
  const cut = joined.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trimEnd()}…`;
}
```

The rendered HTML is trusted output: it can only contain what this renderer emits, so the page inserts it directly (`dangerouslySetInnerHTML` in React).

---

## 10. Markdown file import and export

### Reading a file

- **Size cap:** 200 KB per file. A 10,000-word post is about 60 KB.
- **The frontmatter block** must open on the first line, with an optional byte-order mark, and its closing `---` must start a line of its own. A `---` inside a value never ends the block. `---js` and `+++` (TOML) do not open frontmatter, so their contents stay in the body as text and never run.

  ```ts
  const FRONTMATTER = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
  ```
- **Parsing:** the YAML is parsed with `yaml`'s `parse(text, { maxAliasCount: 50 })`. The alias cap stops "billion laughs" files.
- **Errors carry a line number** within the file, counting the opening `---` as line 1. For example: `The frontmatter on line 4 is not valid YAML: …`. Frontmatter that is not a mapping is refused with "The frontmatter must be a list of `key: value` lines."
- **Keys** are matched through the alias table in section 6.
- **Lists** may be YAML lists or comma-separated lines.
- **Dates** that cannot be read are dropped, with a warning rather than a guess.
- **A leading `# Title` in the body:**
  - it becomes the title when the frontmatter has none;
  - it is removed from the body when it matches the title, because the page already has its one H1;
  - it stays when the frontmatter names a different title.
- **A `description` with no summary** fills both the description and the summary.
- **The result** carries the fields, the publish and updated dates, `filled` (the editor labels of every field filled, in editor order) and `warnings` (unknown keys and unreadable values).

### Applying an import in the editor

- What the file says wins. What it leaves out stays as it was.
- If the slug was never typed by hand and the file names none, the slug follows the new title.
- A note under the import button reads "Filled from post.md: Title, Summary, Search description, …", followed by any warnings, with **Undo the import** and **Dismiss**. Undo restores the fields and the publish date as they were.

### Bulk import (from the post list)

- **Limits:**
  - up to 10 files at once;
  - up to 200 KB each;
  - up to 900 KB in total, checked in the browser first, because a Next.js Server Action body is capped at 1 MB.
- **Every file becomes a draft.**
- **Missing title:** taken from the file name, with `-` and `_` turned into spaces.
- **Missing slug:** made from the title, else from the file name, else `post`.
- **Taken slug:** retried with `-2` to `-5`, and the result row says "/blog/x was taken, so it is at /blog/x-2."
- **Results:** shown per file, as "3 of 4 files imported as drafts", with a link to each draft and the error for each failed file.

### Writing a file ("Download .md")

- Frontmatter comes first, then a blank line, then the body.
- Empty fields are left out, so the file reads like one a person wrote.
- Key order: `title`, `slug`, `summary`, `seo_title`, `description`, `focus_keyword`, `keywords`, `category`, `tags`, `author {name, role, url}`, `date`, `updated`, `cover`, `cover_alt`, `og_title`, `og_description`, `og_image`, `canonical`, `noindex`, `answer`, `takeaways`, `faq`, `steps`, `sources`, `about`.
- A source with no publisher is written as `{title, url}` only.
- Lines are not wrapped (`stringify(front, { lineWidth: 0 })`).
- **Round trip:** reading the file back gives the same post. A test enforces this.

### The template staff download

```markdown
---
# Only the title is required. Everything else can be filled in later in the editor.
title: How small can a printed QR code be?
# The address: <site>/blog/<slug>. Left out, it is made from the title.
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
```

Rewrite the example values for each site's subject. A test parses the template and checks it validates as a post.

---

## 11. Page metadata

The root layout of the reference site is `noindex`. Each public blog page opts back in through its own metadata.

**On a post:**

| Tag | Value |
|---|---|
| `<title>` | `seoTitle`, else `${title} · ${SITE_NAME}`. The site's title template is not applied. |
| `meta description` | `metaDescription`, else `excerpt` |
| `meta keywords` | `[focusKeyword, ...keywords]` |
| `author`, `category` | author name and URL, category |
| `link rel=canonical` | `canonicalUrl`, else `${SITE_ORIGIN}/blog/${slug}` |
| `link rel=alternate` | `application/rss+xml` → the feed; `text/markdown` → `${postUrl}.md` |
| `robots` | `index, follow`, plus googleBot `max-image-preview:large, max-snippet:-1, max-video-preview:-1`. With `noindex`: `noindex, follow`. |
| `og:type` | `article` |
| `og:url`, `og:site_name`, `og:locale` | canonical, `SITE_NAME`, `OG_LOCALE` |
| `og:title` | `ogTitle`, else `seoTitle`, else `title` |
| `og:description` | `ogDescription`, else the search description |
| `article:published_time` / `article:modified_time` | `published_at` / `content_updated_at ?? published_at` |
| `article:author`, `article:section`, `article:tag` | author URL or name, category, tags |
| `og:image` | `ogImageUrl` (alt from `coverAlt`, else the title), else the generated card at 1200×630 |
| `twitter:card` | `summary_large_image`, same title, description and image |

**On the index:**

- `<title>`: `Blog · ${SITE_NAME}`.
- Description: `BLOG_DESCRIPTION`.
- Canonical: `/blog`.
- An RSS alternate link.
- `robots` set to index.
- OG `website` and a Twitter card.

**The card address** carries a version, so platforms refetch the card after an edit:

```ts
export function cardUrl(post: { slug: string; updatedAt: string }) {
  const version = Math.floor(new Date(post.updatedAt).getTime() / 1000).toString(36);
  return `${SITE_ORIGIN}/blog/${post.slug}/card?v=${version}`;
}
```

In Next.js, return the whole `openGraph` object from `generateMetadata`, not a patch: Next merges `openGraph` shallowly.

---

## 12. Structured data (JSON-LD)

Each page carries one `<script type="application/ld+json">` holding an `@graph`. The nodes refer to each other by `@id`:

- Organization: `${SITE_ORIGIN}/#organization`
- WebSite: `${SITE_ORIGIN}/#website`
- Blog: `${SITE_ORIGIN}/blog#blog`
- the post's article: `${url}#article`

Empty values are dropped from every node (`compact()`), so a node states only what is known.

**Post graph:**

- **Organization:** name, url and logo, plus `parentOrganization` when there is one.
- **WebSite:** `inLanguage`, and `publisher` pointing at the Organization.
- **Blog:** name, url, description and `inLanguage`; `publisher` → Organization; `isPartOf` → WebSite.
- **BlogPosting:**
  - identity: `headline` (cut to 110 characters), `name`, `description`, `url`, `mainEntityOfPage`;
  - `image`: the cover and the social image, without repeats;
  - dates: `datePublished`, and `dateModified` (`content_updated_at`, else `published_at`);
  - `author`: a Person (`name`, `jobTitle`, `url`, `worksFor` → Organization), or the Organization when no author is named;
  - links to the site: `publisher` → Organization; `isPartOf` → Blog;
  - descriptors: `articleSection`, `keywords` (comma-joined), `wordCount`, `timeRequired` (`PT{n}M`), `inLanguage`;
  - for answer engines: `abstract` (the short answer), and `speakable` with `cssSelector: ["#short-answer", "#key-takeaways"]`;
  - for generative engines: `about` (a Thing for each topic), and `citation` (a CreativeWork for each source, with a `publisher` Organization).
- **BreadcrumbList:** `SITE_NAME` → Blog → the post's title.
- **FAQPage:** only when the post has questions. Each is a Question with an `acceptedAnswer`.
- **HowTo:** only when the post has steps. Each is a HowToStep with `position`, `name`, `text` and `url: ${url}#step-{n}`.

**Index graph:** Organization, WebSite, Blog (with a `blogPost` summary for each post), an ItemList of the posts, and a BreadcrumbList.

**Escaping:** escape `<` in the JSON, so a title containing `</script>` cannot close the tag:

```ts
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
```

The BlogPosting node, condensed:

```ts
const article = compact({
  "@type": "BlogPosting",
  "@id": `${url}#article`,
  headline: post.title.slice(0, 110),
  name: post.title,
  description: searchDescription(post) || undefined,
  abstract: post.answer || undefined,
  url,
  mainEntityOfPage: { "@type": "WebPage", "@id": url },
  image: [post.coverUrl, socialImage(post).url].filter(Boolean).filter((v, i, all) => all.indexOf(v) === i),
  datePublished: post.publishedAt ?? undefined,
  dateModified: (post.contentUpdatedAt ?? post.publishedAt) ?? undefined,
  author: post.authorName
    ? compact({ "@type": "Person", name: post.authorName, jobTitle: post.authorRole || undefined,
                url: post.authorUrl || undefined, worksFor: { "@id": ORG_ID } })
    : { "@id": ORG_ID },
  publisher: { "@id": ORG_ID },
  isPartOf: { "@id": BLOG_ID },
  articleSection: post.category || undefined,
  keywords: [post.focusKeyword, ...post.keywords].filter(Boolean).join(", ") || undefined,
  about: post.about.map((name) => ({ "@type": "Thing", name })),
  citation: post.sources.map((s) => compact({
    "@type": "CreativeWork", name: s.title, url: s.url,
    publisher: s.publisher ? { "@type": "Organization", name: s.publisher } : undefined,
  })),
  wordCount: rendered.words,
  timeRequired: `PT${rendered.readingMinutes}M`,
  inLanguage: LANGUAGE,
  speakable: speakable.length ? { "@type": "SpeakableSpecification", cssSelector: speakable } : undefined,
});
```

---

## 13. The editor's checklist

`auditPost(fields, rendered)` returns 18 checks. Each has a group, a label, a pass flag and a detail line, which says either what was measured or what to do. It updates live as staff type. **It never blocks a save or a publish**, because a short news post can rightly fail the length check.

**How the checks compare text:**

- Keyword matching lower-cases both sides, removes apostrophes and collapses spaces.
- The slug check compares against `slugify(keyword)`.
- Blank rows in takeaways, FAQ and sources are not counted.

| # | Group | Check | Passes when | Detail when it fails |
|---|---|---|---|---|
| 1 | Search | Search title is 30–60 characters | The effective title (with the fallback) is in range | "N characters" |
| 2 | Search | Search description is 70–160 characters | The effective description is in range | "None yet. The summary is used when this is empty." |
| 3 | Search | A focus keyword is set | Not empty | "The phrase you most want this post found for." |
| 4 | Search | Focus keyword is in the search title | Contained | "Not found" / "Set a focus keyword first." |
| 5 | Search | Focus keyword is in the search description | Contained | same |
| 6 | Search | Focus keyword is in the address | `slug` contains `slugify(keyword)` | shows `/blog/<slug>` |
| 7 | Search | Focus keyword is in the first paragraph | Contained in `firstParagraph` | "The body has no paragraph yet." |
| 8 | Search | Focus keyword is in a subheading | Any h2 or h3 contains it | "N subheadings" |
| 9 | Search | Links to another page on this site | At least 1 internal link | "Link to a related post, /pricing, or the home page." |
| 10 | Search | Every image is described | Body images and the cover all have alt text | "N missing a description" |
| 11 | Answer engines | Short answer is 40–60 words | In range | "The direct answer to the question in the title." |
| 12 | Answer engines | 3 to 5 key takeaways | In range | "N so far" |
| 13 | Answer engines | At least 2 questions answered | 2 or more complete FAQ rows | "N so far" |
| 14 | Answer engines | Cites at least one source | 1 or more | "Where the facts in the post come from." |
| 15 | Readers | At least 600 words | Body word count | "N words, M min read" |
| 16 | Readers | No second headline in the body | No `#` heading in the body | "Use ## for sections. The title is already the page's one # heading." |
| 17 | Readers | Heading levels run in order | No jump of more than one level (body starts from level 1) | "A heading skips a level, such as ## then ####." |
| 18 | Readers | Names its author | Author name set | "A named author makes advice easier to trust." |

Where the checklist appears:

- **In the editor:** a "Checklist" panel shows "14 of 18 checks pass" over a thin progress bar, then the items grouped under Search, Answer engines and Readers. Each item has a tick, or an amber circle when it needs work, with its detail line underneath. Screen readers hear "Passes:" or "Needs work:".
- **On the post list:** each post's "Checklist" column shows "N of 18".

---

## 14. Machine-readable outputs

Every one of these reads the database per request and degrades instead of failing:

- a failed read gives a valid empty feed;
- the sitemap falls back to its static entries;
- `llms.txt` is served without the blog section.

### 14.1 The Markdown copy (`/blog/<slug>.md`)

This follows the llms.txt convention: a clean copy at the page's address plus `.md`, holding everything a model would quote and none of the page chrome.

```text
# {title}

> {excerpt}

Author: {name}, {role}
Published: YYYY-MM-DD
Updated: YYYY-MM-DD          (only when content_updated_at is set)
Source: {canonical URL}

## Short answer
{answer}

## Key takeaways
- …

{body_md}

## Step by step
1. **{name}**: {text}

## Questions
### {q}
{a}

## Sources
1. [{title}]({url}), {publisher}
```

**Response headers:**

- `Content-Type: text/markdown; charset=utf-8`
- `X-Robots-Tag: noindex`, so the copy never competes with the page
- `Link: <canonical>; rel="canonical"`
- `Cache-Control: public, max-age=0, s-maxage=600, stale-while-revalidate=86400`

**Other responses:**

- An invalid slug, or a post that is not public: 404.
- A renamed post's old address: 308 to `/blog/<new>.md`.
- A database error: 503 with `Retry-After: 60`.

### 14.2 RSS (`/blog/rss.xml`)

- **Format:** RSS 2.0 with the `atom`, `content` and `dc` namespaces.
- **Items:** the latest 20 public posts.
- **Channel:** title, link, description, language, copyright, `lastBuildDate` (the newest post's date) and an `atom:link rel="self"`.
- **Each item:**
  - `title`, `link` and `guid isPermaLink="true"` (all the canonical URL), and `pubDate` (RFC 822);
  - `description`: the search description;
  - `dc:creator`: the author;
  - `category`: the section, plus one per tag;
  - `content:encoded`: the **full** rendered HTML in CDATA, led by `<p><strong>In short:</strong> {answer}</p>`. Relative `href`/`src` are made absolute (`/(href|src)="\/(?!\/)/g`), and any `]]>` is split across two CDATA sections.
- **Headers:** `Content-Type: application/rss+xml; charset=utf-8` and `Cache-Control: public, max-age=0, s-maxage=900, stale-while-revalidate=86400`.
- **Why full text:** feed readers, aggregators and AI crawlers quote what they are given.
- **Linked from:** the index page, the footer, and every page's `<link rel="alternate">`.

### 14.3 Sitemap

- **`/blog`:** `lastModified` is the newest post's modified date; `weekly`; priority `0.7`.
- **Each post:** `lastModified` = `content_updated_at ?? published_at ?? updated_at`; `monthly`; priority `0.6`; `images: [coverUrl]`.
- **Left out:** `noindex` posts and posts with an external canonical.
- **When the read fails:** the static entries are served.

### 14.4 robots.txt

No rule is needed when `/` is allowed. The reference site also names the AI crawlers (ClaudeBot, GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended and others) with **the same disallow list as `*`**. A crawler obeys only the most specific group that names it, so a bare `Allow: /` group for those crawlers would open private paths to them.

### 14.5 llms.txt

Add a section listing the latest 20 indexable, self-canonical posts, linked to their Markdown copies, and add `Blog: ${SITE_ORIGIN}/blog` to the contact block.

```markdown
## Blog

Guides from the {SITE_NAME} team. Each link is the post as plain Markdown; the page itself is the same address without .md.

- [Post title](https://site/blog/post-slug.md): {metaDescription || excerpt}
```

### 14.6 Social card (`/blog/<slug>/card`)

- **Size and use:** a 1200×630 PNG, used whenever a post has no social image of its own.
- **Why a route:** it is a route rather than Next's `opengraph-image` file convention, because that convention would override the metadata, and a post with its own image must win.
- **Layout:**
  - left 400 px: paper (`#FBFAF6`) holding a **real QR code of the post's URL** at 280 px (error correction M, 4-module quiet zone, drawn as an SVG path), the wordmark, and `site/blog` underneath;
  - right side: ink (`#16191B`) holding the category in the accent colour, the title in the display face, and the author.
- **Title size** steps down with length: up to 36 characters → 76 px; up to 60 → 64; up to 85 → 54; longer → 46.
- **Cache:** `public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800`. Caching is safe because the URL carries `?v=`.
- **Not public:** 404.
- **Brand-specific:** the QR on the card suits a QR company. Another site can drop it and keep the split composition, or put its own brand mark there.

---

## 15. Real status codes: 404 and 308

**The problem:** a streamed page (React Server Components with Suspense, `loading.tsx` and the like) has already sent `200 OK` by the time it can call `notFound()` or redirect. A draft would then be a "soft 404", and a renamed post's old address would get a meta refresh instead of a 308. Search engines and AI crawlers both treat those badly.

**The fix:** decide the status before the page streams. In Next.js that happens in `proxy.ts`, which was called `middleware.ts` before Next 16, with `"/blog/:slug"` in its matcher. On a framework that does not stream, do the same in the page handler before rendering.

```ts
const BLOG_POST = /^\/blog\/([^/]+)$/;
const BLOG_FILE = /\.(md|xml)$/;          // the feed and the .md copies have their own routes
const NOWHERE = "/_nowhere/404";           // a path no route serves → the site's ordinary 404

export default async function proxy(request: NextRequest) {
  const post = BLOG_POST.exec(request.nextUrl.pathname);
  if (post) return blogPostStatus(request, post[1]);
  return guard(request);                   // the rest of your middleware
}

async function blogPostStatus(request: NextRequest, segment: string) {
  if (BLOG_FILE.test(segment)) return NextResponse.next();

  const slug = segment.toLowerCase();
  if (!SLUG_PATTERN.test(slug)) return NextResponse.rewrite(new URL(NOWHERE, request.url));

  try {
    const found = await resolvePublicSlug(slug);         // the one-query lookup, fail fast
    if (found.kind === "missing") return NextResponse.rewrite(new URL(NOWHERE, request.url));
    const target = found.kind === "moved" ? found.slug : slug;
    if (target !== segment) {
      const moved = request.nextUrl.clone();             // absolute URL: a relative Location throws
      moved.pathname = `/blog/${target}`;
      return NextResponse.redirect(moved, 308);
    }
  } catch (error) {
    console.error("[proxy] blog post lookup failed; leaving it to the page", error);
  }
  return NextResponse.next();
}
```

- **Run it first.** It runs before any auth middleware: posts are public and need no session work.
- **The page check stays.** The page still calls `notFound()` and `permanentRedirect()` as a backstop.
- **When the proxy cannot tell,** because the database is slow or down, it passes the request on and lets the page decide. Give the lookup a short timeout with no retry. The page's own read may retry.
- **The results:**
  - a live post: 200;
  - an old slug or a capitalised address: 308 to the canonical lower-case address;
  - a draft, a scheduled post, an unknown slug or a malformed slug: 404.

---

## 16. Public layout and design

### 16.1 Two surfaces

- **The index stays on the site's dark brand surface ("ink").** It is browsed, so the list belongs to the brand world.
- **A post is read end to end, so it sits on "paper",** a light reading surface, framed by the dark header above and the dark closing band below.
- **Both surfaces keep their colours under `prefers-color-scheme`.**

Shared frame for both: `max-width: 86rem`, gutters of `20px`, `40px` from 640 px and `64px` from 1024 px, centred and left-aligned.

### 16.2 The index (`/blog`)

```
┌ sticky ink header: wordmark ................ Blog  Pricing  Sign in  [Create a code] ┐
│                                                                                    │
│  H1 (display face, max 16ch, clamp 2.75–5.25rem, leading .94)      Follow with RSS │
│  Lede (17px, max 46ch, soft)                                                       │
│                                                                                    │
│  ┌ board ───────────────────────────────────────────────────────────────────────┐  │
│  │ POSTED     ARTICLE                                    SECTION        READ     │  │  ← column heads, ≥640px
│  │ 10 NOV     Title in display face, 1.65rem            Printing       7 min    │  │
│  │ 2025       Excerpt, 15px, muted, max 62ch                                     │  │  ← year only if not this year
│  │───────────────────────────────────────────────────────────────────────────────│  │
│  │ 02 NOV     Next title …                               Menus          5 min    │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                    │
└ footer: company line ..................... Blog · RSS feed · Pricing · legal · logo ┘
```

- **Rows:**
  - one row per post, newest first;
  - **each whole row is a single link**;
  - the grid is `5.25rem 1fr` on phones, and `6.5rem 1fr 9rem 4.5rem` from 640 px, where Section and Read become columns;
  - on phones the section and reading time go under the excerpt as one small line.
- **Hover (pointer devices only):** the row's background lifts slightly (`rgba(255,255,255,.035)`, 120 ms) and the title underlines.
- **Dates:** formatted in the site's time zone. The board shows `10 NOV` and adds the year only when it is not the current year, so an old post is never mistaken for a new one.
- **Empty state:** "Nothing posted yet." / "The first guide is on its way. In the meantime, see how a dynamic code works."
- **Failed read:** "The posts could not be loaded just now." / "Reload the page in a minute." The page still renders.
- **The one authored motion:** the date cells flip once on load, cascading down the first 8 rows at 70 ms per row. This runs inside `@media (prefers-reduced-motion: no-preference)`. QRiate+'s board is a departures board, so its dates are split-flap characters. **Use the equivalent from your own brand's world, or no motion at all.**

### 16.3 The post (`/blog/<slug>`)

```
┌ sticky ink header ─────────────────────────────────────────────────────────────────┐
├ PAPER ─────────────────────────────────────────────────────────────────────────────┤
│  ≥1024px: two columns, 13rem | 46rem (15rem | 46rem from 1280px), gap 3.5–5rem     │
│                                                                                    │
│  Blog / Section            H1 (display, clamp 2.4–4rem, max 22ch, leading .98)     │
│  (breadcrumb)              Dek (19px / 1.55, max 46ch, soft)                       │
│                            ┌────────────┬────────────┬────────────┬──────────────┐ │
│                            │ Written by │ Published  │ Updated    │ Reading time │ │  ← ruled <dl>, 2 cols on phone
│                            │ Name / Role│ 10 Nov 2026│ (if later) │ 7 minutes    │ │
│                            └────────────┴────────────┴────────────┴──────────────┘ │
│                            [ cover figure, full column width ]                     │
│                                                                                    │
│  On this page              ── In short ──────────────────────  (#short-answer)     │
│  (sticky, top 6rem)        19px answer, max 60ch                                   │
│  · Section                 Key takeaways                       (#key-takeaways)    │
│    · Subsection            ── ruled list ──                                        │
│  · Section                                                                         │
│                            Body (18px / 1.7, measure 46rem ≈ 66–75ch)              │
│                                                                                    │
│                            Step by step   (numbered, ruled rows, #step-n anchors)  │
│                            Questions      (<details>, + turns to ×)                │
│                            Sources        (numbered, ruled rows)                   │
├────────────────────────────────────────────────────────────────────────────────────┤
│  Keep reading              ── ruled rows: title ............................ 5 min │
├ INK closing band ──────────────────────────────────────────────────────────────────┤
│  "Print the code once. Change where it points…"            [Create a code] [Pricing]│
└ footer ────────────────────────────────────────────────────────────────────────────┘
```

**Reading order.** This is what a reader wants, and what an answer engine parses: what it is, who wrote it and when, the answer, the takeaways, the body, then the steps, questions and sources.

**Responsive behaviour:**

- **Below 1024 px:**
  - one column;
  - the breadcrumb sits above the H1;
  - the contents become one `<details>` labelled "On this page", above the answer;
  - the meta list has 2 columns, becoming 4 from 640 px.
- **From 1024 px:** the left column holds the breadcrumb and the sticky contents, like a label column on a ledger.

**Section labels.** Keep these exact words, because they are plain and machine-readable:

- "In short"
- "Key takeaways"
- "Step by step"
- "Questions"
- "Sources"
- "Keep reading"
- "On this page"
- in the meta strip: "Written by" (or "Published by" with the site name when no author is set), "Published", "Updated" and "Reading time"

**Component rules:**

- **Short answer:** a 1 px rule in paper ink above it, an h2 "In short", and the answer at 19px/1.6. Its `id="short-answer"` matches the `speakable` selector.
- **Takeaways:** an h2 and a `<ul>` with a rule above and hairline rules between items. Its `id="key-takeaways"` matches the `speakable` selector.
- **Steps:** a `<ol>`. Each row is a grid of `2.75rem | 1fr`: a large display-face number, then the step name (17 px, semibold) and the text (16 px, soft). Each `<li id="step-n">` has `scroll-margin-top`.
- **FAQ:** `<details>` per question, inside `section#faq`.
  - Summary: 17 px, medium weight.
  - The plus icon rotates 45° on open (200 ms ease-out).
  - Answer: 16 px, soft, max 62ch.
  - The browser's disclosure triangle is hidden.
- **Sources:** a numbered `<ol>` (`2rem | 1fr`). Each title links to its source with `rel="noopener"` in the link colour, followed by ", Publisher" in soft text.
- **Author:** linked with `rel="author noopener"` when there is a URL. The role is a second line at 13 px.
- **Dates:** `<time datetime="ISO">` showing "10 November 2026" in the site's time zone.
- **Cover:** a `<figure>` at full column width, loaded with high priority (it is the LCP image), `sizes="(min-width:1024px) 46rem, 100vw"`.
- **Related posts ("Keep reading"):** up to 3 posts, chosen by most shared tags, then newest. Each row is a link with the title in the display face and "N min" right-aligned.
- **Chrome in print:** everything that is not the article (`.post-chrome`) is hidden, and the paper prints white.
- **JSON-LD** goes at the top of the page wrapper.

### 16.4 Colour tokens (reference)

**Brand surface (index, header, closing band, footer):**

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1a1a1a` | Page background |
| `--board` | `#141416` | The index board |
| `--board-rule` | `#2c2d31` | Board rules |
| `--chalk` | `#f6f5f0` | Text |
| `--chalk-soft` | `oklch(0.8 0.004 90)` | Secondary text |
| `--chalk-muted` | `oklch(0.68 0.004 90)` | Muted text, column heads |
| `--cyan` | `#5bc5e8` | Primary button, focus ring |

**Paper (the article), scoped to `.post-sheet`:**

| Token | Value | Use |
|---|---|---|
| `--paper` | `oklch(0.985 0.004 85)` | Background |
| `--paper-ink` | `oklch(0.17 0.006 226)` | Text, strong rules |
| `--paper-soft` | `oklch(0.44 0.006 226)` | Meta, captions, secondary text |
| `--paper-rule` | `oklch(0.87 0.004 85)` | Hairlines |
| `--paper-raised` | `oklch(0.96 0.004 85)` | Code backgrounds |
| `--pin-ink` | `oklch(0.5 0.13 243)` | Links, focus, selection |

**Type:**

- **Display face** (Sarlotte in the reference): H1, H2, H3, section labels, row titles, step numbers and buttons.
- **Text face** (Raleway in the reference): everything else.
- **Monospace:** only for code and URLs in the editor.
- **Numbers:** tabular figures for counts, dates and reading times.

**Re-skin per brand:** swap the two faces and the colour values, and keep the structure: paper to read, the brand surface to browse, ruled rows and never cards.

### 16.5 Article prose CSS (copy as is; it uses only the paper tokens)

```css
.post-sheet {
  --paper: oklch(0.985 0.004 85);
  --paper-ink: oklch(0.17 0.006 226);
  --paper-soft: oklch(0.44 0.006 226);
  --paper-rule: oklch(0.87 0.004 85);
  --paper-raised: oklch(0.96 0.004 85);
  --pin-ink: oklch(0.5 0.13 243);
  --focus: var(--pin-ink);
  background: var(--paper);
  color: var(--paper-ink);
}
.post-sheet ::selection { background: var(--pin-ink); color: var(--paper); }
.post-sheet p, .post-sheet li, .post-sheet dd { text-wrap: pretty; }

.post-body { font-size: 18px; line-height: 1.7; }
.post-body > * + * { margin-top: 1.1em; }
.post-body h2, .post-body h3 {
  font-family: var(--font-display), Georgia, serif;
  font-weight: 400;
  text-wrap: balance;
  scroll-margin-top: 5.5rem;              /* clears the sticky header */
}
.post-body h2 { margin-top: 2.1em; font-size: clamp(1.6rem, 3.2vw, 1.95rem); line-height: 1.1; letter-spacing: -0.012em; }
.post-body h3 { margin-top: 1.7em; font-size: 1.32rem; line-height: 1.2; }
.post-body h4, .post-body h5, .post-body h6 { margin-top: 1.6em; font-size: 1rem; font-weight: 600; }
.post-body :is(h2, h3, h4) + * { margin-top: 0.55em; }
.post-body a { color: var(--pin-ink); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.2em; }
@media (hover: hover) and (pointer: fine) { .post-body a:hover { text-decoration-thickness: 2px; } }
.post-body strong { font-weight: 600; }
.post-body :is(ul, ol) { padding-left: 1.3em; }
.post-body ul { list-style: disc; }
.post-body ol { list-style: decimal; }
.post-body li::marker { color: var(--paper-soft); font-variant-numeric: tabular-nums; }
.post-body li + li { margin-top: 0.4em; }
.post-body blockquote { border-left: 1px solid var(--paper-ink); padding-left: 1.25rem; font-size: 1.1em; line-height: 1.6; }
.post-body code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; background: var(--paper-raised); border-radius: 2px; padding: 0.1em 0.35em; }
.post-body pre { overflow-x: auto; border-top: 1px solid var(--paper-rule); border-bottom: 1px solid var(--paper-rule); background: var(--paper-raised); padding: 1rem 1.25rem; font-size: 14px; line-height: 1.55; }
.post-body pre code { background: none; padding: 0; font-size: inherit; }
.post-body hr { margin: 2.4em 0; border: 0; border-top: 1px solid var(--paper-rule); }
.post-body figure { margin-top: 2em; margin-bottom: 2em; }
.post-body img { display: block; width: 100%; height: auto; }
.post-body figcaption { margin-top: 0.7rem; border-top: 1px solid var(--paper-rule); padding-top: 0.6rem; font-size: 14px; line-height: 1.5; color: var(--paper-soft); }

.post-table { overflow-x: auto; border-top: 1px solid var(--paper-ink); }
.post-table table { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 1.5; font-variant-numeric: tabular-nums; }
.post-table th { text-align: left; font-weight: 600; padding: 0.6rem 1rem 0.6rem 0; border-bottom: 1px solid var(--paper-rule); }
.post-table td { padding: 0.6rem 1rem 0.6rem 0; border-bottom: 1px solid color-mix(in oklch, var(--paper-rule) 70%, transparent); vertical-align: top; }

/* Index rows */
.blog-row { transition: background-color 120ms cubic-bezier(0.23, 1, 0.32, 1); }
@media (hover: hover) and (pointer: fine) {
  .blog-row:hover { background: rgba(255, 255, 255, 0.035); }
  .blog-row:hover .blog-row-title { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.18em; }
}

/* FAQ and contents disclosures */
.faq summary { list-style: none; cursor: pointer; }
.faq summary::-webkit-details-marker { display: none; }
.faq .plus { transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1); }
.faq[open] .plus { transform: rotate(45deg); }

/* Pressable buttons */
.btn { transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), background-color 150ms ease, color 150ms ease; }
.btn:active { transform: scale(0.97); }

@media print {
  .post-chrome { display: none !important; }
  .post-sheet { background: #fff; }
}
```

### 16.6 Design principles

- **Ruled, never boxed.** Structure comes from hairline rules and definition lists, not cards, shadows or gradients. The index is a list of rows, not a grid of cover-image cards.
- **No decorative labels.** All-caps text is used only where it is a real column head on the index.
- **Numbers only for real sequences.** Steps and sources are numbered because they are sequences. Nothing else is.
- **Motion:**
  - one authored moment, on the index;
  - otherwise only feedback: buttons press to `scale(0.97)`, the FAQ plus rotates, rows highlight on hover;
  - easing is `cubic-bezier(0.23, 1, 0.32, 1)`;
  - nothing animates on keyboard actions;
  - all of it sits inside `prefers-reduced-motion: no-preference` or is a hover-only state.
- **Accessibility:**
  - visible keyboard focus in the surface's focus colour;
  - `aria-current="page"` on the Blog nav link on the index;
  - labelled landmarks (`nav aria-label="Breadcrumb"`, "On this page");
  - every image described, which the checklist enforces;
  - pages work at 375 px with no sideways scroll.

---

## 17. The admin

### 17.1 Access and audit

- **Who:** staff only. The reference site checks an admin role read from the database on every request, never from the session token, so revoking access takes effect at once.
- **Each page:** checks again on the server. Non-staff, signed out included, get the site's ordinary 404, so the admin's existence is not revealed.
- **Each server action:** checks again too ("Only staff can do that.").
- **Admin page titles** never say "admin" or "staff".
- **Every page view and every change** writes an audit row.

### 17.2 The post list (`/admin/blog`)

- **Header:** "Blog posts", with a **New post** button.
- **Bulk import:** an **Import .md files** button that opens a file picker (`multiple`, accepting `.md, .markdown, .txt`) and imports straight away ("Importing…"), a "Download the template" link, and a per-file results list.
- **Table columns:** Post (the title, linking to the editor, with `/blog/<slug>` underneath), State (Draft, Scheduled or Published), Publish date, Last edit, Words, Checklist ("N of 18").
- **Order:** newest first, by `coalesce(published_at, updated_at)`.

### 17.3 The editor layout

```
┌ main column (form) ──────────────────────────────┬ sidebar 21rem (≥1280px; below it stacks) ┐
│ Title (2–2.4rem display face, underline only,    │ Publish                    ● Unsaved      │
│   auto-height textarea, newline → space)  57/120 │ ▬ Published 10 Nov 2026, 14:05           │
│ Address  [/blog/][made-from-the-title        ]   │ Publish date [datetime-local]             │
│ Summary  (2 rows)        92 (aim for 80–220)     │ ☐ Mark as updated today                   │
│ ┌ dashed ─────────────────────────────────────┐  │ [Update] [Unpublish]                      │
│ │ [Import a .md file]  Fills every field…     │  │ inline error / notice                     │
│ │ Download the template                       │  │ ⌘S saves and updates the live post.       │
│ └─────────────────────────────────────────────┘  │ Preview saved version · View live ·       │
│ (import note: Filled from x.md: … Undo · Dismiss)│ Download .md                               │
│ Write | Preview               1,240 words, 6 min │──────────────────────────────────────────│
│ [H2][H3][B][I][Link][• List][1. List][Quote]     │ ▾ Checklist     14 of 18 checks pass      │
│ [Table][Image]                                   │ ▾ Search        (Google result preview)   │
│ ┌──────────────────────────────────────────────┐ │ ▾ Answer engines                           │
│ │ monospace textarea, 68vh, resizable          │ │ ▾ Sources                                  │
│ │ (drop .md to import, drop image to upload)   │ │ ▾ Images and sharing (social preview)      │
│ └──────────────────────────────────────────────┘ │ ▾ Author and topics                        │
│ Markdown: ## for sections, **bold**, …           │ ▸ Advanced (closed by default)             │
│                                                  │ [Delete draft]  (drafts only)              │
└──────────────────────────────────────────────────┴───────────────────────────────────────────┘
```

**The editor runs on the paper surface.** It is a work area that staff read and write in for minutes at a time.

### 17.4 The main column

- **Title:**
  - a bare textarea in the display face that grows with its content (`field-sizing: content`);
  - newlines turn into spaces;
  - a counter shows `57/120` and turns to the error colour past the limit;
  - help text: "The headline readers see. It is also the search title unless you set one."
- **Address:**
  - a fixed `/blog/` prefix, then a monospace input;
  - it follows the title (through `slugify`) until staff edit it by hand;
  - typing lower-cases it and turns other characters into `-`, and leaving the field tidies it with `slugify`;
  - help text, once the post is published: "Changing it keeps the old address working: it redirects here."
  - help text otherwise: "Lower-case words and hyphens. Short and keyword-led reads best in search."
- **Summary:**
  - two rows, limit 300, counter aiming for 80–220;
  - help text: "One or two sentences under the headline, and on the blog's index. The search description falls back to it."
- **Import box:** a dashed box with "Import a .md file", the line "Fills every field its frontmatter names, and the body. Or drop the file on the body." and a "Download the template" link.
- **Body:** see section 17.5.

### 17.5 The Markdown field

**Write and Preview tabs.** These are tabs (`role="tablist"`) with a live "N words, M min read" count beside them. Preview renders the title, summary and `renderMarkdown(body)` inside `.post-sheet` with the real `.post-body` styles.

**Toolbar** (`role="toolbar"`): H2, H3, **B**, *I*, Link, • List, 1. List, Quote, Table, and Image when uploads are configured. Each button:

- uses `onMouseDown={e => e.preventDefault()}`, so the textarea keeps its selection;
- presses to `scale(0.97)`;
- has a title tooltip naming its shortcut.

**Shortcuts:**

- ⌘/Ctrl+B, I and K format, inside the textarea only.
- ⌘/Ctrl+S saves from anywhere on the page: no animation, no confirmation, only the result.

**Undo works on toolbar edits.** Compute the new text, find the changed range, select it, then call `document.execCommand("insertText", false, replacement)`. That puts the edit on the textarea's native undo stack, so ⌘Z undoes it. `execCommand` is deprecated, but it is still the only way to do this. If it is unavailable, set the value directly; undo then skips that step.

**Format rules** (pure functions of `(text, selection)`):

| Format | Effect |
|---|---|
| Bold, italic | Wraps the selection in `**` or `_`. With no selection, inserts "bold text" or "italic text" and selects it. |
| Link | `[selection](https://)`, with the `https://` selected so the URL can be typed straight away |
| H2, H3, lists, quote | Prefixes every selected line (`## `, `### `, `- `, `1. ` `2. `…, `> `), replacing any existing prefix. If every line already has the marker, removes it. |
| Table | Inserts a 2×2 Markdown table after the selection, with the first "Column" selected |
| Image upload | Inserts `![Describe the image](url)` on a line of its own, with "Describe the image" selected so the alt text gets written |

```ts
export function applyFormat(value: string, sel: { start: number; end: number }, format: Format): Edit {
  switch (format) {
    case "bold": return wrap(value, sel, "**", "**", "bold text");
    case "italic": return wrap(value, sel, "_", "_", "italic text");
    case "link": {
      const text = value.slice(sel.start, sel.end) || "link text";
      const next = value.slice(0, sel.start) + `[${text}](https://)` + value.slice(sel.end);
      const urlStart = sel.start + text.length + 3;
      return { value: next, selection: { start: urlStart, end: urlStart + "https://".length } };
    }
    case "h2": return prefixLines(value, sel, () => "## ", /^## /);
    case "h3": return prefixLines(value, sel, () => "### ", /^### /);
    case "list": return prefixLines(value, sel, () => "- ", /^- /);
    case "numbered": return prefixLines(value, sel, (i) => `${i + 1}. `, /^\d+\. /);
    case "quote": return prefixLines(value, sel, () => "> ", /^> /);
    case "table": {
      const TABLE = "\n| Column | Column |\n| --- | --- |\n| Value | Value |\n";
      const next = value.slice(0, sel.end) + TABLE + value.slice(sel.end);
      const start = sel.end + TABLE.indexOf("Column");
      return { value: next, selection: { start, end: start + "Column".length } };
    }
  }
}
// prefixLines: expand the selection to whole lines; if every line matches the marker,
// strip it; otherwise strip any existing /^(#{1,6} |> |- |\d+\. )/ and add the marker.
```

**Dragging onto the body:**

- A `.md`, `.markdown` or `.txt` file is imported.
- An image is uploaded.
- While a file is dragged over it, the textarea's border turns dashed.

**Uploads:**

- The upload is checked in the browser first: PNG, JPEG or WebP, up to 4 MB.
- The finished upload is inserted at the cursor as it is *then*, since staff may have kept typing.
- Upload errors stay inline under the field.

**Help line under the field:** "Markdown: ## for sections, **bold**, [links](https://…), - lists, > quotes, tables. HTML is shown as text, never run. The title is the page's headline, so start sections at ##."

### 17.6 The sidebar panels, in order

Each panel is a `<details open>`, with a display-face title, a one-line description and a chevron that rotates.

1. **Publish** (always shown, not collapsible):
   - **Unsaved changes:** a small dot labelled "Unsaved changes" appears while there are edits not yet saved. Closing the tab while it shows asks for confirmation (`beforeunload`).
   - **Status line,** with a coloured bar: "Draft", "Scheduled for {date}", "Published {date}" or "New draft, not saved yet".
   - **Publish date:**
     - a `datetime-local` input in the browser's time zone, converted to ISO on submit and sent only when staff changed it;
     - it renders only after mount, to avoid a time-zone hydration mismatch;
     - help text: "Empty publishes now. A future date schedules it; it goes live on its own. In your computer's time zone."
   - **Mark as updated today:** shown only for published posts. Help text: "For a real change to what the post says. Readers and search engines see the new date; leave it off for typo fixes."
   - **Buttons:**
     - a draft gets **Publish** (which reads **Schedule** when the date is in the future) and **Save draft**;
     - a published post gets **Update** and **Unpublish**;
     - Unpublish asks for confirmation: "Unpublish this post? Its address will show the site's 404 until you publish it again.", or, for a scheduled post, "Cancel the schedule and make this a draft again?".
   - **Messages:** errors inline, and success as a toast whose word matches the button.
   - **Shortcut hint:** "⌘S saves the draft", or "⌘S saves and updates the live post" on a published post.
   - **Links:** Preview saved version (new tab), View live (only when public), Download .md.
2. **Checklist:** "What helps a post be found, answered from and quoted. Guidance only: nothing here stops a publish."
3. **Search:** "How the post appears in Google and Bing."
   - a **Google result preview**: a round site badge with the site name and `https://host › blog › slug`, then the title in link blue (`#1a0dab`) cut to one line, then the description cut to two lines. With no description it says "No description yet. Search engines will pick a line from the post instead.";
   - the **Search title** field: placeholder `{Title} · {SITE_NAME}`, counter aiming for 30–60, limit 70;
   - the **Search description** field: counter aiming for 70–160, limit 200;
   - the **Focus keyword** field;
   - the **Keywords** field: a comma list.
4. **Answer engines:** "What Google's answer boxes, voice assistants, ChatGPT and Perplexity quote. Shown at the top and bottom of the post."
   - **Short answer:** a word counter aiming for 40–60;
   - **Key takeaways:** a row list of up to 7;
   - **Questions:** a row list of up to 12, each with a question and a multi-line answer;
   - **Steps:** a row list of up to 15, each with "Step" and "What to do".
5. **Sources:** "Where the facts come from. Cited posts are quoted more by generative engines, and readers trust them more."
   - Each row has a Title, an Address (`https://`) and a "Publisher (optional)".
6. **Images and sharing:** "The cover leads the post. Shares use a generated card unless you set a social image."
   - a cover image (upload or paste), plus the cover description;
   - a social title, social description and social image;
   - a **shared-link preview** at 1.91:1, showing the social image, or the generated card drawn in outline, with the host, title and description beneath.
7. **Author and topics:** "A named author and clear topics help search engines judge who the advice comes from and what it covers."
   - Author, Author's role, Author page;
   - Section: "One word or two. Shown on the blog's board.";
   - Tags: "Separate with commas. Posts sharing a tag are suggested after each other.";
   - Topics: "The things the post is about, as a search engine would name them."
8. **Advanced** (closed by default): Canonical address ("only if this post first appeared on another site") and Hide from search (noindex).

**Delete draft** sits at the bottom. It appears for drafts only, asks for confirmation ("Delete this draft? It cannot be brought back.") and redirects to the list.

**Field widgets:**

- **Counter:**
  - neutral grey normally;
  - amber when outside the target range, meaning "worth a look" rather than wrong;
  - the error colour only past the hard limit a save would refuse;
  - tabular figures.
- **Row lists:** add, remove, and move up or down, up to the maximum, after which they say "That is the most this post can carry (N)."

### 17.7 Save and publish flow

The form sends:

- `post` as one JSON field holding the whole post;
- `intent` (save, publish or unpublish), from the button pressed;
- `publishAt` (ISO, or empty);
- `markUpdated`;
- `id` for an existing post.

On the server:

1. Check the user is staff.
2. Validate the intent.
3. Parse the JSON and validate it with `postFieldsSchema`.
4. When publishing, also require `postSchema` to pass and the body to be non-empty.

| Situation | Result |
|---|---|
| New post, Save draft | Create, then redirect to `/admin/blog/<id>` with a flash toast "Post created". Description: "It is a draft until you publish it." |
| New post, Publish | Create and publish, then redirect with the toast "Published" ("The post is live on the blog."), or "Scheduled" ("The post goes live on its publish date.") |
| Draft, Save draft | "Saved." |
| Published post, saved with ⌘S | "Saved. The live post shows the changes." |
| Scheduled post, saved with ⌘S | "Saved. It is still scheduled." |
| Draft, Publish, live now | "Published. It is live at /blog/{slug}." |
| Publish with a future date | "Scheduled. It goes live {date, time}." |
| Published post, Update | "Updated. The live post at /blog/{slug} shows the changes." |
| Unpublish | "Unpublished. It is a draft again, and its address shows the site's 404." |
| Delete | Redirect to the list with the toast "Draft deleted" |
| Validation error | Inline, in the field's own words: "Search title: Keep it under 70 characters." |
| Slug taken | "Address: Another post already lives at /blog/x. Choose another address." |
| Body empty on publish | "Body: write the post before publishing it." |
| Cover without alt on publish | "Cover description: Describe the cover image for people who cannot see it." |
| Post deleted in another tab | "That post no longer exists. It may have been deleted in another tab." |

After every change, the server revalidates `/blog`, the old and new post paths, `/admin/blog` and the editor page.

### 17.8 Preview page (`/admin/blog/<id>/preview`)

This page renders the **saved** post with the same `Article` component as the public page, whatever the post's state. An amber bar sits on top with one of these messages:

- "Preview of a draft. Readers cannot see it."
- "Preview of a scheduled post. Readers cannot see it yet."
- "Preview of the saved post. It is live."

The bar also has a "Back to the editor" link. The page is `noindex`.

### 17.9 Image uploads

- **Endpoint:** a staff-only upload endpoint, whose middleware reads the session and checks the admin role before any upload URL is issued.
- **Types and size:** PNG, JPEG and WebP only, up to 4 MB. **No SVG**, since an SVG can carry script.
- **After the upload:** the file is recorded in `blog_images`. If recording fails, the uploaded file is deleted, so no orphan is left behind.
- **Where it is used:** the cover, the social image and inline figures. Each can be uploaded or pasted as an https URL.
- **On the public page,** images from your own CDN go through the framework's image optimiser. Anything else is a plain `<img>`.

---

## 18. Security rules

- **Raw HTML in Markdown is never rendered** (`html: false`). Do not add an HTML sanitiser and switch it on. Being unable to render HTML is the safety.
- **Links and images are restricted by scheme:** see section 9. Images must be https.
- **Frontmatter cannot run code:** it is parsed by `yaml` with an alias cap. `---js` is never treated as frontmatter.
- **Every URL field is https-only.**
- **JSON-LD escapes `<`.**
- **The RSS feed** escapes every text node, and CDATA is split around `]]>`.
- **Server-side checks:** every write re-checks staff on the server and validates with zod.
- **Pages:** admin pages check on the server. A middleware matcher protects pages, not data.
- **The upload endpoint** checks the role before issuing an upload URL, and refuses SVG.
- **No raw IPs or personal data** are stored anywhere in the blog.

---

## 19. Tests to port

The four pure modules need no database to test: the reference build has 62 tests across them. The proxy cases mock the one lookup.

**Markdown (`renderMarkdown`):**

- raw HTML such as `<script>` and `<img onerror>` is escaped, not rendered;
- `javascript:` and `data:` links are dropped, leaving the text;
- http(s), `mailto:`, `tel:`, site-relative and anchor links are kept;
- protocol-relative `//` links are refused;
- only https images render; anything else becomes its alt text;
- h2 and h3 get ids, repeated headings get unique ids, and the contents are built;
- heading text is read through emphasis, code and links;
- every heading level is recorded, including an h1, which the checklist flags;
- external links get `noopener`, and internal links are counted;
- a lone image becomes a figure, with its title as the caption;
- tables are wrapped;
- the first paragraph is found, with wrapped lines joined by a space;
- words and reading time are counted, and the reading time is never under 1 minute;
- `plainText` strips the Markdown and trims at a word.

**Frontmatter:**

- this blog's own keys are read;
- other site generators' keys are mapped;
- the fields filled are reported in the editor's labels;
- a file with no frontmatter imports as the body, and a leading `#` heading becomes the title;
- a `#` heading stays in the body when the frontmatter names a different title;
- bad YAML reports its line;
- `---js` is never treated as frontmatter;
- a `---` inside a value does not end the block;
- files over the size cap are refused;
- frontmatter that is not a mapping is refused;
- an unreadable date gives a warning rather than a guess;
- a byte-order mark is stripped;
- the export round-trips;
- empty fields are left out of the export;
- the template parses and validates.

**Schema:**

- `slugify` makes a lower-case hyphenated address, folds accents, says `&` as "and", drops apostrophes, and cuts at a word, never mid-word;
- a minimal post is accepted, and an address typed with capitals is lower-cased;
- only https addresses are taken for links and images;
- a cover image needs a description;
- blank FAQ rows and repeated tags are dropped, and tags are lower-cased;
- the first problem names its field and row;
- the number of takeaways is capped;
- a draft is never public whatever its date; a published post with a future date is scheduled; one whose date has passed is public.

**SEO:**

- the title is the headline plus the site name when no search title is set, and the search title exactly when one is;
- the canonical points at the post, or at the original when the post first ran elsewhere;
- a post is indexable by default with large previews allowed; a noindex post stays out of search but its links are followed;
- the generated card is shared, versioned by the last save, unless a social image is set;
- the Markdown copy and the feed are linked;
- the BlogPosting carries its dates, author and publisher, and falls back to the organisation as author when none is named;
- the substantive-update date is used as `dateModified`;
- FAQPage and HowTo appear only when the post has them;
- the short answer, sources and topics are carried for answer and generative engines;
- missing values are left out rather than written empty;
- the index lists the posts in order;
- `<` is escaped, so a title cannot close the script tag;
- the checklist passes a post set up to be found and quoted; flags a body h1, a skipped heading level and a missing image description; reports every keyword check as needing a keyword when none is set; and matches the keyword in the address by its slug form.

**Proxy:**

- a live post passes to the page without touching the session;
- a draft, a scheduled post or an unknown address gets the ordinary 404;
- an address a post used to have gets a 308 to where it lives now, keeping the query;
- the page decides when the database cannot answer;
- the feed and the Markdown copies pass on to their own routes;
- an address that can never be a slug gets a 404 without a lookup;
- an address typed with capitals gets a 308 to its lower-case form;
- the matcher matches one segment under `/blog`, never the index or a post's card.

---

## 20. Launch checklist

**Before merging:**

- [ ] Tests, lint and the production build pass. If your build must work without secrets, every blog route reads the database per request, never at build time.
- [ ] Migrations apply cleanly to a copy of the production schema.
- [ ] If the host shares its URL namespace with user content, nobody already owns `blog`.
- [ ] By hand, against seeded posts:
  - a live post returns 200;
  - an old slug and a capitalised address return 308;
  - a draft, a scheduled post and an unknown address return 404;
  - `.md`, RSS, sitemap, `llms.txt`, the card PNG, head tags and JSON-LD are all correct;
  - the editor's import, toolbar, undo, checklist and preview work;
  - pages work at 375 px, and reduced motion is respected.

**After deploying:**

- [ ] Signed in as staff: create a post, upload a cover, publish it, schedule a second post for later, rename a published post and confirm the 308.
- [ ] Signed out, the admin returns 404.
- [ ] Run a post through Google's Rich Results Test and the Schema.org validator.
- [ ] Submit the sitemap in Google Search Console and Bing Webmaster Tools.
- [ ] Share a post in a chat app and check that the card appears.

**Writing guidance for staff, which the checklist encodes:**

- Answer the title's question in the first paragraph and in the short answer (40–60 words).
- Use the focus keyword in the title, description, address, first paragraph and one subheading.
- Use 3 to 5 takeaways that each stand alone.
- Add at least 2 real questions, and steps when the post is a how-to.
- Cite your sources.
- Name the author.
- Link to at least one other page on the site.
- Describe every image.
- Start sections at `##`, never `#`.

---

## 21. Pitfalls already hit

| Problem | Cause | Fix |
|---|---|---|
| Drafts and unknown posts answered 200; renamed posts used a meta refresh | Streaming sends 200 before `notFound()` or a redirect can run | Decide the status in the proxy (section 15) |
| `NextResponse.redirect` threw "Invalid URL" | A relative `Location` in the proxy | Clone `request.nextUrl` and set its `pathname` |
| `plainText` crashed | markdown-it ran with `{}` as env while the core rule wrote into `env.toc` | Always pass a fresh, fully shaped env |
| Frontmatter ended early | The closing `---` regex matched mid-line | The closing fence must start its own line |
| Code ran from an uploaded file | `gray-matter` evaluates `---js` | Use `yaml` and only recognise `---` |
| Bulk import failed silently on large batches | The Server Action body cap is 1 MB | Check the total size in the browser (900 KB) and say so |
| "use server" file refused an exported constant | Server-action files may only export async functions | Keep constants in a shared module |
| The `datetime-local` value differed between server and browser | Time zones | Render the input after mount; convert to ISO on submit |
| A cover image vanished a week later | The site's sweep of uploads no record points at | A separate `blog_images` table that no sweep touches |
| `og:image` showed the site's default card | Next merges `openGraph` shallowly | Return the whole `openGraph` object for each post |
| Satori card `<img>` lint warnings | `next/image` does not apply inside `ImageResponse` | A file-level eslint disable for that rule |
| Headline and lede on the index said the same thing | Copy | Make the H1 the promise and the lede the specifics |
| Testing publishing on a preview deploy failed | Previews shared the production database, whose migrations run only on the production deploy | Test signed-in publishing on production straight after the merge, or give previews their own database branch |
