-- 031: the blog at /blog, written by staff from /admin/blog.
--
-- One row per post. The body is Markdown, stored as written and rendered on
-- the way out by `src/lib/blog-markdown.ts`, which never passes raw HTML
-- through. Everything around the body is there for a search engine or an
-- answer engine to read: the search title and description, the short answer
-- and key takeaways (quoted by answer boxes and generative engines), a FAQ and
-- steps (structured data), sources (cited), and the entities the post is
-- about. Validation is `src/lib/blog-schema.ts`, on save and on import.
--
-- A post is public when it is published and its publish date has passed, so
-- a future date schedules it with no job to run. That one predicate is used
-- by the index, the post page, the feed, the sitemap and llms.txt.
--
-- `content_updated_at` is the "Updated" date readers and crawlers see. It is
-- set only when staff say the change is substantive, never by a typo fix, so
-- the date stays honest.
--
-- Nothing here is read by the redirect path, and no existing table changes.

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
  faq                 jsonb        not null default '[]',
  steps               jsonb        not null default '[]',
  sources             jsonb        not null default '[]',
  about               text[]       not null default '{}',

  -- Who wrote it, for readers and for the article's structured data.
  author_name         text,
  author_role         text,
  author_url          text,

  category            text,
  tags                text[]       not null default '{}',

  -- The publish date. In the future means scheduled. A draft can carry one,
  -- from an imported file, and keeps it for when it is published.
  published_at        timestamptz,
  -- Set on the first publish and never cleared. Only an address that was
  -- once live is worth redirecting when the slug changes.
  ever_published      boolean      not null default false,
  content_updated_at  timestamptz,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now(),
  created_by          uuid         references qr_users (id) on delete set null,
  updated_by          uuid         references qr_users (id) on delete set null,

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

-- The public list, newest first: the index, the feed and the sitemap.
create index blog_posts_public_idx
  on blog_posts (published_at desc)
  where status = 'published';

-- Related posts are the ones sharing a tag.
create index blog_posts_tags_idx on blog_posts using gin (tags);

-- The addresses a post used to have. Renaming a published post keeps its old
-- links and rankings: the old slug answers with a permanent redirect to the
-- new one. This is the blog, not the redirect path, so 308 is correct here.
create table blog_post_slugs (
  slug        text         primary key,
  post_id     bigint       not null references blog_posts (id) on delete cascade,
  created_at  timestamptz  not null default now()
);

create index blog_post_slugs_post_idx on blog_post_slugs (post_id);
