import { readFileSync } from "node:fs";
import path from "node:path";

let store: Map<string, Map<string, number>> | null;
jest.mock("@/lib/redis", () => ({
  redis: () =>
    store && {
      hlen: async (k: string) => store!.get(k)?.size ?? 0,
      hexists: async (k: string, f: string) => (store!.get(k)?.has(f) ? 1 : 0),
      hincrby: async (k: string, f: string, n: number) => {
        const h = store!.get(k) ?? new Map<string, number>();
        store!.set(k, h);
        h.set(f, (h.get(f) ?? 0) + n);
        return h.get(f);
      },
      expire: async () => 1,
      hgetall: async (k: string) => (store!.has(k) ? Object.fromEntries(store!.get(k)!) : null),
    },
}));

const allowCspReport = jest.fn();
jest.mock("@/lib/ratelimit", () => ({ allowCspReport: (...a: unknown[]) => allowCspReport(...a) }));
jest.mock("@/lib/ip", () => ({ clientIp: () => "203.0.113.9", ipRateKey: () => "visitor" }));

import { contentSecurityPolicy, cspDirectives, CSP_REPORT_PATH, HSTS, securityHeaders, VIDEO_FRAME_HOSTS } from "@/lib/csp";
import {
  blockedShape,
  MAX_KINDS_PER_DAY,
  pageSection,
  parseReports,
  recordViolations,
  violationsLastDays,
} from "@/lib/csp-reports";
import { videoEmbedUrl } from "@/lib/page-helpers";
import { POST } from "@/app/api/csp-report/route";
import { RESERVED_CODES } from "@/lib/short-code";

const prod = { dev: false, preview: false };

beforeEach(() => {
  store = new Map();
  allowCspReport.mockReset().mockResolvedValue(true);
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("the security headers (audit M6)", () => {
  const headers = Object.fromEntries(securityHeaders(prod).map((h) => [h.key, h.value]));

  it("keeps framing to this origin enforced, as before", () => {
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'self'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("sends the full policy report-only, reporting to the endpoint by both mechanisms", () => {
    const policy = headers["Content-Security-Policy-Report-Only"];
    expect(policy).toBe(contentSecurityPolicy(prod));
    expect(policy).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(policy).toContain("report-to csp");
    expect(headers["Reporting-Endpoints"]).toBe(`csp="${CSP_REPORT_PATH}"`);
  });

  it("asks for HTTPS on every subdomain, for two years, without preload", () => {
    expect(headers["Strict-Transport-Security"]).toBe(HSTS);
    expect(HSTS).toBe("max-age=63072000; includeSubDomains");
    expect(HSTS).not.toContain("preload");
  });

  it("is what next.config serves on every path", () => {
    const config = readFileSync(path.join(__dirname, "..", "..", "next.config.ts"), "utf8");
    expect(config).toMatch(/source: "\/:path\*",\s*headers: securityHeaders\(/);
  });

  it("serves the report endpoint from a reserved path, so no code can shadow it", () => {
    expect(RESERVED_CODES.has(CSP_REPORT_PATH.split("/")[1])).toBe(true);
  });
});

describe("the policy", () => {
  const d = cspDirectives(prod);

  it("loads scripts only from this origin, and never allows eval in production", () => {
    expect(d["script-src"]).toEqual(["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]);
    expect(cspDirectives({ dev: true, preview: false })["script-src"]).toContain("'unsafe-eval'");
  });

  it("shuts plugins, <base> and form hijacking, and framing by others", () => {
    expect(d["object-src"]).toEqual(["'none'"]);
    expect(d["base-uri"]).toEqual(["'self'"]);
    expect(d["form-action"]).toEqual(["'self'", "https://checkout.paystack.com"]);
    expect(d["frame-ancestors"]).toEqual(["'self'"]);
    expect(d["default-src"]).toEqual(["'self'"]);
  });

  it("frames every host a page's video can be embedded from, and only those", () => {
    for (const link of ["https://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/76979871"]) {
      const embed = videoEmbedUrl(link);
      expect(embed).not.toBeNull();
      expect(d["frame-src"]).toContain(new URL(embed!).origin);
    }
    expect(d["frame-src"]).toEqual(VIDEO_FRAME_HOSTS);
  });

  it("lets the browser upload to UploadThing and play this account's files", () => {
    expect(d["connect-src"]).toContain("https://*.ingest.uploadthing.com");
    expect(d["media-src"]).toContain("https://fmctfyekk3.ufs.sh");
    expect(d["worker-src"]).toContain("'self'");
  });

  it("adds Vercel's toolbar on previews only", () => {
    expect(contentSecurityPolicy(prod)).not.toContain("vercel.live");
    expect(cspDirectives({ dev: false, preview: true })["frame-src"]).toContain("https://vercel.live");
  });
});

describe("reading reports", () => {
  it("reads the older report-uri format, keeping only the shape", () => {
    expect(
      parseReports({
        "csp-report": {
          "document-uri": "https://qriateplus.com/app/team/invite?token=secret123",
          "violated-directive": "connect-src",
          "effective-directive": "connect-src",
          "blocked-uri": "https://evil.example/steal?token=secret123",
        },
      })
    ).toEqual([{ directive: "connect-src", blocked: "https://evil.example", section: "/app" }]);
  });

  it("reads the Reporting API's batches, ignoring other report types", () => {
    const reports = parseReports([
      { type: "csp-violation", body: { documentURL: "https://qriateplus.com/p/Ab3dEf9", effectiveDirective: "script-src-elem", blockedURL: "inline" } },
      { type: "deprecation", body: { id: "x" } },
    ]);
    expect(reports).toEqual([{ directive: "script-src-elem", blocked: "inline", section: "/p" }]);
  });

  it("keeps nothing that could carry a token", () => {
    expect(blockedShape("data:image/png;base64,AAAA")).toBe("data");
    expect(blockedShape("'eval'")).toBe("eval");
    expect(blockedShape("not a url")).toBe("other");
    expect(pageSection("https://qriateplus.com/billing?ref=abc")).toBe("/billing");
  });

  it("ignores anything that is not a report", () => {
    expect(parseReports(null)).toEqual([]);
    expect(parseReports({ hello: 1 })).toEqual([]);
    expect(parseReports(Array(100).fill({ type: "csp-violation", body: {} }))).toHaveLength(20);
  });
});

describe("counting reports", () => {
  const v = { directive: "connect-src", blocked: "https://a.example", section: "/app" };
  const now = new Date("2026-11-13T12:00:00Z");

  it("counts by kind per day and sums the week, most common first", async () => {
    await recordViolations([v, v, { ...v, section: "/p" }], now);
    await recordViolations([v], new Date("2026-11-10T12:00:00Z"));
    await recordViolations([v], new Date("2026-11-01T12:00:00Z"));
    const week = await violationsLastDays(7, now);
    expect(week).toEqual({
      total: 4,
      top: [
        { kind: "connect-src https://a.example on /app", count: 3 },
        { kind: "connect-src https://a.example on /p", count: 1 },
      ],
    });
  });

  it("stops adding new kinds past the daily cap, but still counts known ones", async () => {
    for (let i = 0; i < MAX_KINDS_PER_DAY; i += 1) await recordViolations([{ ...v, blocked: `https://h${i}.example` }], now);
    await recordViolations([{ ...v, blocked: "https://new.example" }, { ...v, blocked: "https://h0.example" }], now);
    const day = store!.get("csp:2026-11-13")!;
    expect(day.size).toBe(MAX_KINDS_PER_DAY);
    expect(day.get("connect-src https://h0.example on /app")).toBe(2);
  });

  it("says it could not count, rather than reporting a clean zero, without Redis", async () => {
    store = null;
    await expect(recordViolations([v], now)).resolves.toBeUndefined();
    await expect(violationsLastDays(7, now)).resolves.toBeNull();
  });
});

describe("the report endpoint", () => {
  const post = (body: string, type = "application/csp-report") =>
    POST(new Request("https://qriateplus.com/api/csp-report", { method: "POST", body, headers: { "content-type": type } }));
  const report = JSON.stringify({ "csp-report": { "document-uri": "https://qriateplus.com/", "effective-directive": "img-src", "blocked-uri": "https://x.example/a.png" } });

  it("answers 204 and counts the report", async () => {
    const response = await post(report);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect([...(store!.values().next().value as Map<string, number>).keys()]).toEqual(["img-src https://x.example on /"]);
  });

  it("answers 204 to garbage and counts nothing", async () => {
    expect((await post("{not json")).status).toBe(204);
    expect((await post("x".repeat(40 * 1024))).status).toBe(204);
    expect(store!.size).toBe(0);
  });

  it("counts nothing past the visitor's limit", async () => {
    allowCspReport.mockResolvedValue(false);
    expect((await post(report)).status).toBe(204);
    expect(store!.size).toBe(0);
  });
});
