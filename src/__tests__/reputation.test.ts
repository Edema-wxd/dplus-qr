let key: string | undefined;
jest.mock("@/lib/env", () => ({ env: () => ({ WEB_RISK_API_KEY: key }) }));

/** A Redis stand-in: a plain map, or null for "no Redis". */
let store: Map<string, unknown> | null;
let redisFails = false;
const setCalls: { key: string; value: unknown; ex: number }[] = [];
jest.mock("@/lib/redis", () => ({
  redis: () =>
    store && {
      mget: async (...keys: string[]) => {
        if (redisFails) throw new Error("down");
        return keys.map((k) => store!.get(k) ?? null);
      },
      set: async (k: string, value: unknown, opts: { ex: number }) => {
        setCalls.push({ key: k, value, ex: opts.ex });
        store!.set(k, value);
        return "OK";
      },
    },
}));

const alertOnce = jest.fn();
jest.mock("@/lib/error-alerts", () => ({ alertOnce: (...args: unknown[]) => alertOnce(...args) }));

const allowScreeningLookups = jest.fn();
jest.mock("@/lib/ratelimit", () => ({
  allowScreeningLookups: (...args: unknown[]) => allowScreeningLookups(...args),
}));

import {
  checkLinks,
  describeThreats,
  flaggedReason,
  LOOKUPS_SPENT,
  pageLinks,
  reputationOf,
  reputationOfMany,
  resetRefusalAlerts,
  VERDICT_TTL_SECONDS,
  verdictsFor,
} from "@/lib/reputation";
import { ownerNotice } from "@/lib/reputation-sweep";

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  key = "test-key";
  store = new Map();
  redisFails = false;
  setCalls.length = 0;
  alertOnce.mockReset().mockResolvedValue(undefined);
  allowScreeningLookups.mockReset().mockResolvedValue(true);
  resetRefusalAlerts();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
  global.fetch = realFetch;
});

const answer = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("reputationOf", () => {
  it("is dormant without a key: unavailable, never clean, and Google is never called", async () => {
    key = undefined;
    await expect(reputationOf("https://example.com")).resolves.toEqual({ verdict: "unavailable", threats: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks Web Risk about the three threat types, with the key", async () => {
    fetchMock.mockReturnValue(answer({}));
    await expect(reputationOf("https://example.com/a?b=1")).resolves.toEqual({ verdict: "clean", threats: [] });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://webrisk.googleapis.com/v1/uris:search");
    expect(url.searchParams.get("uri")).toBe("https://example.com/a?b=1");
    expect(url.searchParams.get("key")).toBe("test-key");
    expect(url.searchParams.getAll("threatTypes")).toEqual(["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]);
  });

  it("reads a listed link's threats, ignoring types it did not ask about", async () => {
    fetchMock.mockReturnValue(answer({ threat: { threatTypes: ["SOCIAL_ENGINEERING", "SOMETHING_NEW"], expireTime: "x" } }));
    await expect(reputationOf("https://bad.example")).resolves.toEqual({
      verdict: "flagged",
      threats: ["SOCIAL_ENGINEERING"],
    });
  });

  it("treats an error, a refusal or a timeout as unavailable, so a save goes through", async () => {
    fetchMock.mockReturnValueOnce(answer({ error: "quota" }, 429));
    await expect(reputationOf("https://a.example")).resolves.toMatchObject({ verdict: "unavailable" });
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    await expect(reputationOf("https://a.example")).resolves.toMatchObject({ verdict: "unavailable" });
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response("not json", { status: 200 })));
    await expect(reputationOf("https://a.example")).resolves.toMatchObject({ verdict: "unavailable" });
  });

  it("never logs the request URL, which carries the key", async () => {
    fetchMock.mockReturnValueOnce(answer({}, 500));
    await reputationOf("https://a.example");
    for (const call of (console.error as jest.Mock).mock.calls) {
      expect(JSON.stringify(call)).not.toContain("test-key");
    }
  });
});

/** Google's answer for a link: `bad.example` is listed, everything else clean. */
const google = (input: string) =>
  answer(new URL(input).searchParams.get("uri")?.includes("bad.example") ? { threat: { threatTypes: ["MALWARE"] } } : {});

describe("checking the links a save stores", () => {
  it("looks each distinct link up once and refuses the flagged one, saying why", async () => {
    fetchMock.mockImplementation(google);
    const result = await checkLinks(["https://good.example/", "https://bad.example/", "https://good.example/"], "acct");
    expect(result).toEqual({ ok: false, reason: flaggedReason("https://bad.example/", ["MALWARE"]) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets clean and unavailable links through", async () => {
    fetchMock.mockReturnValueOnce(answer({})).mockReturnValueOnce(answer({}, 500));
    await expect(checkLinks(["https://a.example/", "https://b.example/"], "acct")).resolves.toEqual({ ok: true });
  });

  it("passes everything, calls nothing and spends nothing when there is no key", async () => {
    key = undefined;
    await expect(checkLinks(["https://bad.example/"], "acct")).resolves.toEqual({ ok: true });
    const many = await reputationOfMany(["https://a.example/", "https://b.example/"]);
    expect([...many.values()].every((r) => r.verdict === "unavailable")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(allowScreeningLookups).not.toHaveBeenCalled();
  });
});

describe("the verdict cache (audit L4)", () => {
  it("answers a second check of the same links from the cache, asking Google nothing and spending nothing", async () => {
    fetchMock.mockImplementation(google);
    const urls = ["https://good.example/", "https://bad.example/"];
    await verdictsFor(urls, "acct");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(allowScreeningLookups).toHaveBeenCalledWith("acct", 2);

    fetchMock.mockClear();
    allowScreeningLookups.mockClear();
    const again = await verdictsFor(urls, "acct");
    expect(again?.get("https://bad.example/")).toEqual({ verdict: "flagged", threats: ["MALWARE"] });
    expect(again?.get("https://good.example/")).toEqual({ verdict: "clean", threats: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(allowScreeningLookups).not.toHaveBeenCalled();
  });

  it("keeps verdicts for a day, under a hashed key that does not contain the link", async () => {
    fetchMock.mockImplementation(google);
    await verdictsFor(["https://good.example/secret-path"], "acct");
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].ex).toBe(VERDICT_TTL_SECONDS);
    expect(VERDICT_TTL_SECONDS).toBe(86_400);
    expect(setCalls[0].key).toMatch(/^wr:v1:[0-9a-f]{32}$/);
    expect(setCalls[0].key).not.toContain("good.example");
  });

  it("never keeps an unavailable answer, so the next save asks again", async () => {
    fetchMock.mockReturnValue(answer({}, 500));
    await verdictsFor(["https://a.example/"], "acct");
    expect(setCalls).toHaveLength(0);
  });

  it("ignores a stored value that is not a verdict", async () => {
    fetchMock.mockImplementation(google);
    await verdictsFor(["https://a.example/"], "acct");
    for (const k of store!.keys()) store!.set(k, { v: "flagged", t: ["NOT_A_THREAT"] });
    fetchMock.mockClear();
    await verdictsFor(["https://a.example/"], "acct");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks Google when Redis is down or absent, rather than failing the save", async () => {
    fetchMock.mockImplementation(google);
    redisFails = true;
    await expect(checkLinks(["https://bad.example/"], "acct")).resolves.toMatchObject({ ok: false });
    store = null;
    await expect(checkLinks(["https://bad.example/"], "acct")).resolves.toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("the weekly re-check always asks Google afresh, and refreshes the cache", async () => {
    fetchMock.mockImplementation(google);
    await verdictsFor(["https://good.example/"], "acct");
    fetchMock.mockClear();
    setCalls.length = 0;
    await reputationOfMany(["https://good.example/"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setCalls).toHaveLength(1);
  });
});

describe("the account's lookup allowance (audit L4)", () => {
  it("spends only for links not in the cache", async () => {
    fetchMock.mockImplementation(google);
    await verdictsFor(["https://a.example/"], "acct");
    allowScreeningLookups.mockClear();
    await verdictsFor(["https://a.example/", "https://b.example/", "https://c.example/"], "acct");
    expect(allowScreeningLookups).toHaveBeenCalledWith("acct", 2);
  });

  it("refuses the save when the allowance is spent, without asking Google or letting it through", async () => {
    allowScreeningLookups.mockResolvedValue(false);
    await expect(verdictsFor(["https://bad.example/"], "acct")).resolves.toBeNull();
    await expect(checkLinks(["https://bad.example/"], "acct")).resolves.toEqual({ ok: false, reason: LOOKUPS_SPENT });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not spend the allowance on the weekly re-check", async () => {
    fetchMock.mockImplementation(google);
    await reputationOfMany(["https://a.example/"]);
    expect(allowScreeningLookups).not.toHaveBeenCalled();
  });
});

describe("when Google refuses lookups (audit L4)", () => {
  it.each([429, 401, 403])("a %s emails staff once, and stops asking for the rest of the run", async (status) => {
    fetchMock.mockReturnValue(answer({ error: "no" }, status));
    const urls = ["https://a.example/", "https://b.example/", "https://c.example/"];
    const results = await reputationOfMany(urls, 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([...results.values()].every((r) => r.verdict === "unavailable")).toBe(true);
    await reputationOfMany(urls, 1);
    expect(alertOnce).toHaveBeenCalledTimes(1);
    expect(alertOnce.mock.calls[0][0]).toBe(`web-risk:${status}`);
    expect(alertOnce.mock.calls[0][1]).toContain(String(status));
    expect(JSON.stringify(alertOnce.mock.calls)).not.toContain("test-key");
  });

  it("does not alert on an ordinary server error", async () => {
    fetchMock.mockReturnValue(answer({}, 500));
    await reputationOfMany(["https://a.example/"]);
    expect(alertOnce).not.toHaveBeenCalled();
  });

  it("still lets the save through, as decided on 8 Nov", async () => {
    fetchMock.mockReturnValue(answer({}, 429));
    await expect(checkLinks(["https://bad.example/"], "acct")).resolves.toEqual({ ok: true });
  });
});

describe("pageLinks", () => {
  it("collects every outside link in a page, wherever it sits, but not the account's own files", () => {
    const content = {
      title: "Mama Put",
      links: [
        { label: "Order", url: "https://order.example/menu" },
        { label: "Not a link", url: "mailto:a@b.example" },
      ],
      socials: { instagram: "https://www.instagram.com/mamaput/" },
      cover: { fileId: "42", url: "https://fmctfyekk3.ufs.sh/f/abc", name: "cover.jpg", mime: "image/jpeg" },
      note: "Visit us at the market",
    };
    expect([...pageLinks(content)].sort()).toEqual([
      "https://order.example/menu",
      "https://www.instagram.com/mamaput/",
    ]);
  });

  it("screens a typed link to any UploadThing host, which anyone can publish on", () => {
    const content = {
      links: [
        { label: "Menu", url: "https://someone-else.ufs.sh/f/page.html" },
        { label: "Old", url: "https://utfs.io/f/key" },
      ],
    };
    expect([...pageLinks(content)].sort()).toEqual([
      "https://someone-else.ufs.sh/f/page.html",
      "https://utfs.io/f/key",
    ]);
  });
});

describe("what people are told", () => {
  it("names the site and the threat when a save is refused", () => {
    expect(flaggedReason("https://login-paystack.example/x", ["SOCIAL_ENGINEERING"])).toBe(
      "login-paystack.example is on Google's list of unsafe sites, for phishing or a scam. Choose a different link."
    );
    expect(describeThreats(["MALWARE", "UNWANTED_SOFTWARE", "MALWARE"])).toBe("malware and unwanted software");
  });

  it("tells the owner which code, which site, why, and what to do", () => {
    const { subject, text } = ownerNotice({
      name: "Shop window\r\nBcc: x",
      shortCode: "Ab3dEf9",
      url: "https://hacked.example/promo",
      threats: ["MALWARE"],
    });
    expect(subject).toBe("We blocked qriateplus.com/Ab3dEf9 for safety");
    expect(text).toContain('Your code "Shop window Bcc: x" (qriateplus.com/Ab3dEf9) has been blocked.');
    expect(text).toContain("Google now lists hacked.example, which the code leads to, as unsafe: malware.");
    expect(text).toContain("reply to this email");
  });
});
