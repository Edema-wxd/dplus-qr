let key: string | undefined;
jest.mock("@/lib/env", () => ({ env: () => ({ WEB_RISK_API_KEY: key }) }));

import {
  describeThreats,
  firstFlagged,
  flaggedReason,
  pageLinks,
  reputationOf,
  reputationOfMany,
} from "@/lib/reputation";
import { ownerNotice } from "@/lib/reputation-sweep";

const fetchMock = jest.fn();
const realFetch = global.fetch;

beforeEach(() => {
  key = "test-key";
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

describe("checking several links", () => {
  it("looks each distinct link up once and finds the flagged one", async () => {
    fetchMock.mockImplementation((input: string) =>
      answer(new URL(input).searchParams.get("uri") === "https://bad.example/" ? { threat: { threatTypes: ["MALWARE"] } } : {})
    );
    const hit = await firstFlagged(["https://good.example/", "https://bad.example/", "https://good.example/"]);
    expect(hit).toEqual({ url: "https://bad.example/", threats: ["MALWARE"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("finds nothing, and calls nothing, when there is no key", async () => {
    key = undefined;
    expect(await firstFlagged(["https://bad.example/"])).toBeNull();
    const many = await reputationOfMany(["https://a.example/", "https://b.example/"]);
    expect([...many.values()].every((r) => r.verdict === "unavailable")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
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
