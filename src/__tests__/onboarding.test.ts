/** @jest-environment node */

import { readFileSync } from "node:fs";
import path from "node:path";

const query = jest.fn(async (..._args: unknown[]) => [] as unknown[]);
const queryOne = jest.fn(async (..._args: unknown[]) => null as unknown);
jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => query(...args),
  queryOne: (...args: unknown[]) => queryOne(...args),
}));

jest.mock("next/server", () => ({ connection: async () => {} }));

const getSession = jest.fn();
jest.mock("@/lib/auth/server", () => ({
  auth: { getSession: (...args: unknown[]) => getSession(...args) },
}));

import {
  biggestDrop,
  buildFunnel,
  describeScan,
  FIRST_CODE_INKS,
  formatDuration,
  MAX_ONBOARDING_STEPS,
  ONBOARDING_EVENTS,
  ONBOARDING_STEPS,
  PURPOSES,
  previousScreen,
  resumeScreen,
  screenFor,
  shouldOnboard,
  stepNumber,
  type OnboardingEvent,
  type OnboardingProgress,
} from "@/lib/onboarding-steps";
import { latestTestScan, recordStep } from "@/lib/onboarding";
import { checkQrStyle, DEFAULT_QR_STYLE } from "@/lib/qr-style";
import { PRIVACY, type LegalDocument } from "@/lib/legal";
import { GET as scanRoute } from "@/app/(app)/app/start/scan/route";

const root = path.join(__dirname, "..", "..");
const migration = readFileSync(path.join(root, "db/migrations/025_onboarding.sql"), "utf8");

function progress(
  reached: OnboardingEvent[],
  extra: Partial<Omit<OnboardingProgress, "reached">> = {}
): OnboardingProgress {
  return { reached: new Set(reached), hasCode: false, hasDraft: false, ...extra };
}

beforeEach(() => {
  query.mockClear();
  queryOne.mockReset();
  getSession.mockReset();
});

describe("the onboarding's length", () => {
  /**
   * The product rule: from the first sign-in to a first code in seven steps
   * or fewer. A step added past that fails here, on purpose.
   */
  it("is seven steps or fewer, counting the sign-up form", () => {
    expect(ONBOARDING_STEPS.length).toBeLessThanOrEqual(MAX_ONBOARDING_STEPS);
    expect(MAX_ONBOARDING_STEPS).toBe(7);
    expect(ONBOARDING_STEPS[0].screen).toBe("account");
  });

  it("makes the code within those steps", () => {
    expect(stepNumber("create")).toBeLessThanOrEqual(MAX_ONBOARDING_STEPS);
    expect(ONBOARDING_STEPS[stepNumber("create") - 1].event).toBe("code_created");
  });
});

describe("the migration agrees with the code", () => {
  it("accepts every event the code records, and no others", () => {
    const listed = migration.match(/step in \(([\s\S]*?)\)\)/)?.[1] ?? "";
    const allowed = [...listed.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...ONBOARDING_EVENTS].sort());
  });

  it("accepts every purpose the first screen offers", () => {
    const listed = migration.match(/purpose in \(([^)]*)\)/)?.[1] ?? "";
    const allowed = [...listed.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual(Object.keys(PURPOSES).sort());
  });
});

describe("where someone picks up", () => {
  it("starts a new account on what the code is for", () => {
    expect(resumeScreen(progress(["account_created"]))).toBe("purpose");
  });

  it("moves on as each screen is finished", () => {
    expect(resumeScreen(progress(["account_created", "purpose_chosen"]))).toBe("link");
    expect(
      resumeScreen(progress(["account_created", "purpose_chosen", "destination_set"], { hasDraft: true }))
    ).toBe("create");
  });

  it("asks for the link again if the saved draft is gone", () => {
    expect(resumeScreen(progress(["purpose_chosen", "destination_set"]))).toBe("link");
  });

  it("goes to download once the code exists, and to the scan after a download", () => {
    expect(resumeScreen(progress(["code_created"], { hasCode: true }))).toBe("download");
    expect(resumeScreen(progress(["code_created", "artwork_downloaded"], { hasCode: true }))).toBe("scan");
  });

  it("lets someone go back to earlier screens, but not skip ahead", () => {
    const atCreate = progress(["purpose_chosen", "destination_set"], { hasDraft: true });
    expect(screenFor("purpose", atCreate)).toBe("purpose");
    expect(screenFor("link", atCreate)).toBe("link");
    expect(screenFor("download", atCreate)).toBe("create");
    expect(screenFor("scan", progress(["account_created"]))).toBe("purpose");
  });

  it("never reopens the screens that make a code once it exists", () => {
    const made = progress(["code_created"], { hasCode: true });
    for (const screen of ["purpose", "link", "create"]) {
      expect(screenFor(screen, made)).toBe("download");
    }
    expect(screenFor("scan", made)).toBe("scan");
    expect(previousScreen("download", made)).toBeNull();
    expect(previousScreen("scan", made)).toBe("download");
  });

  it("ignores a step in the URL that is not a screen", () => {
    expect(screenFor("account", progress(["account_created"]))).toBe("purpose");
    expect(screenFor("../admin", progress(["account_created"]))).toBe("purpose");
    expect(screenFor(["link"], progress(["purpose_chosen"]))).toBe("link");
  });
});

describe("who the dashboard sends to the onboarding", () => {
  it("sends an account with no codes that has not finished or skipped", () => {
    expect(shouldOnboard(0, null)).toBe(true);
    expect(shouldOnboard(0, { skippedAt: null, completedAt: null })).toBe(true);
  });

  it("never sends someone who skipped, finished, or already has a code", () => {
    expect(shouldOnboard(0, { skippedAt: new Date(), completedAt: null })).toBe(false);
    expect(shouldOnboard(0, { skippedAt: null, completedAt: new Date() })).toBe(false);
    expect(shouldOnboard(1, null)).toBe(false);
  });
});

describe("the colours offered on the create screen", () => {
  it("all pass the contrast floor every saved code must meet", () => {
    for (const ink of FIRST_CODE_INKS) {
      expect(checkQrStyle({ dark: ink.dark, light: DEFAULT_QR_STYLE.light })).toEqual({ ok: true });
    }
  });

  it("starts on the default colour", () => {
    expect(FIRST_CODE_INKS[0].dark).toBe(DEFAULT_QR_STYLE.dark);
  });
});

describe("the funnel", () => {
  const counts = {
    account_created: { reached: 100, medianSeconds: null },
    purpose_chosen: { reached: 90, medianSeconds: 8 },
    destination_set: { reached: 54, medianSeconds: 70 },
    code_created: { reached: 50, medianSeconds: 30 },
    artwork_downloaded: { reached: 30, medianSeconds: 20 },
    test_scanned: { reached: 40, medianSeconds: 120 },
  };

  it("lists every step, with shares of sign-ups and of the step before", () => {
    const steps = buildFunnel(counts, { link: 12 });
    expect(steps.map((step) => step.event)).toEqual([...ONBOARDING_EVENTS]);
    const link = steps.find((step) => step.event === "destination_set")!;
    expect(link.ofStart).toBeCloseTo(0.54);
    expect(link.ofPrevious).toBeCloseTo(0.6);
    expect(link.skippedHere).toBe(12);
    expect(steps[0].ofPrevious).toBeNull();
    expect(steps[0].medianSeconds).toBeNull();
    // Measured against the code, not the optional download before it.
    expect(steps.find((step) => step.event === "test_scanned")!.ofPrevious).toBeCloseTo(0.8);
    // Nobody finished: shown as zero, not dropped.
    expect(steps.find((step) => step.event === "completed")!.reached).toBe(0);
  });

  it("names the step where the most people stopped, ignoring the optional download", () => {
    const drop = biggestDrop(buildFunnel(counts, { link: 12 }));
    expect(drop).toEqual({
      event: "destination_set",
      from: "Where it leads",
      before: 90,
      after: 54,
      skipped: 12,
    });
  });

  it("has nothing to say when nobody stopped", () => {
    expect(biggestDrop(buildFunnel({}, {}))).toBeNull();
  });

  it("reads durations at a glance", () => {
    expect(formatDuration(null)).toBe("–");
    expect(formatDuration(0.4)).toBe("1 s");
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(190)).toBe("3 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(86400 * 5)).toBe("5 days");
  });
});

describe("describing a test scan", () => {
  it("says what kind of phone and where, from what a scan records", () => {
    expect(describeScan({ deviceType: "mobile", os: "iOS", city: "Ikeja", country: "NG" })).toBe(
      "on an iPhone in Ikeja, Nigeria"
    );
    expect(describeScan({ deviceType: "mobile", os: "Android", city: null, country: "GH" })).toBe(
      "on an Android phone in Ghana"
    );
  });

  it("leaves out what was not recorded rather than saying unknown", () => {
    expect(describeScan({ deviceType: null, os: null, city: null, country: null })).toBe("");
    expect(describeScan({ deviceType: "desktop", os: "Windows", city: null, country: null })).toBe(
      "on a computer"
    );
  });
});

describe("recording steps", () => {
  it("writes once per account and step, and only for an open onboarding", async () => {
    await recordStep("user-1", "purpose_chosen");
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from qr_onboarding where user_id = \$1/);
    expect(sql).toMatch(/on conflict \(user_id, step\) do nothing/);
    expect(params).toEqual(["user-1", "purpose_chosen"]);
  });

  it("reads test scans only from the account's own code, and never a bot", async () => {
    await latestTestScan("user-1");
    const [sql, params] = queryOne.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/c\.user_id = o\.user_id/);
    expect(sql).toMatch(/where o\.user_id = \$1 and not s\.is_bot/);
    expect(params).toEqual(["user-1"]);
  });
});

describe("the scan check the last screen polls", () => {
  it("refuses a signed-out request", async () => {
    getSession.mockResolvedValue({ data: null });
    const response = await scanRoute();
    expect(response.status).toBe(401);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("answers null until there is a scan, and records nothing", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "user-1" } } });
    queryOne.mockResolvedValue(null);
    const response = await scanRoute();
    expect(await response.json()).toEqual({ scan: null });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(query).not.toHaveBeenCalled();
  });

  it("describes the scan and records the step once one arrives", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const at = new Date("2026-11-06T10:00:00Z");
    queryOne.mockResolvedValue({ scanned_at: at, country: "NG", city: "Lagos", device_type: "mobile", os: "iOS" });
    const response = await scanRoute();
    expect(await response.json()).toEqual({
      scan: { at: at.toISOString(), where: "on an iPhone in Lagos, Nigeria" },
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into qr_onboarding_steps/);
    expect(params).toEqual(["user-1", "test_scanned"]);
  });
});

describe("the privacy policy", () => {
  function text(doc: LegalDocument): string {
    return doc.sections
      .flatMap((section) =>
        section.blocks.flatMap((block) => {
          if (block.kind === "p") return [block.text];
          if (block.kind === "list") return block.items;
          return block.rows.flatMap((row) => [row.term, row.detail]);
        })
      )
      .join("\n");
  }

  it("says the setup steps are kept, and how they are recorded", () => {
    const body = text(PRIVACY);
    expect(body).toMatch(/which setup steps you reached/);
    expect(body).toMatch(/no cookie and no analytics service/);
  });
});
