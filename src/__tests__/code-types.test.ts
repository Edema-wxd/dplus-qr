import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DYNAMIC_KINDS,
  DYNAMIC_TYPES,
  LINK_KINDS,
  STATIC_TYPES,
  isPageKind,
  pagePath,
} from "@/lib/qr-types";
import { STATIC_KINDS } from "@/lib/static-payload";
import {
  PAGE_SCHEMAS,
  collectFileIds,
  linkDestination,
  parsePageContent,
} from "@/lib/page-content";
import {
  buildIcs,
  eventInstant,
  gs1ElementString,
  isValidGtin,
  videoEmbedUrl,
} from "@/lib/page-helpers";
import { isReserved } from "@/lib/short-code";

const MIGRATION = path.join(__dirname, "..", "..", "db", "migrations", "015_code_types.sql");

describe("the code type catalog", () => {
  it("offers every dynamic kind exactly once", () => {
    expect(DYNAMIC_TYPES.map((t) => t.kind).sort()).toEqual([...DYNAMIC_KINDS].sort());
  });

  it("offers every static kind exactly once", () => {
    expect(STATIC_TYPES.map((t) => t.kind).sort()).toEqual([...STATIC_KINDS].sort());
  });

  it("has a content schema for every page kind and none for link kinds", () => {
    const pages = DYNAMIC_KINDS.filter(isPageKind);
    expect(Object.keys(PAGE_SCHEMAS).sort()).toEqual([...pages].sort());
    for (const kind of LINK_KINDS) expect(isPageKind(kind)).toBe(false);
  });

  it("matches the database's check constraint", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const list = sql.match(/qr_codes_kind_check check \(kind in \(([\s\S]*?)\)\)/)?.[1] ?? "";
    const kinds = [...list.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);
    expect(kinds.sort()).toEqual([...DYNAMIC_KINDS].sort());
  });

  it("serves hosted pages from a reserved path", () => {
    expect(pagePath("Ab3kQ9x")).toBe("/p/Ab3kQ9x");
    // A relative Location, like the status pages: never an absolute origin.
    expect(pagePath("Ab3kQ9x").startsWith("/")).toBe(true);
    expect(isReserved("p")).toBe(true);
  });
});

describe("linkDestination", () => {
  it("turns an Instagram handle into a profile link", () => {
    expect(linkDestination("instagram", "@ada.obi")).toEqual({
      ok: true,
      normalised: "https://www.instagram.com/ada.obi/",
    });
    expect(linkDestination("instagram", "instagram.com/ada").ok).toBe(true);
  });

  it("keeps a network's code on that network", () => {
    expect(linkDestination("instagram", "https://evil.example/ada").ok).toBe(false);
    expect(linkDestination("facebook", "https://evil.example/page").ok).toBe(false);
    expect(linkDestination("facebook", "facebook.com/obisons").ok).toBe(true);
    expect(linkDestination("facebook", "obisons")).toEqual({
      ok: true,
      normalised: "https://www.facebook.com/obisons",
    });
  });

  it("screens a plain website link", () => {
    expect(linkDestination("url", "javascript:alert(1)").ok).toBe(false);
    expect(linkDestination("url", "bit.ly/x").ok).toBe(false);
  });
});

const pdf = { fileId: "7", url: "https://x.ufs.sh/f/a", name: "menu.pdf", mime: "application/pdf" };
const photo = { fileId: "8", url: "https://x.ufs.sh/f/b", name: "a.jpg", mime: "image/jpeg" };

describe("page content schemas", () => {
  it("accepts a minimal page of each kind", () => {
    const minimal: Record<string, unknown> = {
      pdf: { title: "Menu", file: pdf },
      images: { title: "Gallery", images: [photo] },
      video: { title: "Launch", link: "youtu.be/dQw4w9WgXcQ" },
      profile: { name: "Ada Obi", links: [] },
      links: { title: "Shop", links: [{ label: "Store", url: "shop.ng" }] },
      social: { title: "Us", profiles: [{ network: "x", url: "x.com/us" }] },
      app: { name: "App", android: "https://play.google.com/store/apps/details?id=ng.app" },
      mp3: { title: "Song", file: { ...pdf, mime: "audio/mpeg" } },
      business: { name: "Obi & Sons" },
      menu: { name: "Mama Put", sections: [{ name: "Mains", items: [{ name: "Jollof" }] }] },
      feedback: { name: "Shop", question: "How was it?" },
      event: { title: "Launch", start: "2026-11-20T18:00" },
      coupon: { business: "Shop", headline: "20% off" },
      playlist: { title: "Mix", tracks: [{ title: "One", file: { ...pdf, mime: "audio/mpeg" } }] },
      barcode: { gtin: "4006381333931", name: "Pen" },
    };
    for (const kind of Object.keys(PAGE_SCHEMAS) as (keyof typeof PAGE_SCHEMAS)[]) {
      const result = parsePageContent(kind, minimal[kind]);
      expect([kind, result.ok]).toEqual([kind, true]);
    }
  });

  it("screens every link inside a page", () => {
    const result = parsePageContent("links", {
      title: "Shop",
      links: [{ label: "Bad", url: "javascript:alert(1)" }],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a file of the wrong type", () => {
    expect(parsePageContent("pdf", { title: "Menu", file: photo })).toEqual({
      ok: false,
      reason: "That file is not a PDF.",
    });
  });

  it("refuses a page with nothing to show", () => {
    expect(parsePageContent("video", { title: "Launch" }).ok).toBe(false);
    expect(parsePageContent("app", { name: "App" }).ok).toBe(false);
    expect(parsePageContent("links", { title: "Shop", links: [] }).ok).toBe(false);
  });

  it("keeps app store links on the stores", () => {
    expect(parsePageContent("app", { name: "App", ios: "https://evil.example/app" }).ok).toBe(false);
  });

  it("refuses an event that ends before it starts", () => {
    expect(
      parsePageContent("event", { title: "x", start: "2026-11-20T18:00", end: "2026-11-20T17:00" })
        .ok
    ).toBe(false);
  });

  it("checks a GTIN's check digit", () => {
    expect(parsePageContent("barcode", { gtin: "4006381333932", name: "Pen" }).ok).toBe(false);
  });

  it("defaults a menu's currency to naira", () => {
    const result = parsePageContent("menu", {
      name: "Mama Put",
      sections: [{ name: "Mains", items: [{ name: "Jollof", price: "3,500" }] }],
    });
    expect(result.ok && result.content.currency).toBe("₦");
  });

  it("finds every file reference, however deep", () => {
    const ids = collectFileIds({
      cover: photo,
      tracks: [{ title: "a", file: { ...pdf, fileId: "9" } }],
    });
    expect([...ids].sort()).toEqual(["8", "9"]);
  });
});

describe("page helpers", () => {
  it("validates GTINs of every length", () => {
    expect(isValidGtin("4006381333931")).toBe(true); // GTIN-13
    expect(isValidGtin("036000291452")).toBe(true); // GTIN-12
    expect(isValidGtin("96385074")).toBe(true); // GTIN-8
    expect(isValidGtin("10614141000415")).toBe(true); // GTIN-14
    expect(isValidGtin("4006381333930")).toBe(false);
    expect(isValidGtin("12345")).toBe(false);
  });

  it("writes the GS1 element string", () => {
    expect(
      gs1ElementString({ gtin: "4006381333931", batch: "AB12", expiry: "2027-03-31", serial: "9" })
    ).toBe("(01)04006381333931(10)AB12(17)270331(21)9");
  });

  it("builds a calendar event in UTC", () => {
    const start = eventInstant("2026-11-20T18:00", "+01:00");
    expect(start.toISOString()).toBe("2026-11-20T17:00:00.000Z");
    const ics = buildIcs({ uid: "x@y", title: "Launch, night", start, location: "Lagos" });
    expect(ics).toContain("DTSTART:20261120T170000Z");
    expect(ics).toContain("DTEND:20261120T180000Z");
    expect(ics).toContain("SUMMARY:Launch\\, night");
  });

  it("embeds YouTube and Vimeo, and nothing else", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
    );
    expect(videoEmbedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
    expect(videoEmbedUrl("https://example.com/video")).toBeNull();
  });
});
