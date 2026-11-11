import createMarkdownIt, { type MarkdownIt, type Token } from "markdown-it";
import { CODE_HOST } from "@/lib/brand";
import { countWords, isHttpsUrl, slugify } from "@/lib/blog-schema";

/**
 * Markdown to the HTML a post is published as.
 *
 * Pure and shared: the published page, the feed and the editor's preview all
 * call `renderMarkdown`, so what staff preview is byte for byte what goes
 * out. It also reports what the SEO checklist needs to know about the body
 * (headings, links, images, words), read off the same parse.
 *
 * Safety is by construction rather than by cleaning up afterwards:
 *
 * - `html: false`. Raw HTML in the Markdown is escaped and shown as text,
 *   never rendered, so a pasted `<script>` or `onerror=` is inert.
 * - `validateLink` admits http(s), mailto, tel, site-relative paths and
 *   in-page anchors. `javascript:`, `data:` and the rest are left as text.
 * - Images must be https. Anything else renders as its alt text, so a post
 *   can never pull a picture over plain http or embed one in a data URL.
 */

export type TocItem = { level: 2 | 3; id: string; text: string };

export type RenderedPost = {
  html: string;
  /** The h2s and h3s, in order, with the ids the page anchors to. */
  toc: TocItem[];
  /** Every heading in the body, for the checklist (an h1 here is a mistake). */
  headings: { level: number; text: string }[];
  words: number;
  readingMinutes: number;
  /** The first paragraph's text: what a search engine reads first. */
  firstParagraph: string;
  links: { href: string; internal: boolean }[];
  images: { src: string; alt: string }[];
};

type Collected = {
  toc: TocItem[];
  headings: { level: number; text: string }[];
  ids: Set<string>;
  text: string[];
  firstParagraph: string | null;
  links: { href: string; internal: boolean }[];
  images: { src: string; alt: string }[];
};

/** Words a minute for reading reference material, slower than prose. */
const WORDS_PER_MINUTE = 230;

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

function isInternal(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return host === CODE_HOST;
  } catch {
    return false;
  }
}

/** The readable text of an inline run: words, inline code, and line breaks as spaces. */
function inlineText(children: Token[]): string {
  return children
    .map((child) =>
      child.type === "text" || child.type === "code_inline"
        ? child.content
        : child.type === "softbreak" || child.type === "hardbreak"
          ? " "
          : ""
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function createRenderer(): MarkdownIt {
  const md = createMarkdownIt({ html: false, linkify: true, typographer: true });
  md.validateLink = (url: string) => SAFE_LINK.test(url.trim());

  // Ids on h2/h3 (and a record of every heading), figures for images that
  // stand alone in a paragraph, and the text the word count reads.
  md.core.ruler.push("post_structure", (state) => {
    const env = state.env as Collected;
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];

      if (token.type === "heading_open") {
        const level = Number(token.tag.slice(1));
        const inline = tokens[i + 1];
        const label = inlineText(inline?.children ?? []);
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

  const defaultLinkOpen =
    md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

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
    if (token.meta?.figure && title) {
      return `${img}<figcaption>${md.utils.escapeHtml(title)}</figcaption>`;
    }
    return title ? img.replace("<img ", `<img title="${md.utils.escapeHtml(title)}" `) : img;
  };

  // Wide tables scroll inside their own frame instead of widening the page.
  md.renderer.rules.table_open = () => '<div class="post-table"><table>\n';
  md.renderer.rules.table_close = () => "</table></div>\n";

  return md;
}

let renderer: MarkdownIt | null = null;

function freshEnv(): Collected {
  return { toc: [], headings: [], ids: new Set(), text: [], firstParagraph: null, links: [], images: [] };
}

export function renderMarkdown(source: string): RenderedPost {
  renderer ??= createRenderer();
  const env = freshEnv();
  const html = renderer.render(source, env);
  const words = countWords(env.text.join(" "));

  return {
    html,
    toc: env.toc,
    headings: env.headings,
    words,
    readingMinutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
    firstParagraph: env.firstParagraph ?? "",
    links: env.links,
    images: env.images,
  };
}

/** A post's text with the Markdown taken out, for feeds and summaries that need plain words. */
export function plainText(source: string, max = Infinity): string {
  renderer ??= createRenderer();
  const tokens = renderer.parse(source, freshEnv());
  const parts: string[] = [];
  for (const token of tokens) {
    if (token.type === "inline") {
      parts.push(inlineText(token.children ?? []));
    }
  }
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length <= max) return joined;
  const cut = joined.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trimEnd()}…`;
}
