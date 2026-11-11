import { renderMarkdown } from "@/lib/blog-markdown";
import { EMPTY_POST, type Post } from "@/lib/blog-schema";
import {
  auditPost,
  blogIndexJsonLd,
  canonicalUrl,
  cardUrl,
  jsonLdScript,
  postJsonLd,
  postMetadata,
  searchTitle,
} from "@/lib/blog-seo";

const post: Post = {
  ...EMPTY_POST,
  id: 1,
  status: "published",
  slug: "minimum-qr-code-size",
  title: "How small can a printed QR code be?",
  excerpt: "Work out the smallest code that still scans.",
  bodyMd: "Intro paragraph.",
  publishedAt: "2026-11-01T09:00:00.000Z",
  contentUpdatedAt: null,
  createdAt: "2026-10-30T09:00:00.000Z",
  updatedAt: "2026-11-02T09:00:00.000Z",
};

type Graph = { "@graph": Record<string, unknown>[] };
const nodes = (data: unknown, type: string) => (data as Graph)["@graph"].filter((node) => node["@type"] === type);

describe("postMetadata", () => {
  it("uses the headline with the product name when no search title is set", () => {
    expect(searchTitle(post)).toBe("How small can a printed QR code be? · QRiate+");
    expect(postMetadata(post).title).toEqual({ absolute: "How small can a printed QR code be? · QRiate+" });
  });

  it("uses the search title exactly when one is set", () => {
    expect(postMetadata({ ...post, seoTitle: "Minimum QR code size" }).title).toEqual({ absolute: "Minimum QR code size" });
  });

  it("points the canonical at the post, or at the original when it first ran elsewhere", () => {
    expect(postMetadata(post).alternates?.canonical).toBe("https://qriateplus.com/blog/minimum-qr-code-size");
    expect(canonicalUrl({ ...post, canonicalUrl: "https://example.com/original" })).toBe("https://example.com/original");
  });

  it("is indexable by default, with large previews allowed", () => {
    const robots = postMetadata(post).robots as Record<string, unknown>;
    expect(robots.index).toBe(true);
    expect((robots.googleBot as Record<string, unknown>)["max-image-preview"]).toBe("large");
  });

  it("keeps a noindex post out of search but follows its links", () => {
    expect(postMetadata({ ...post, noindex: true }).robots).toEqual({ index: false, follow: true });
  });

  it("shares the generated card, versioned by the last save, unless a social image is set", () => {
    const og = postMetadata(post).openGraph as { images: { url: string }[]; type: string };
    expect(og.type).toBe("article");
    expect(og.images[0].url).toBe(cardUrl(post));
    expect(og.images[0].url).toMatch(/^https:\/\/qriateplus\.com\/blog\/minimum-qr-code-size\/card\?v=/);

    const custom = postMetadata({ ...post, ogImageUrl: "https://cdn.example.com/og.png" }).openGraph as {
      images: { url: string }[];
    };
    expect(custom.images[0].url).toBe("https://cdn.example.com/og.png");
  });

  it("links the Markdown copy and the feed", () => {
    const types = postMetadata(post).alternates?.types as Record<string, { url: string }[]>;
    expect(types["text/markdown"][0].url).toBe("https://qriateplus.com/blog/minimum-qr-code-size.md");
    expect(types["application/rss+xml"][0].url).toBe("https://qriateplus.com/blog/rss.xml");
  });
});

describe("postJsonLd", () => {
  const rendered = { words: 900, readingMinutes: 4 };

  it("describes the post as a BlogPosting with its dates, author and publisher", () => {
    const data = postJsonLd({ ...post, authorName: "Ada", authorRole: "Editor" }, rendered);
    const [article] = nodes(data, "BlogPosting");
    expect(article.headline).toBe(post.title);
    expect(article.datePublished).toBe(post.publishedAt);
    expect(article.dateModified).toBe(post.publishedAt);
    expect(article.wordCount).toBe(900);
    expect(article.timeRequired).toBe("PT4M");
    expect(article.inLanguage).toBe("en-NG");
    expect(article.author).toMatchObject({ "@type": "Person", name: "Ada", jobTitle: "Editor" });
    expect(article.publisher).toEqual({ "@id": "https://qriateplus.com/#organization" });
    expect(nodes(data, "BreadcrumbList")).toHaveLength(1);
  });

  it("falls back to the organisation as author when none is named", () => {
    const [article] = nodes(postJsonLd(post, rendered), "BlogPosting");
    expect(article.author).toEqual({ "@id": "https://qriateplus.com/#organization" });
  });

  it("uses the substantive-update date as dateModified", () => {
    const [article] = nodes(postJsonLd({ ...post, contentUpdatedAt: "2026-11-09T00:00:00.000Z" }, rendered), "BlogPosting");
    expect(article.dateModified).toBe("2026-11-09T00:00:00.000Z");
  });

  it("adds FAQPage and HowTo only when the post has them", () => {
    expect(nodes(postJsonLd(post, rendered), "FAQPage")).toHaveLength(0);
    expect(nodes(postJsonLd(post, rendered), "HowTo")).toHaveLength(0);

    const full = postJsonLd(
      { ...post, faq: [{ q: "Q?", a: "A." }], steps: [{ name: "One", text: "Do it." }] },
      rendered
    );
    expect(nodes(full, "FAQPage")[0].mainEntity).toEqual([
      { "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } },
    ]);
    expect(nodes(full, "HowTo")[0].step).toEqual([
      expect.objectContaining({ "@type": "HowToStep", position: 1, name: "One", text: "Do it." }),
    ]);
  });

  it("carries the short answer, sources and topics for answer and generative engines", () => {
    const [article] = nodes(
      postJsonLd(
        {
          ...post,
          answer: "Ten to one.",
          takeaways: ["One"],
          sources: [{ title: "ISO", url: "https://www.iso.org", publisher: "ISO" }],
          about: ["QR code"],
        },
        rendered
      ),
      "BlogPosting"
    );
    expect(article.abstract).toBe("Ten to one.");
    expect(article.speakable).toEqual({
      "@type": "SpeakableSpecification",
      cssSelector: ["#short-answer", "#key-takeaways"],
    });
    expect(article.citation).toEqual([
      { "@type": "CreativeWork", name: "ISO", url: "https://www.iso.org", publisher: { "@type": "Organization", name: "ISO" } },
    ]);
    expect(article.about).toEqual([{ "@type": "Thing", name: "QR code" }]);
  });

  it("leaves out what the post does not have, rather than writing empty values", () => {
    const [article] = nodes(postJsonLd(post, rendered), "BlogPosting");
    for (const key of ["abstract", "speakable", "citation", "about", "articleSection", "keywords"]) {
      expect(article).not.toHaveProperty(key);
    }
  });
});

describe("blogIndexJsonLd", () => {
  it("lists the posts in order", () => {
    const data = blogIndexJsonLd([post]);
    expect(nodes(data, "ItemList")[0].itemListElement).toEqual([
      { "@type": "ListItem", position: 1, url: "https://qriateplus.com/blog/minimum-qr-code-size", name: post.title },
    ]);
  });
});

describe("jsonLdScript", () => {
  it("escapes < so a title cannot close the script tag", () => {
    const out = jsonLdScript({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("auditPost", () => {
  const strong = {
    ...post,
    seoTitle: "Minimum QR code size for print, worked out",
    metaDescription:
      "How to work out the minimum QR code size for packaging, labels and signs from the scanning distance and the code's length.",
    focusKeyword: "minimum QR code size",
    answer: Array.from({ length: 50 }, () => "word").join(" "),
    takeaways: ["One", "Two", "Three"],
    faq: [
      { q: "A?", a: "A." },
      { q: "B?", a: "B." },
    ],
    sources: [{ title: "ISO", url: "https://www.iso.org", publisher: "" }],
    authorName: "Ada",
    bodyMd: [
      "The minimum QR code size depends on distance.",
      "",
      "## Working out the minimum QR code size",
      "",
      Array.from({ length: 620 }, () => "word").join(" "),
      "",
      "See [pricing](/pricing).",
    ].join("\n"),
  };
  const result = (fields: typeof strong) => auditPost(fields, renderMarkdown(fields.bodyMd));
  const failing = (fields: typeof strong) =>
    result(fields)
      .filter((check) => !check.pass)
      .map((check) => check.id);

  it("passes a post set up to be found and quoted", () => {
    expect(failing(strong)).toEqual([]);
  });

  it("flags a body h1, a skipped heading level and a missing image description", () => {
    const ids = failing({ ...strong, bodyMd: `${strong.bodyMd}\n\n# Second title\n\n#### Deep\n\n![](https://cdn.example.com/a.png)` });
    expect(ids).toEqual(expect.arrayContaining(["no-h1", "heading-order", "image-alt"]));
  });

  it("reports every keyword check as needing a keyword when none is set", () => {
    const checks = result({ ...strong, focusKeyword: "" });
    const keywordChecks = checks.filter((check) => check.id.startsWith("keyword-"));
    expect(keywordChecks.every((check) => !check.pass && check.detail === "Set a focus keyword first.")).toBe(true);
  });

  it("matches the keyword in the address by its slug form", () => {
    expect(failing({ ...strong, slug: "minimum-qr-code-size-guide" })).not.toContain("keyword-slug");
    expect(failing({ ...strong, slug: "sizing" })).toContain("keyword-slug");
  });
});
