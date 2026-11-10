import { connection } from "next/server";
import { CODE_ORIGIN, PRODUCT_NAME } from "@/lib/brand";
import { listPublicPostsWithBody } from "@/lib/blog";
import { renderMarkdown } from "@/lib/blog-markdown";
import type { Post } from "@/lib/blog-schema";
import { BLOG_DESCRIPTION, BLOG_NAME, BLOG_URL, FEED_URL, canonicalUrl, searchDescription } from "@/lib/blog-seo";

/**
 * Serves /blog/rss.xml: the latest 20 public posts, each with its full text.
 *
 * Full text rather than a teaser, because feed readers, aggregators and the
 * crawlers that read feeds quote what they are given. Relative links in a
 * post are made absolute, since a feed is read away from this site.
 *
 * A failed read still serves a valid, empty feed: a reader that gets a 500
 * may unsubscribe.
 */
function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** CDATA cannot contain its own terminator; split it across two sections. */
function cdata(text: string): string {
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function absolute(html: string): string {
  return html.replace(/(href|src)="\/(?!\/)/g, `$1="${CODE_ORIGIN}/`);
}

function item(post: Post): string {
  const link = canonicalUrl(post);
  const rendered = renderMarkdown(post.bodyMd);
  const lead = post.answer ? `<p><strong>In short:</strong> ${escape(post.answer)}</p>` : "";
  return [
    "    <item>",
    `      <title>${escape(post.title)}</title>`,
    `      <link>${escape(link)}</link>`,
    `      <guid isPermaLink="true">${escape(link)}</guid>`,
    post.publishedAt ? `      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>` : null,
    `      <description>${escape(searchDescription(post))}</description>`,
    post.authorName ? `      <dc:creator>${escape(post.authorName)}</dc:creator>` : null,
    post.category ? `      <category>${escape(post.category)}</category>` : null,
    ...post.tags.map((tag) => `      <category>${escape(tag)}</category>`),
    `      <content:encoded>${cdata(absolute(lead + rendered.html))}</content:encoded>`,
    "    </item>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export async function GET() {
  await connection();
  let posts: Post[] = [];
  try {
    posts = await listPublicPostsWithBody(20);
  } catch (error) {
    console.error("[blog] could not read posts for the feed", error);
  }

  const built = posts[0]?.publishedAt ? new Date(posts[0].publishedAt) : new Date();
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    `    <title>${escape(BLOG_NAME)}</title>`,
    `    <link>${BLOG_URL}</link>`,
    `    <description>${escape(BLOG_DESCRIPTION)}</description>`,
    "    <language>en-NG</language>",
    `    <copyright>${escape(PRODUCT_NAME)}</copyright>`,
    `    <lastBuildDate>${built.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml"/>`,
    ...posts.map(item),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}
