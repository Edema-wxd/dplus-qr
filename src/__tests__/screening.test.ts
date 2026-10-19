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

  it("rejects a bare IPv4 host, which hides who is being visited", () => {
    expect(screenUrl("https://192.168.1.1/login").ok).toBe(false);
  });

  it("rejects an IPv6 literal host", () => {
    expect(screenUrl("https://[2001:db8::1]/").ok).toBe(false);
  });

  it("rejects other shorteners, which defeat screening", () => {
    expect(screenUrl("https://bit.ly/abc123").ok).toBe(false);
    expect(screenUrl("https://www.tinyurl.com/abc").ok).toBe(false);
  });

  it("rejects a code pointing at the redirect host itself", () => {
    expect(screenUrl("https://qr.de-signplus.com/Ab3kQ9x").ok).toBe(false);
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
