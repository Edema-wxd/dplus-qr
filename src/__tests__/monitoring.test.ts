const settings: Record<string, string | undefined> = {};
jest.mock("@/lib/env", () => ({ env: () => ({ NODE_ENV: "production", QR_BASE_URL: "https://qriateplus.com", ...settings }) }));

type Store = Map<string, { value: string; ex?: number }>;
let store: Store | null = null;
jest.mock("@/lib/redis", () => ({
  redis: () =>
    store && {
      set: async (key: string, value: string, opts: { nx?: boolean; ex?: number }) => {
        if (opts.nx && store!.has(key)) return null;
        store!.set(key, { value, ex: opts.ex });
        return "OK";
      },
      incr: async (key: string) => {
        const next = Number(store!.get(key)?.value ?? 0) + 1;
        store!.set(key, { ...store!.get(key), value: String(next) });
        return next;
      },
      expire: async (key: string, ex: number) => {
        const entry = store!.get(key);
        if (entry) entry.ex = ex;
        return 1;
      },
      mget: async (...keys: string[]) => keys.map((k) => store!.get(k)?.value ?? null),
    },
}));

const notifyAdmin = jest.fn(async (..._args: [string, string]) => true);
jest.mock("@/lib/email", () => ({ notifyAdmin: (subject: string, text: string) => notifyAdmin(subject, text) }));

import {
  MAX_ALERTS_PER_HOUR,
  alertOnce,
  describeError,
  errorAlert,
  errorSignature,
  errorsLastDays,
  reportError,
  resetLocalThrottle,
  safePath,
  scrub,
} from "@/lib/error-alerts";
import { summaryEmail, summaryWindow, weekLabel, type WeeklyFigures } from "@/lib/weekly-summary";
import { readFileSync } from "node:fs";
import path from "node:path";
import vercel from "../../vercel.json";

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  settings.VERCEL_ENV = "production";
  delete process.env.NEXT_PHASE;
  store = null;
  resetLocalThrottle();
  notifyAdmin.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("what an alert may carry", () => {
  it("blanks email addresses, IP addresses and tokens", () => {
    expect(scrub("no user ada@example.com from 102.89.3.4 or 2001:db8::1:2 with key AIzaSyA1234567890abcdefghijklmnopqrstu")).toBe(
      "no user [email] from [ip] or [ip] with key [token]"
    );
  });

  it("keeps a stack frame's line numbers", () => {
    expect(scrub("at render (/var/task/.next/server/app/page.js:12:34)")).toBe("at render (/var/task/.next/server/app/page.js:12:34)");
    expect(scrub("fe80:0:0:0:200:f8ff:fe21:67cf")).toBe("[ip]");
  });

  it("drops the query string, where invite and share tokens travel", () => {
    expect(safePath("/team/join?token=abc&x=1#frag")).toBe("/team/join");
    expect(safePath(undefined)).toBeUndefined();
  });

  it("puts where, what and the digest in the email, and nothing from the query", () => {
    const error = Object.assign(new Error("connect ETIMEDOUT for owner ada@example.com"), { digest: "3141592" });
    const { subject, text } = errorAlert(
      { where: "render /app/[id]", method: "GET", path: "/app/42?token=secret-share-token" },
      describeError(error),
      new Date("2026-11-08T10:00:00Z"),
      "abcdef1234567"
    );
    expect(subject).toBe("Server error in render /app/[id]: connect ETIMEDOUT for owner [email]");
    expect(text).toContain("Request: GET /app/42\n");
    expect(text).toContain("Digest: 3141592");
    expect(text).toContain("Deployment: abcdef1");
    expect(text).not.toContain("secret-share-token");
    expect(text).not.toContain("ada@example.com");
  });

  it("describes a thrown value that is not an Error", () => {
    expect(describeError("boom")).toMatchObject({ name: "Thrown value", message: "boom", digest: null });
  });
});

describe("one email per kind of error", () => {
  it("treats the same failure with different ids as one kind, and different places as two", () => {
    const at = { where: "route /[code]" };
    const a = errorSignature(at, describeError(new Error('code 123 failed: "Ab3kQ9x"')));
    const b = errorSignature(at, describeError(new Error('code 98765 failed: "Zx9Yw8v"')));
    const c = errorSignature({ where: "cron scans" }, describeError(new Error('code 123 failed: "Ab3kQ9x"')));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("emails the first of a repeated error and holds the rest for the hour", async () => {
    await reportError(new Error("db down"), { where: "cron scans" });
    await reportError(new Error("db down"), { where: "cron scans" });
    await reportError(new Error("other"), { where: "cron scans" });
    expect(notifyAdmin).toHaveBeenCalledTimes(2);
  });

  it("holds across instances through Redis, and counts every error for the summary", async () => {
    store = new Map();
    for (let i = 0; i < 3; i += 1) await reportError(new Error(`row ${i} failed`), { where: "action /app" });
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    const hold = [...store.entries()].find(([key]) => key.startsWith("err:alert:"));
    expect(hold?.[1].ex).toBe(3600);
    expect(await errorsLastDays(7)).toBe(3);
  });

  it(`sends no more than ${MAX_ALERTS_PER_HOUR} alerts an hour in all`, async () => {
    store = new Map();
    for (let i = 0; i < MAX_ALERTS_PER_HOUR + 5; i += 1) {
      await reportError(new Error(`distinct failure ${"x".repeat(i)}`), { where: `place ${String.fromCharCode(97 + i)}` });
    }
    expect(notifyAdmin).toHaveBeenCalledTimes(MAX_ALERTS_PER_HOUR);
  });

  it("does the same without Redis, per instance", async () => {
    for (let i = 0; i < MAX_ALERTS_PER_HOUR + 2; i += 1) {
      await reportError(new Error("x"), { where: `place ${String.fromCharCode(97 + i)}` });
    }
    expect(notifyAdmin).toHaveBeenCalledTimes(MAX_ALERTS_PER_HOUR);
    expect(await errorsLastDays(7)).toBeNull();
  });

  it("throttles a non-exception alert the same way", async () => {
    await alertOnce("paystack-deferred:no matching account", "s", "t");
    await alertOnce("paystack-deferred:no matching account", "s", "t");
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("when nothing is sent", () => {
  it("sends nothing from a preview, a development server or a build", async () => {
    settings.VERCEL_ENV = "preview";
    await reportError(new Error("a"), { where: "x" });
    settings.VERCEL_ENV = undefined;
    settings.NODE_ENV = "development";
    await reportError(new Error("b"), { where: "x" });
    settings.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    await reportError(new Error("c"), { where: "x" });
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it("alerts from a production server off Vercel", async () => {
    settings.VERCEL_ENV = undefined;
    await reportError(new Error("a"), { where: "x" });
    expect(notifyAdmin).toHaveBeenCalledTimes(1);
  });

  it("ignores Next's redirects and not-founds", async () => {
    await reportError(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/app;307;" }), { where: "x" });
    await reportError(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }), { where: "x" });
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it("never throws, even when the mail call does", async () => {
    notifyAdmin.mockRejectedValueOnce(new Error("resend down"));
    await expect(reportError(new Error("a"), { where: "x" })).resolves.toBeUndefined();
  });
});

describe("onRequestError", () => {
  it("reports in Node with the route as the place, and leaves the edge and the proxy (which reports itself) alone", async () => {
    const report = jest.fn(async () => {});
    await jest.isolateModulesAsync(async () => {
      jest.doMock("@/lib/error-alerts", () => ({ reportError: report }));
      const { onRequestError } = await import("@/instrumentation");
      const context = { routerKind: "App Router", routePath: "/[code]", routeType: "route", renderSource: undefined, revalidateReason: undefined } as never;
      const request = { path: "/Ab3kQ9x?utm=1", method: "GET", headers: {} };
      process.env.NEXT_RUNTIME = "edge";
      await onRequestError(new Error("e"), request, context);
      process.env.NEXT_RUNTIME = "nodejs";
      await onRequestError(new Error("e"), request, { ...(context as object), routeType: "proxy" } as never);
      await onRequestError(new Error("e"), request, context);
      delete process.env.NEXT_RUNTIME;
    });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(expect.any(Error), { where: "route /[code]", method: "GET", path: "/Ab3kQ9x?utm=1" });
  });
});

describe("the redirect", () => {
  it("alerts on a failed lookup only after the scanner has been answered", () => {
    const source = readFileSync(path.join(__dirname, "..", "app", "[code]", "route.ts"), "utf8");
    expect(source).toMatch(/catch \(error\) \{[\s\S]{0,120}after\(\(\) => reportError\(error/);
    expect(source).not.toMatch(/await reportError/);
  });
});

describe("the weekly summary", () => {
  const figures = (over: Partial<WeeklyFigures> = {}): WeeklyFigures => ({
    ...summaryWindow(new Date("2026-11-09T05:30:00Z")),
    signups: { week: 12, before: 9 },
    codes: { week: 1, before: 0 },
    scans: { week: 3400, before: 2900 },
    reportsReceived: 2,
    staffBlocks: 1,
    safetyBlocks: 0,
    safetyCheckOn: true,
    liveCodes: 1234,
    revenue: { mrrKobo: 12_000_000, paidActive: 8, nonRenewing: 1, pastDue: 1, atRiskKobo: 400_000 },
    attention: { openReports: 1, overdueAccounts: 1, unappliedPayments: 0, unpurchasablePlans: 0, signInsToRemove: 0 },
    errors: 5,
    ...over,
  });

  it("covers the seven whole days before the run, Monday to Sunday", () => {
    const { from, to, before } = summaryWindow(new Date("2026-11-09T05:30:00Z"));
    expect(from.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(before.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(weekLabel(from, to)).toBe("2 to 8 November 2026");
    expect(weekLabel(new Date("2026-10-26T00:00:00Z"), new Date("2026-11-02T00:00:00Z"))).toBe("26 October to 1 November 2026");
    expect(weekLabel(new Date("2026-12-28T00:00:00Z"), new Date("2027-01-04T00:00:00Z"))).toBe("28 December 2026 to 3 January 2027");
  });

  it("says how the week went, against the week before, and what is waiting", () => {
    const { subject, text } = summaryEmail(figures(), "https://qriateplus.com/admin");
    expect(subject).toBe("QRiate+ weekly summary, 2 to 8 November 2026: 12 sign-ups, 3,400 scans");
    expect(text).toMatch(/Sign-ups\s+12\s+\(9 the week before\)/);
    expect(text).toMatch(/Scans\s+3,400\s+\(2,900 the week before\)/);
    expect(text).toMatch(/Monthly recurring\s+₦120,000/);
    expect(text).toMatch(/Payment overdue\s+1\s+₦4,000 a month at risk/);
    expect(text).toMatch(/Server errors\s+5/);
    expect(text).toContain("- 1 open abuse report\n- 1 account overdue");
    expect(text).toContain("Details: https://qriateplus.com/admin");
  });

  it("says plainly when a check is off or nothing is waiting", () => {
    const { text } = summaryEmail(
      figures({
        safetyCheckOn: false,
        errors: null,
        attention: { openReports: 0, overdueAccounts: 0, unappliedPayments: 0, unpurchasablePlans: 0, signInsToRemove: 0 },
      }),
      "https://qriateplus.com/admin"
    );
    expect(text).toContain("The Google Web Risk safety check is off: WEB_RISK_API_KEY is not set.");
    expect(text).toContain("Server errors were not counted: Redis is not configured.");
    expect(text).toContain("Nothing. No open reports, nobody overdue, every payment applied.");
  });

  it("is scheduled on Monday after the rollup and the safety check", () => {
    const crons = Object.fromEntries(vercel.crons.map((c) => [c.path, c.schedule]));
    expect(crons["/api/cron/summary"]).toBe("30 5 * * 1");
    expect(crons["/api/cron/reputation"]).toBe("50 4 * * 1");
  });
});
