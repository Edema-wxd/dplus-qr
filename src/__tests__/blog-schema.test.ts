import {
  EMPTY_POST,
  firstPostIssue,
  isPublic,
  postSchema,
  postState,
  slugify,
} from "@/lib/blog-schema";

const valid = { ...EMPTY_POST, title: "A post", slug: "a-post" };

describe("slugify", () => {
  it("makes a lower-case hyphenated address", () => {
    expect(slugify("How Small Can a QR Code Be?")).toBe("how-small-can-a-qr-code-be");
  });

  it("folds accents, says & as and, drops apostrophes", () => {
    expect(slugify("Café menus & Lagos’ signs")).toBe("cafe-menus-and-lagos-signs");
  });

  it("cuts at a word, never mid-word", () => {
    expect(slugify("alpha beta gamma", 12)).toBe("alpha-beta");
  });
});

describe("postSchema", () => {
  it("accepts a minimal post", () => {
    expect(postSchema.safeParse(valid).success).toBe(true);
  });

  it.each(["Has Caps", "double--hyphen", "-leading", "trailing-", "under_score", "dot.md", ""])(
    "refuses the address %p",
    (slug) => {
      expect(postSchema.safeParse({ ...valid, slug: slug === "Has Caps" ? "has caps" : slug }).success).toBe(false);
    }
  );

  it("lower-cases an address typed with capitals", () => {
    const result = postSchema.safeParse({ ...valid, slug: "A-Post" });
    expect(result.success && result.data.slug).toBe("a-post");
  });

  it("only takes https addresses for links and images", () => {
    for (const field of ["coverUrl", "ogImageUrl", "canonicalUrl", "authorUrl"] as const) {
      expect(postSchema.safeParse({ ...valid, [field]: "http://example.com/x" }).success).toBe(false);
      expect(postSchema.safeParse({ ...valid, [field]: "javascript:alert(1)" }).success).toBe(false);
    }
  });

  it("needs a description for a cover image", () => {
    const result = postSchema.safeParse({ ...valid, coverUrl: "https://cdn.example.com/c.jpg" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstPostIssue(result.error)).toMatch(/^Cover description:/);
  });

  it("drops blank FAQ rows and repeated tags, and lower-cases tags", () => {
    const result = postSchema.safeParse({
      ...valid,
      faq: [{ q: "Q?", a: "A." }, { q: " ", a: "" }],
      tags: ["Print", "print", " ", "Menus"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.faq).toHaveLength(1);
      expect(result.data.tags).toEqual(["print", "menus"]);
    }
  });

  it("names the field and row of the first problem", () => {
    const result = postSchema.safeParse({ ...valid, sources: [{ title: "x", url: "nope", publisher: "" }] });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstPostIssue(result.error)).toMatch(/^Sources 1: /);
  });

  it("caps the number of takeaways", () => {
    const takeaways = Array.from({ length: 8 }, (_, i) => `Point ${i}`);
    expect(postSchema.safeParse({ ...valid, takeaways }).success).toBe(false);
  });
});

describe("isPublic and postState", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("a draft is never public, whatever its date", () => {
    expect(isPublic({ status: "draft", publishedAt: "2026-01-01T00:00:00Z" }, now)).toBe(false);
    expect(postState({ status: "draft", publishedAt: "2026-01-01T00:00:00Z" }, now)).toBe("draft");
  });

  it("a published post with a future date is scheduled", () => {
    expect(isPublic({ status: "published", publishedAt: "2026-11-11T00:00:00Z" }, now)).toBe(false);
    expect(postState({ status: "published", publishedAt: "2026-11-11T00:00:00Z" }, now)).toBe("scheduled");
  });

  it("a published post whose date has passed is public", () => {
    expect(isPublic({ status: "published", publishedAt: "2026-11-10T11:59:00Z" }, now)).toBe(true);
  });
});
