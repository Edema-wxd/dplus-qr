import {
  MARKDOWN_FILE_MAX_BYTES,
  MARKDOWN_TEMPLATE,
  parseMarkdownFile,
  splitFrontmatter,
  toMarkdownFile,
} from "@/lib/blog-frontmatter";
import { EMPTY_POST, postFieldsSchema, type PostFields } from "@/lib/blog-schema";

function parsed(text: string) {
  const result = parseMarkdownFile(text);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("parseMarkdownFile", () => {
  it("reads this blog's own keys", () => {
    const result = parsed(`---
title: Sizing a code
slug: sizing-a-code
summary: How small is too small.
seo_title: Minimum QR code size
description: The smallest QR code that still scans.
focus_keyword: qr code size
keywords: [qr size, print]
tags: [Printing, Packaging]
category: Printing
answer: Ten to one.
takeaways:
  - One
  - Two
faq:
  - q: Does it matter?
    a: Yes.
steps:
  - name: Measure
    text: Measure the distance.
sources:
  - title: ISO 18004
    url: https://www.iso.org/standard/62021.html
    publisher: ISO
about: [QR code]
author:
  name: Ada
  role: Editor
  url: https://example.com/ada
---

Body text.
`);
    expect(result.fields).toMatchObject({
      title: "Sizing a code",
      slug: "sizing-a-code",
      excerpt: "How small is too small.",
      seoTitle: "Minimum QR code size",
      metaDescription: "The smallest QR code that still scans.",
      focusKeyword: "qr code size",
      keywords: ["qr size", "print"],
      tags: ["Printing", "Packaging"],
      category: "Printing",
      answer: "Ten to one.",
      takeaways: ["One", "Two"],
      faq: [{ q: "Does it matter?", a: "Yes." }],
      steps: [{ name: "Measure", text: "Measure the distance." }],
      sources: [{ title: "ISO 18004", url: "https://www.iso.org/standard/62021.html", publisher: "ISO" }],
      about: ["QR code"],
      authorName: "Ada",
      authorRole: "Editor",
      authorUrl: "https://example.com/ada",
      bodyMd: "Body text.\n",
    });
    expect(result.warnings).toEqual([]);
  });

  it("maps the keys other site generators use", () => {
    const result = parsed(`---
Title: Hugo post
Description: A description.
image: https://cdn.example.com/a.jpg
date: 2026-03-01
lastmod: 2026-04-02
categories: [Menus, Food]
tags: "one, two"
canonicalURL: https://example.com/original
draft: true
permalink: /posts/hugo-post/
---
Hi`);
    expect(result.fields.title).toBe("Hugo post");
    expect(result.fields.metaDescription).toBe("A description.");
    // A description with no separate summary does both jobs.
    expect(result.fields.excerpt).toBe("A description.");
    expect(result.fields.coverUrl).toBe("https://cdn.example.com/a.jpg");
    expect(result.fields.category).toBe("Menus");
    expect(result.fields.tags).toEqual(["one", "two"]);
    expect(result.fields.canonicalUrl).toBe("https://example.com/original");
    expect(result.publishedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(result.contentUpdatedAt).toBe("2026-04-02T00:00:00.000Z");
    expect(result.warnings).toEqual(["Not used: “permalink”."]);
  });

  it("reports which fields it filled, in the editor's words", () => {
    const result = parsed("---\ntitle: A\nanswer: B\n---\nBody");
    expect(result.filled).toEqual(["Title", "Body", "Short answer"]);
  });

  it("imports a file with no frontmatter as its body, taking a leading # heading as the title", () => {
    const result = parsed("# The title\n\nFirst paragraph.\n");
    expect(result.fields.title).toBe("The title");
    expect(result.fields.bodyMd).toBe("First paragraph.\n");
  });

  it("leaves a # heading in the body when the frontmatter already names a different title", () => {
    const result = parsed("---\ntitle: Real\n---\n# Different\n\nText");
    expect(result.fields.title).toBe("Real");
    expect(result.fields.bodyMd).toContain("# Different");
  });

  it("says which line of bad YAML is wrong", () => {
    const result = parseMarkdownFile("---\ntitle: ok\ntags: [unclosed\n---\nBody");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/line \d+/);
  });

  it("never treats a ---js block as frontmatter, so nothing in it can run", () => {
    const text = "---js\n{ title: (function(){ throw new Error('ran') })() }\n---\nBody";
    const result = parsed(text);
    expect(result.fields.title).toBeUndefined();
    expect(result.fields.bodyMd).toContain("---js");
  });

  it("does not end the frontmatter at a --- inside a value", () => {
    const result = parsed("---\ntitle: before---after\n---\nBody");
    expect(result.fields.title).toBe("before---after");
    expect(result.fields.bodyMd).toBe("Body\n");
  });

  it("refuses a file over the size limit", () => {
    const result = parseMarkdownFile("a".repeat(MARKDOWN_FILE_MAX_BYTES + 1));
    expect(result.ok).toBe(false);
  });

  it("refuses frontmatter that is not a set of keys", () => {
    expect(parseMarkdownFile("---\n- just\n- a list\n---\nBody").ok).toBe(false);
  });

  it("warns about a date it cannot read instead of guessing", () => {
    const result = parsed("---\ndate: next tuesday\n---\nBody");
    expect(result.publishedAt).toBeNull();
    expect(result.warnings[0]).toMatch(/not a date/);
  });

  it("strips a byte-order mark", () => {
    expect(splitFrontmatter("\uFEFF---\ntitle: x\n---\nBody").yaml).toBe("title: x");
  });
});

describe("toMarkdownFile", () => {
  const post: PostFields = {
    ...EMPTY_POST,
    title: "Round trip",
    slug: "round-trip",
    excerpt: "Out and back.",
    bodyMd: "## Part\n\nText.\n",
    seoTitle: "Round trip, tested",
    metaDescription: "A post written out and read back.",
    focusKeyword: "round trip",
    keywords: ["one", "two"],
    noindex: true,
    coverUrl: "https://cdn.example.com/c.jpg",
    coverAlt: "A cover",
    answer: "It comes back the same.",
    takeaways: ["Same fields", "Same body"],
    faq: [{ q: "Same?", a: "Same." }],
    steps: [{ name: "Write", text: "Write it out." }],
    sources: [
      { title: "A source", url: "https://example.com", publisher: "" },
      { title: "Another", url: "https://example.org", publisher: "Org" },
    ],
    about: ["Testing"],
    authorName: "Ada",
    authorRole: "Editor",
    authorUrl: "https://example.com/ada",
    category: "Notes",
    tags: ["testing"],
  };

  it("reads back as the same post", () => {
    const back = parsed(toMarkdownFile({ ...post, publishedAt: "2026-11-10T09:00:00.000Z" }));
    expect({ ...EMPTY_POST, ...back.fields }).toEqual(post);
    expect(back.publishedAt).toBe("2026-11-10T09:00:00.000Z");
  });

  it("leaves empty fields out", () => {
    const file = toMarkdownFile({ ...EMPTY_POST, title: "Bare", slug: "bare", bodyMd: "Hi" });
    expect(file).toBe("---\ntitle: Bare\nslug: bare\n---\n\nHi\n");
  });
});

describe("MARKDOWN_TEMPLATE", () => {
  it("parses, and is a valid post once its example values are in", () => {
    const result = parsed(MARKDOWN_TEMPLATE);
    expect(result.warnings).toEqual([]);
    const check = postFieldsSchema.safeParse({ ...EMPTY_POST, ...result.fields });
    expect(check.success).toBe(true);
  });
});
