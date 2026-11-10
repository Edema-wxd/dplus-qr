import { connection } from "next/server";
import { getPublicPost } from "@/lib/blog";
import { SLUG_PATTERN } from "@/lib/blog-schema";
import { canonicalUrl, modifiedAt } from "@/lib/blog-seo";
import type { Post } from "@/lib/blog-schema";

/**
 * A post as plain Markdown, for language models: the llms.txt convention of
 * serving a clean copy at the page's address plus `.md` (`next.config.ts`
 * rewrites `/blog/{slug}.md` here). It carries everything the page does that
 * a model would quote, the short answer, takeaways, steps, questions and
 * sources included, with none of the page's chrome.
 *
 * Kept out of search indexes (`X-Robots-Tag`) and pointed at the HTML page as
 * canonical, so it never competes with the post it copies.
 */
function markdown(post: Post): string {
  const lines: string[] = [`# ${post.title}`, ""];
  if (post.excerpt) lines.push(`> ${post.excerpt}`, "");

  const meta = [
    post.authorName ? `Author: ${post.authorName}${post.authorRole ? `, ${post.authorRole}` : ""}` : null,
    post.publishedAt ? `Published: ${post.publishedAt.slice(0, 10)}` : null,
    post.contentUpdatedAt ? `Updated: ${modifiedAt(post)!.slice(0, 10)}` : null,
    `Source: ${canonicalUrl(post)}`,
  ].filter((line): line is string => line !== null);
  lines.push(...meta, "");

  if (post.answer) lines.push("## Short answer", "", post.answer, "");
  if (post.takeaways.length > 0) {
    lines.push("## Key takeaways", "", ...post.takeaways.map((item) => `- ${item}`), "");
  }

  lines.push(post.bodyMd.trim(), "");

  if (post.steps.length > 0) {
    lines.push("## Step by step", "", ...post.steps.map((step, i) => `${i + 1}. **${step.name}**: ${step.text}`), "");
  }
  if (post.faq.length > 0) {
    lines.push("## Questions", "");
    for (const item of post.faq) lines.push(`### ${item.q}`, "", item.a, "");
  }
  if (post.sources.length > 0) {
    lines.push(
      "## Sources",
      "",
      ...post.sources.map((source, i) => `${i + 1}. [${source.title}](${source.url})${source.publisher ? `, ${source.publisher}` : ""}`),
      ""
    );
  }
  return lines.join("\n");
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  if (!SLUG_PATTERN.test(slug)) return new Response("Not found", { status: 404 });

  let found;
  try {
    found = await getPublicPost(slug);
  } catch (error) {
    console.error("[blog] could not read post for markdown", error);
    return new Response("Unavailable", { status: 503, headers: { "Retry-After": "60" } });
  }
  if (!found) return new Response("Not found", { status: 404 });
  if ("movedTo" in found) {
    return new Response(null, { status: 308, headers: { Location: `/blog/${found.movedTo}.md` } });
  }

  return new Response(markdown(found.post), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex",
      Link: `<${canonicalUrl(found.post)}>; rel="canonical"`,
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=86400",
    },
  });
}
