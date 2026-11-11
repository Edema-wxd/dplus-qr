import { query, queryOne, withTransaction } from "@/lib/db";
import {
  type FaqItem,
  type Post,
  type PostFields,
  type PostStatus,
  type Source,
  type Step,
} from "@/lib/blog-schema";

/**
 * The blog's SQL. Public reads for `/blog`, and staff reads and writes for
 * `/admin/blog`. Validation happens before anything reaches here
 * (`postSchema` in `blog-schema.ts`); these functions trust their input's
 * shape and enforce only what the database must: unique addresses, and a
 * renamed post keeping its old ones.
 *
 * Not client data, so there is no account scope: posts belong to the site,
 * and only staff actions write them.
 */

/** Public: published, and the publish date has passed. Used by every public read. */
const PUBLIC = `status = 'published' and published_at <= now()`;

const COLUMNS = `
  id, slug, status, title, excerpt, body_md, seo_title, meta_description,
  focus_keyword, keywords, canonical_url, noindex, og_title, og_description,
  og_image_url, cover_url, cover_alt, answer, takeaways, faq, steps, sources,
  about, author_name, author_role, author_url, category, tags, published_at,
  content_updated_at, created_at, updated_at`;

/** Enough for a list, without the body: words are estimated in the database. */
const SUMMARY_COLUMNS = `
  id, slug, status, title, excerpt, meta_description, category, tags,
  cover_url, cover_alt, canonical_url, noindex, published_at,
  content_updated_at, updated_at,
  coalesce(array_length(regexp_split_to_array(btrim(body_md), '\\s+'), 1), 0) as word_estimate`;

type PostRow = {
  id: string;
  slug: string;
  status: PostStatus;
  title: string;
  excerpt: string;
  body_md: string;
  seo_title: string | null;
  meta_description: string | null;
  focus_keyword: string | null;
  keywords: string[];
  canonical_url: string | null;
  noindex: boolean;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  cover_url: string | null;
  cover_alt: string | null;
  answer: string | null;
  takeaways: string[];
  faq: FaqItem[];
  steps: Step[];
  sources: Source[];
  about: string[];
  author_name: string | null;
  author_role: string | null;
  author_url: string | null;
  category: string | null;
  tags: string[];
  published_at: Date | null;
  content_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type SummaryRow = Pick<
  PostRow,
  | "id"
  | "slug"
  | "status"
  | "title"
  | "excerpt"
  | "meta_description"
  | "category"
  | "tags"
  | "cover_url"
  | "cover_alt"
  | "canonical_url"
  | "noindex"
  | "published_at"
  | "content_updated_at"
  | "updated_at"
> & { word_estimate: number };

export type PostSummary = {
  id: number;
  slug: string;
  status: PostStatus;
  title: string;
  excerpt: string;
  metaDescription: string;
  category: string;
  tags: string[];
  coverUrl: string;
  coverAlt: string;
  canonicalUrl: string;
  noindex: boolean;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  updatedAt: string;
  readingMinutes: number;
};

const iso = (date: Date | null) => (date ? date.toISOString() : null);

function toPost(row: PostRow): Post {
  return {
    id: Number(row.id),
    status: row.status,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMd: row.body_md,
    seoTitle: row.seo_title ?? "",
    metaDescription: row.meta_description ?? "",
    focusKeyword: row.focus_keyword ?? "",
    keywords: row.keywords ?? [],
    canonicalUrl: row.canonical_url ?? "",
    noindex: row.noindex,
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImageUrl: row.og_image_url ?? "",
    coverUrl: row.cover_url ?? "",
    coverAlt: row.cover_alt ?? "",
    answer: row.answer ?? "",
    takeaways: row.takeaways ?? [],
    faq: (row.faq ?? []).map((item) => ({ q: item.q ?? "", a: item.a ?? "" })),
    steps: (row.steps ?? []).map((item) => ({ name: item.name ?? "", text: item.text ?? "" })),
    sources: (row.sources ?? []).map((item) => ({
      title: item.title ?? "",
      url: item.url ?? "",
      publisher: item.publisher ?? "",
    })),
    about: row.about ?? [],
    authorName: row.author_name ?? "",
    authorRole: row.author_role ?? "",
    authorUrl: row.author_url ?? "",
    category: row.category ?? "",
    tags: row.tags ?? [],
    publishedAt: iso(row.published_at),
    contentUpdatedAt: iso(row.content_updated_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toSummary(row: SummaryRow): PostSummary {
  return {
    id: Number(row.id),
    slug: row.slug,
    status: row.status,
    title: row.title,
    excerpt: row.excerpt,
    metaDescription: row.meta_description ?? "",
    category: row.category ?? "",
    tags: row.tags ?? [],
    coverUrl: row.cover_url ?? "",
    coverAlt: row.cover_alt ?? "",
    canonicalUrl: row.canonical_url ?? "",
    noindex: row.noindex,
    publishedAt: iso(row.published_at),
    contentUpdatedAt: iso(row.content_updated_at),
    updatedAt: row.updated_at.toISOString(),
    readingMinutes: Math.max(1, Math.round(Number(row.word_estimate) / 230)),
  };
}

/** Empty strings are stored as null, so "not set" has one spelling in the database. */
const orNull = (value: string) => (value.trim() === "" ? null : value);

/** The write parameters for every editable column, in `FIELD_COLUMNS` order. */
function fieldParams(post: PostFields): unknown[] {
  return [
    post.slug,
    post.title,
    post.excerpt,
    post.bodyMd,
    orNull(post.seoTitle),
    orNull(post.metaDescription),
    orNull(post.focusKeyword),
    post.keywords,
    orNull(post.canonicalUrl),
    post.noindex,
    orNull(post.ogTitle),
    orNull(post.ogDescription),
    orNull(post.ogImageUrl),
    orNull(post.coverUrl),
    orNull(post.coverAlt),
    orNull(post.answer),
    post.takeaways,
    JSON.stringify(post.faq),
    JSON.stringify(post.steps),
    JSON.stringify(post.sources),
    post.about,
    orNull(post.authorName),
    orNull(post.authorRole),
    orNull(post.authorUrl),
    orNull(post.category),
    post.tags,
  ];
}

const FIELD_COLUMNS = [
  "slug",
  "title",
  "excerpt",
  "body_md",
  "seo_title",
  "meta_description",
  "focus_keyword",
  "keywords",
  "canonical_url",
  "noindex",
  "og_title",
  "og_description",
  "og_image_url",
  "cover_url",
  "cover_alt",
  "answer",
  "takeaways",
  "faq",
  "steps",
  "sources",
  "about",
  "author_name",
  "author_role",
  "author_url",
  "category",
  "tags",
] as const;

const JSONB = new Set(["faq", "steps", "sources"]);
const cast = (column: string, index: number) => `$${index}${JSONB.has(column) ? "::jsonb" : ""}`;

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

export async function listPublicPosts(limit = 200): Promise<PostSummary[]> {
  const rows = await query<SummaryRow>(
    `select ${SUMMARY_COLUMNS} from blog_posts
     where ${PUBLIC}
     order by published_at desc, id desc
     limit $1`,
    [limit]
  );
  return rows.map(toSummary);
}

/** Whole posts, newest first: the feed carries each one's full text. */
export async function listPublicPostsWithBody(limit = 20): Promise<Post[]> {
  const rows = await query<PostRow>(
    `select ${COLUMNS} from blog_posts
     where ${PUBLIC}
     order by published_at desc, id desc
     limit $1`,
    [limit]
  );
  return rows.map(toPost);
}

export type PublicLookup = { post: Post } | { movedTo: string } | null;

/**
 * A post by its address. An address the post used to have answers with where
 * it lives now, so the page can redirect; a draft, a scheduled post or an
 * unknown address is null.
 */
export async function getPublicPost(slug: string): Promise<PublicLookup> {
  const row = await queryOne<PostRow>(`select ${COLUMNS} from blog_posts where slug = $1 and ${PUBLIC}`, [slug]);
  if (row) return { post: toPost(row) };

  const moved = await queryOne<{ slug: string }>(
    `select p.slug from blog_post_slugs s
     join blog_posts p on p.id = s.post_id
     where s.slug = $1 and p.status = 'published' and p.published_at <= now()`,
    [slug]
  );
  return moved ? { movedTo: moved.slug } : null;
}

export type SlugResolution = { kind: "live" } | { kind: "moved"; slug: string } | { kind: "missing" };

/**
 * What a post address answers, in one small read, for `proxy.ts`: the page
 * streams, so by the time it could call `notFound()` or redirect, a 200 has
 * gone out. The proxy asks this first and answers 404 or 308 properly.
 * `failFast`: the proxy passes the request on if the database is slow, and
 * the page, which retries, decides instead.
 */
export async function resolvePublicSlug(slug: string): Promise<SlugResolution> {
  const row = await queryOne<{ live: boolean; moved_to: string | null }>(
    `select
       exists (select 1 from blog_posts where slug = $1 and ${PUBLIC}) as live,
       (select p.slug from blog_post_slugs s
          join blog_posts p on p.id = s.post_id
         where s.slug = $1 and p.status = 'published' and p.published_at <= now()) as moved_to`,
    [slug],
    { failFast: true }
  );
  if (row?.live) return { kind: "live" };
  if (row?.moved_to) return { kind: "moved", slug: row.moved_to };
  return { kind: "missing" };
}

/** Posts sharing the most tags with this one, then the newest, so every post links on. */
export async function relatedPosts(post: Pick<Post, "id" | "tags">, limit = 3): Promise<PostSummary[]> {
  const rows = await query<SummaryRow>(
    `select ${SUMMARY_COLUMNS},
       cardinality(array(select unnest(tags) intersect select unnest($2::text[]))) as shared
     from blog_posts
     where ${PUBLIC} and id <> $1
     order by shared desc, published_at desc
     limit $3`,
    [post.id, post.tags, limit]
  );
  return rows.map(toSummary);
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function listPostsForStaff(): Promise<Post[]> {
  const rows = await query<PostRow>(
    `select ${COLUMNS} from blog_posts order by coalesce(published_at, updated_at) desc, id desc limit 500`
  );
  return rows.map(toPost);
}

export async function getPost(id: number): Promise<Post | null> {
  const row = await queryOne<PostRow>(`select ${COLUMNS} from blog_posts where id = $1`, [id]);
  return row ? toPost(row) : null;
}

export type PostChange =
  | { ok: true; id: number; slug: string }
  | { ok: false; error: string; /** The address is taken; another might not be. */ clash?: boolean };

function isSlugClash(error: unknown): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === "23505" && pgError.constraint === "blog_posts_slug_key";
}

const takenBy = (slug: string) => `Another post already lives at /blog/${slug}. Choose another address.`;

/** A former address of another post stays that post's, so its old links keep working. */
async function formerOwner(
  run: <R extends Record<string, unknown>>(text: string, params?: readonly unknown[]) => Promise<R[]>,
  slug: string,
  id: number | null
): Promise<string | null> {
  const [row] = await run<{ title: string; post_id: string }>(
    `select p.title, s.post_id from blog_post_slugs s join blog_posts p on p.id = s.post_id where s.slug = $1`,
    [slug]
  );
  if (!row || (id !== null && Number(row.post_id) === id)) return null;
  return row.title;
}

/**
 * A new draft. The unique index decides a clash, not a check first; a slug
 * that is another post's old address is refused, because that address is
 * already printed in somebody's links.
 */
export async function createPost(
  post: PostFields,
  staffId: string,
  dates: { publishedAt?: string | null; contentUpdatedAt?: string | null } = {}
): Promise<PostChange> {
  try {
    return await withTransaction(async (run) => {
      const former = await formerOwner(run, post.slug, null);
      if (former) {
        return { ok: false, error: `/blog/${post.slug} redirects to “${former}”. Choose another address.`, clash: true };
      }

      const columns = [...FIELD_COLUMNS, "published_at", "content_updated_at", "created_by", "updated_by"];
      const params = [...fieldParams(post), dates.publishedAt ?? null, dates.contentUpdatedAt ?? null, staffId, staffId];
      const [row] = await run<{ id: string }>(
        `insert into blog_posts (${columns.join(", ")})
         values (${columns.map((column, i) => cast(column, i + 1)).join(", ")})
         returning id`,
        params
      );
      return { ok: true as const, id: Number(row.id), slug: post.slug };
    });
  } catch (error) {
    if (isSlugClash(error)) return { ok: false, error: takenBy(post.slug), clash: true };
    throw error;
  }
}

/**
 * Save a post's fields. Renaming a post that was ever live keeps the old
 * address as a redirect; renaming it back to an address it once had takes
 * that address out of the redirect list.
 *
 * `markUpdated` is staff saying the change is substantive. Only then does the
 * post's visible "Updated" date move, so fixing a typo never fakes freshness.
 */
export async function updatePost(
  id: number,
  post: PostFields,
  staffId: string,
  options: { markUpdated?: boolean; publishedAt?: string | null } = {}
): Promise<PostChange> {
  try {
    return await withTransaction(async (run) => {
      const [current] = await run<{ slug: string; ever_published: boolean }>(
        `select slug, ever_published from blog_posts where id = $1 for update`,
        [id]
      );
      if (!current) return { ok: false, error: "That post no longer exists." };

      if (current.slug !== post.slug) {
        const former = await formerOwner(run, post.slug, id);
        if (former) return { ok: false, error: `/blog/${post.slug} redirects to “${former}”. Choose another address.` };
        await run(`delete from blog_post_slugs where slug = $1 and post_id = $2`, [post.slug, id]);
        if (current.ever_published) {
          await run(
            `insert into blog_post_slugs (slug, post_id) values ($1, $2)
             on conflict (slug) do update set post_id = excluded.post_id`,
            [current.slug, id]
          );
        }
      }

      const params = fieldParams(post);
      const assignments = FIELD_COLUMNS.map((column, i) => `${column} = ${cast(column, i + 2)}`);
      let next = FIELD_COLUMNS.length + 2;
      assignments.push(`updated_by = $${next++}`);
      params.push(staffId);
      if (options.publishedAt !== undefined) {
        assignments.push(`published_at = coalesce($${next++}::timestamptz, published_at)`);
        params.push(options.publishedAt);
      }
      if (options.markUpdated) assignments.push(`content_updated_at = now()`);
      assignments.push(`updated_at = now()`);

      await run(`update blog_posts set ${assignments.join(", ")} where id = $1`, [id, ...params]);
      return { ok: true as const, id, slug: post.slug };
    });
  } catch (error) {
    if (isSlugClash(error)) return { ok: false, error: takenBy(post.slug) };
    throw error;
  }
}

/**
 * Publish, or schedule when the date is in the future. A post that already has
 * a date keeps it unless staff gave a new one, so republishing after a pull
 * does not make an old post look new.
 */
export async function publishPost(id: number, staffId: string, publishAt: string | null): Promise<Post | null> {
  const row = await queryOne<PostRow>(
    `update blog_posts
     set status = 'published',
         published_at = coalesce($2::timestamptz, published_at, now()),
         ever_published = true,
         updated_by = $3,
         updated_at = now()
     where id = $1
     returning ${COLUMNS}`,
    [id, publishAt, staffId]
  );
  return row ? toPost(row) : null;
}

/** Back to a draft. The publish date stays, for when it goes out again. */
export async function unpublishPost(id: number, staffId: string): Promise<Post | null> {
  const row = await queryOne<PostRow>(
    `update blog_posts set status = 'draft', updated_by = $2, updated_at = now()
     where id = $1
     returning ${COLUMNS}`,
    [id, staffId]
  );
  return row ? toPost(row) : null;
}

/** Drafts only: a published post is unpublished first, so nothing live disappears by one click. */
export async function deletePost(id: number): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `delete from blog_posts where id = $1 and status = 'draft' returning id`,
    [id]
  );
  return rows.length > 0;
}

export async function recordBlogImage(file: {
  key: string;
  url: string;
  name: string;
  type: string;
  size: number;
  staffId: string;
}): Promise<void> {
  await query(
    `insert into blog_images (file_key, url, name, mime_type, size_bytes, uploaded_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (file_key) do nothing`,
    [file.key, file.url, file.name, file.type, file.size, file.staffId]
  );
}
