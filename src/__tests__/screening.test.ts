import { checkReputation, screenUrl } from "@/lib/screening";

describe("screenUrl", () => {
  it("accepts an ordinary https link", () => {
    const result = screenUrl("https://de-signplus.com/products");
    expect(result).toEqual({ ok: true, normalised: "https://de-signplus.com/products" });
  });

  it("accepts http, since plenty of small business sites are still http", () => {
    expect(screenUrl("http://example.com").ok).toBe(true);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html;base64,PHNjcmlwdD4="],
    ["file:", "file:///etc/passwd"],
    ["mailto:", "mailto:someone@example.com"],
  ])("rejects the %s scheme", (_label, input) => {
    expect(screenUrl(input).ok).toBe(false);
  });

  describe("bare domains", () => {
    it.each([
      ["google.com", "https://google.com/"],
      ["  Google.com  ", "https://google.com/"],
      ["www.example.co.uk/sale?x=1", "https://www.example.co.uk/sale?x=1"],
      ["//example.com/a", "https://example.com/a"],
      ["example.com:8080/a", "https://example.com:8080/a"],
    ])("accepts %j", (input, expected) => {
      expect(screenUrl(input)).toEqual({ ok: true, normalised: expected });
    });

    it.each([
      "mailto:a@evil.com",
      "tel:+2348012345678",
      "javascript:alert(1)",
      "ftp://example.com",
      "not a url",
      "localhost",
      "192.168.1.1",
      "bit.ly/abc",
      "qriateplus.com/Ab3kQ9x",
    ])("still rejects %j", (input) => {
      expect(screenUrl(input).ok).toBe(false);
    });
  });

  it("rejects a bare IPv4 host, which hides who is being visited", () => {
    expect(screenUrl("https://192.168.1.1/login").ok).toBe(false);
  });

  it.each([
    "https://paystack.com@evil.ng/login",
    "paystack.com@evil.ng",
    "https://user:secret@example.com/",
    "https://:secret@example.com/",
    "http://www.gtbank.com%40evil.ng@evil.ng/",
  ])("rejects userinfo, which disguises the real host: %j", (input) => {
    const result = screenUrl(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/@/);
  });

  it("still accepts an @ in the path or query, which is not userinfo", () => {
    expect(screenUrl("https://example.com/@shop").ok).toBe(true);
    expect(screenUrl("https://example.com/contact?to=ada@example.com").ok).toBe(true);
  });

  it("rejects an IPv6 literal host", () => {
    expect(screenUrl("https://[2001:db8::1]/").ok).toBe(false);
  });

  it("rejects other shorteners, which defeat screening", () => {
    expect(screenUrl("https://bit.ly/abc123").ok).toBe(false);
    expect(screenUrl("https://www.tinyurl.com/abc").ok).toBe(false);
  });

  it.each([
    ["the current redirect host", "https://qriateplus.com/Ab3kQ9x"],
    ["www of the redirect host", "https://www.qriateplus.com/Ab3kQ9x"],
    ["a retired redirect host", "https://qr.de-signplus.com/Ab3kQ9x"],
    ["the demo host", "https://dplus-qr.vercel.app/Ab3kQ9x"],
  ])("rejects a code pointing at %s", (_label, url) => {
    // Chaining codes would loop and would let a second hop escape screening.
    // Retired hosts stay refused because codes printed against them still
    // resolve.
    expect(screenUrl(url).ok).toBe(false);
  });

  it("still accepts an unrelated host on the same registrar", () => {
    expect(screenUrl("https://de-signplus.com/products").ok).toBe(true);
  });

  it("rejects a host with no public domain", () => {
    expect(screenUrl("https://localhost/admin").ok).toBe(false);
  });

  it("rejects an empty value with a usable message", () => {
    const result = screenUrl("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/enter a destination/i);
  });

  it("is not case-sensitive about the scheme", () => {
    expect(screenUrl("JAVASCRIPT:alert(1)").ok).toBe(false);
  });
});

describe("checkReputation", () => {
  it("reports unavailable rather than clean while stubbed", async () => {
    // "unavailable" must never be read as "checked and safe".
    await expect(checkReputation("https://example.com")).resolves.toBe("unavailable");
  });
});
