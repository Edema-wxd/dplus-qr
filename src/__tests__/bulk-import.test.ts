const getSession = jest.fn();
const getBatch = jest.fn();
const getEntitlement = jest.fn();
const loadLogo = jest.fn();

jest.mock("@/lib/resolve-scope", () => ({
  resolveScope: async () => {
    const { data } = await getSession();
    if (!data?.user) return null;
    const { scopeFor } = jest.requireActual("@/lib/account-scope");
    return scopeFor(data.user.id, data.user.id, "owner");
  },
}));
jest.mock("@/lib/bulk-create", () => ({
  getBatch: (...a: unknown[]) => getBatch(...a),
  parseImportId: (raw: string) => (/^[1-9]\d{0,18}$/.test(raw) ? raw : null),
}));
jest.mock("@/lib/entitlement", () => {
  const actual = jest.requireActual("@/lib/entitlement");
  return { ...actual, getEntitlement: (...a: unknown[]) => getEntitlement(...a) };
});
jest.mock("@/lib/logos", () => ({
  loadLogo: (...a: unknown[]) => loadLogo(...a),
}));

import { strFromU8, unzipSync } from "fflate";
import {
  BULK_MAX_ROWS,
  checkRows,
  fitToSlots,
  parseCsv,
  readRows,
  zipEntryName,
  type CheckOptions,
  type RawRow,
} from "@/lib/bulk-import";
import { batchCsv, problemsCsv } from "@/lib/csv-export";
import { canBulkCreate, type Entitlement } from "@/lib/entitlement";
import { featureOffer } from "@/lib/upgrade-offers";
import { DEFAULT_QR_STYLE } from "@/lib/qr-style";
import { renderArtwork } from "@/lib/qr-artwork";
import type { Plan } from "@/lib/plans";
import { GET as zipGET } from "@/app/(app)/app/imports/[id]/zip/route";

const ok = (text: string): RawRow[] => {
  const read = readRows(text);
  if (!read.ok) throw new Error(read.reason);
  return read.rows;
};

const allowLinks: CheckOptions = { customLinks: true, customRefusal: "" };
const noLinks: CheckOptions = { customLinks: false, customRefusal: "Custom links are not part of your Free plan." };

describe("parseCsv", () => {
  it("reads quotes, commas and line breaks inside quotes, and doubled quotes", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });

  it("drops Excel's byte-order mark and keeps a last line with no newline", () => {
    expect(parseCsv("﻿name,destination\nA,b.com")).toEqual([
      ["name", "destination"],
      ["A", "b.com"],
    ]);
  });

  it("refuses a quote that is never closed", () => {
    expect(parseCsv('name\n"open')).toBeNull();
  });
});

describe("readRows", () => {
  it("matches headers loosely and numbers rows as the spreadsheet does", () => {
    const rows = ok("Name, Destination URL ,TYPE,Custom-Link\n\nShop,shop.example,,\nInsta,@shop,instagram,mine-1\n");
    // Row 2 is blank, so the codes are rows 3 and 4.
    expect(rows).toEqual([
      { row: 3, name: "Shop", destination: "shop.example", type: "", link: "" },
      { row: 4, name: "Insta", destination: "@shop", type: "instagram", link: "mine-1" },
    ]);
  });

  it.each([
    ["", /empty/],
    ["name,destination\n", /no codes/],
    ["name,where\nA,b", /"where" is not one of them/],
    ["name\nA", /name and destination/],
    ["name,destination,url\nA,b,c", /appears twice/],
    ['name,destination\n"A,b', /never closed/],
  ])("refuses the whole file for %p", (text, reason) => {
    const read = readRows(text);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toMatch(reason);
  });

  it("refuses more rows than a batch may have, and accepts exactly the cap", () => {
    const body = (n: number) => ["name,destination", ...Array.from({ length: n }, (_, i) => `c${i},example.com/${i}`)].join("\n");
    expect(readRows(body(BULK_MAX_ROWS)).ok).toBe(true);
    const over = readRows(body(BULK_MAX_ROWS + 1));
    expect(over.ok).toBe(false);
  });

  it("refuses a file over the size limit", () => {
    expect(readRows("name,destination\n" + "a".repeat(300 * 1024)).ok).toBe(false);
  });
});

describe("checkRows", () => {
  it("screens every row as a single code is screened", () => {
    const checked = checkRows(
      ok(
        [
          "name,destination,type",
          "Good,example.com/menu,",
          "Script,javascript:alert(1),",
          "Userinfo,https://user@example.com,",
          "Shortener,https://bit.ly/abc,",
          "Our host,https://qriateplus.com/abcdefg,",
          ",example.com,",
          `${"x".repeat(81)},example.com,`,
          "Handle,@ada.obi,instagram",
          "Bad type,example.com,tiktok",
        ].join("\n")
      ),
      allowLinks
    );
    expect(checked.map((r) => r.ok)).toEqual([true, false, false, false, false, false, false, true, false]);
    expect(checked[0]).toMatchObject({ row: 2, kind: "url", destination: "https://example.com/menu" });
    expect(checked[7]).toMatchObject({ kind: "instagram", destination: "https://www.instagram.com/ada.obi/" });
    expect(checked[8]).toMatchObject({ reason: "The type should be link, instagram or facebook." });
  });

  it("checks custom links: the plan, the format, reserved words and repeats in the file", () => {
    const rows = ok(
      [
        "name,destination,link",
        "A,example.com,shop-one",
        "B,example.com,shop-one",
        "C,example.com,admin",
        "D,example.com,ab",
        "E,example.com,my-bank-login",
      ].join("\n")
    );
    const checked = checkRows(rows, allowLinks);
    expect(checked[0]).toMatchObject({ ok: true, customCode: "shop-one" });
    expect(checked[1]).toMatchObject({ ok: false, reason: "Row 2 already asks for this link." });
    expect(checked.slice(2).every((r) => !r.ok)).toBe(true);

    const refused = checkRows(rows, noLinks);
    expect(refused[0]).toMatchObject({ ok: false, reason: noLinks.customRefusal });
  });
});

describe("fitToSlots", () => {
  const checked = checkRows(ok("name,destination\nA,a.com\nB,javascript:x\nC,c.com\nD,d.com"), allowLinks);

  it("makes the first good rows that fit, in file order, and reports the rest", () => {
    const { create, overLimit } = fitToSlots(checked, 2);
    expect(create.map((r) => r.name)).toEqual(["A", "C"]);
    expect(overLimit.map((r) => r.name)).toEqual(["D"]);
  });

  it("makes everything when there is room, and nothing when there is none", () => {
    expect(fitToSlots(checked, 3).overLimit).toEqual([]);
    expect(fitToSlots(checked, 0).create).toEqual([]);
    expect(fitToSlots(checked, -4).create).toEqual([]);
  });
});

describe("CSV out", () => {
  it("defuses formulas in the rows to fix, which are the owner's own untrusted cells", () => {
    expect(problemsCsv([{ row: 3, name: "=HYPERLINK(1)", destination: "x", reason: "Bad, really" }]).split("\r\n")).toEqual([
      "row,name,destination,problem",
      `3,'=HYPERLINK(1),x,"Bad, really"`,
    ]);
  });

  it("lists a batch's codes with their short links", () => {
    const csv = batchCsv([
      { name: "+Shop", link: "https://qriateplus.com/abc", destination: "https://e.com", createdAt: new Date("2026-11-07T10:00:00Z") },
    ]);
    expect(csv.split("\r\n")[1]).toBe("'+Shop,https://qriateplus.com/abc,https://e.com,2026-11-07T10:00:00.000Z");
  });
});

describe("zipEntryName", () => {
  it.each([
    ["Shop window", "Ab3dEf9", "shop-window-Ab3dEf9.svg"],
    ["../../etc/passwd", "Ab3dEf9", "etc-passwd-Ab3dEf9.svg"],
    ["Café Lagos", "Ab3dEf9", "cafe-lagos-Ab3dEf9.svg"],
    ["***", "Ab3dEf9", "code-Ab3dEf9.svg"],
    ["x".repeat(60), "Ab3dEf9", `${"x".repeat(40)}-Ab3dEf9.svg`],
  ])("names %p safely", (name, code, expected) => {
    expect(zipEntryName(name, code, "svg")).toBe(expected);
  });
});

describe("the bulk gate", () => {
  const plan = (o: Partial<Plan>): Plan => ({
    id: 1, slug: "starter-monthly", name: "Starter", paystackPlanCode: null, amountKobo: 400_000,
    interval: "monthly", maxCodes: 10, historyDays: 90, graceDays: 7, features: {}, isActive: true, sortOrder: 10, ...o,
  });
  const plans = [
    plan({}),
    plan({ id: 2, slug: "pro-monthly", name: "Pro", amountKobo: 1_000_000, sortOrder: 20 }),
    plan({ id: 3, slug: "business-monthly", name: "Business", amountKobo: 2_500_000, sortOrder: 30, features: { bulk_creation: true } }),
  ];
  const free: Entitlement = { planName: "Free", planSlug: "free", maxCodes: 5, historyDays: 30, codesUsed: 0, features: {}, active: true, seats: 1, seatsUsed: 1 };

  it("follows the flag, and the offer names the cheapest plan that has it", () => {
    expect(canBulkCreate(free)).toBe(false);
    expect(canBulkCreate({ ...free, features: { bulk_creation: true } })).toBe(true);
    expect(canBulkCreate(null)).toBe(false);
    const offer = featureOffer("bulk_creation", free, plans);
    expect(offer.unlock?.name).toBe("Business");
    expect(offer.why).toBe("Bulk creation is not part of your Free plan.");
    expect(offer.benefit).toContain(String(BULK_MAX_ROWS));
  });
});

describe("GET /app/imports/[id]/zip", () => {
  const codes = [
    { id: "1", row: 2, name: "Shop window", shortCode: "Ab3dEf9", link: "https://qriateplus.com/Ab3dEf9", destination: "https://e.com", kind: "url", status: "active", style: DEFAULT_QR_STYLE, logo: null, createdAt: new Date("2026-11-07T10:00:00Z") },
    { id: "2", row: 3, name: "=Flyer", shortCode: "Gh4jKm2", link: "https://qriateplus.com/Gh4jKm2", destination: "https://f.com", kind: "url", status: "active", style: { ...DEFAULT_QR_STYLE, dark: "#1A3C6E" }, logo: null, createdAt: new Date("2026-11-07T10:00:00Z") },
  ];
  const call = (id: string, format = "svg") =>
    zipGET(new Request(`https://qriateplus.com/app/imports/${id}/zip?format=${format}`), { params: Promise.resolve({ id }) });

  beforeEach(() => {
    jest.resetAllMocks();
    getSession.mockResolvedValue({ data: { user: { id: "user-1" } } });
    getBatch.mockResolvedValue({ id: "7", codes });
    getEntitlement.mockResolvedValue({ planName: "Business", planSlug: "business-monthly", maxCodes: 250, historyDays: 730, codesUsed: 2, features: { bulk_creation: true }, active: true });
  });

  it("refuses a signed-out request, another account's batch, and a plan without bulk creation", async () => {
    getSession.mockResolvedValueOnce({ data: null });
    expect((await call("7")).status).toBe(401);
    getBatch.mockResolvedValueOnce(null);
    expect((await call("7")).status).toBe(404);
    expect((await call("../7")).status).toBe(404);
    getEntitlement.mockResolvedValueOnce({ planName: "Free", features: {} });
    expect((await call("7")).status).toBe(403);
  });

  it("holds each code's artwork exactly as the single download draws it, and the list", async () => {
    for (const format of ["svg", "png"] as const) {
      const response = await call("7", format);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/zip");
      const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
      expect(Object.keys(files).sort()).toEqual(
        [`flyer-Gh4jKm2.${format}`, `shop-window-Ab3dEf9.${format}`, "codes.csv"].sort()
      );
      for (const code of codes) {
        const single = await renderArtwork(code, format, 1024);
        const bytes = typeof single === "string" ? new TextEncoder().encode(single) : new Uint8Array(single);
        expect(Buffer.from(files[zipEntryName(code.name, code.shortCode, format)]).equals(Buffer.from(bytes))).toBe(true);
      }
      const list = strFromU8(files["codes.csv"]).split("\r\n");
      expect(list[0]).toBe("name,link,destination,created_at");
      expect(list[2].startsWith("'=Flyer,")).toBe(true);
    }
    expect(getBatch).toHaveBeenCalledWith(expect.objectContaining({ accountId: "user-1", actorId: "user-1" }), "7");
    // PNG encoding is slow under ts-jest (seconds, against ~60ms in Node).
  }, 60_000);

  it("refuses with a 503 before streaming when a logo will not load", async () => {
    getBatch.mockResolvedValue({ id: "7", codes: [{ ...codes[0], logo: { id: "9", url: "https://files.example/logo.png" } }] });
    loadLogo.mockRejectedValue(new Error("down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("7")).status).toBe(503);
    spy.mockRestore();
  });
});
