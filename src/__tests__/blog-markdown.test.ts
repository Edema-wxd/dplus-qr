import { plainText, renderMarkdown } from "@/lib/blog-markdown";

describe("renderMarkdown: nothing a post contains can run", () => {
  it("escapes raw HTML instead of rendering it", () => {
    const { html } = renderMarkdown('Hello <script>alert(1)</script> and <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops javascript: and data: links, leaving the text", () => {
    const { html, links } = renderMarkdown("[a](javascript:alert(1)) [b](data:text/html;base64,AAAA) [c](vbscript:x)");
    expect(html).not.toMatch(/href="(javascript|data|vbscript):/i);
    expect(links).toHaveLength(0);
  });

  it("keeps http(s), mailto, tel, site-relative and anchor links", () => {
    const { html } = renderMarkdown(
      "[a](https://example.com) [b](mailto:hi@example.com) [c](tel:+2348000000000) [d](/pricing) [e](#faq)"
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="mailto:hi@example.com"');
    expect(html).toContain('href="tel:+2348000000000"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="#faq"');
  });

  it("refuses protocol-relative links, which would leave the site unannounced", () => {
    const { html } = renderMarkdown("[x](//evil.example.com)");
    expect(html).not.toContain('href="//evil');
  });

  it("only renders https images; anything else becomes its alt text", () => {
    const { html, images } = renderMarkdown("![plain](http://example.com/a.png) ![inline](data:image/png;base64,AAAA)");
    expect(html).not.toContain("<img");
    expect(html).toContain("plain");
    expect(images).toHaveLength(0);
  });
});

describe("renderMarkdown: structure", () => {
  it("gives h2 and h3 ids, unique ones for repeated headings, and builds the contents", () => {
    const { html, toc } = renderMarkdown("## Sizing\n\ntext\n\n### Distance\n\n## Sizing\n\n#### Too deep");
    expect(toc).toEqual([
      { level: 2, id: "sizing", text: "Sizing" },
      { level: 3, id: "distance", text: "Distance" },
      { level: 2, id: "sizing-2", text: "Sizing" },
    ]);
    expect(html).toContain('<h2 id="sizing">');
    expect(html).toContain('<h2 id="sizing-2">');
    expect(html).not.toContain('<h4 id=');
  });

  it("reads heading text through emphasis, code and links", () => {
    const { toc } = renderMarkdown("## Why **short** `URLs` [matter](https://example.com)");
    expect(toc[0].text).toBe("Why short URLs matter");
    expect(toc[0].id).toBe("why-short-urls-matter");
  });

  it("records every heading level, including an h1 the checklist will flag", () => {
    const { headings } = renderMarkdown("# Extra\n\n## Section");
    expect(headings.map((h) => h.level)).toEqual([1, 2]);
  });

  it("marks external links noopener and counts internal ones", () => {
    const { html, links } = renderMarkdown(
      "[out](https://example.com) [home](https://qriateplus.com/pricing) [rel](/blog/other) [here](#top)"
    );
    expect(html).toContain('href="https://example.com" rel="noopener"');
    expect(html).not.toContain('href="/blog/other" rel=');
    expect(links).toEqual([
      { href: "https://example.com", internal: false },
      { href: "https://qriateplus.com/pricing", internal: true },
      { href: "/blog/other", internal: true },
    ]);
  });

  it("turns a lone image into a figure with its title as the caption", () => {
    const { html, images } = renderMarkdown('![A code on a box](https://cdn.example.com/box.jpg "On a cereal box")');
    expect(html).toContain("<figure>");
    expect(html).toContain('alt="A code on a box"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("<figcaption>On a cereal box</figcaption>");
    expect(html).not.toContain("<p><img");
    expect(images).toEqual([{ src: "https://cdn.example.com/box.jpg", alt: "A code on a box" }]);
  });

  it("wraps tables so a wide one scrolls on its own", () => {
    const { html } = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('<div class="post-table"><table>');
  });

  it("finds the first paragraph, joining wrapped lines with a space", () => {
    const { firstParagraph } = renderMarkdown("## Intro\n\nA printed code\nkeeps working.\n\nSecond.");
    expect(firstParagraph).toBe("A printed code keeps working.");
  });

  it("counts words and reading time", () => {
    const body = Array.from({ length: 460 }, () => "word").join(" ");
    const { words, readingMinutes } = renderMarkdown(body);
    expect(words).toBe(460);
    expect(readingMinutes).toBe(2);
  });

  it("never reports less than a minute", () => {
    expect(renderMarkdown("Short.").readingMinutes).toBe(1);
  });
});

describe("plainText", () => {
  it("strips the Markdown and trims at a word", () => {
    expect(plainText("## Hi\n\nSome **bold** text that runs on", 20)).toBe("Hi Some bold text…");
  });
});
