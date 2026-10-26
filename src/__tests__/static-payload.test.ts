import { buildStaticPayload } from "@/lib/static-payload";

const content = (kind: Parameters<typeof buildStaticPayload>[0], f: Record<string, string>) => {
  const r = buildStaticPayload(kind, f);
  return r.ok ? r.content : `ERR:${r.reason}`;
};

describe("buildStaticPayload", () => {
  it("normalises a bare domain for a url code", () => {
    expect(content("url", { url: "google.com" })).toBe("https://google.com/");
  });

  it("refuses dangerous urls", () => {
    expect(buildStaticPayload("url", { url: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("builds mailto with encoded subject and body", () => {
    expect(content("email", { email: "a@b.co", subject: "Hi there", body: "x&y" })).toBe(
      "mailto:a@b.co?subject=Hi%20there&body=x%26y"
    );
    expect(content("email", { email: "a@b.co" })).toBe("mailto:a@b.co");
    expect(buildStaticPayload("email", { email: "nope" }).ok).toBe(false);
  });

  it("strips formatting from phone numbers", () => {
    expect(content("phone", { phone: "+234 (801) 234-5678" })).toBe("tel:+2348012345678");
    expect(buildStaticPayload("phone", { phone: "abc" }).ok).toBe(false);
  });

  it("builds sms", () => {
    expect(content("sms", { phone: "+2348012345678", message: "Hello" })).toBe(
      "SMSTO:+2348012345678:Hello"
    );
  });

  it("escapes reserved characters in wifi", () => {
    expect(content("wifi", { ssid: "My;Net", password: 'p:a"ss', security: "WPA" })).toBe(
      'WIFI:T:WPA;S:My\\;Net;P:p\\:a\\"ss;;'
    );
    expect(content("wifi", { ssid: "Open", security: "nopass", hidden: "true" })).toBe(
      "WIFI:T:nopass;S:Open;H:true;;"
    );
    expect(buildStaticPayload("wifi", { ssid: "X", security: "WPA" }).ok).toBe(false);
  });

  it("rejects empty text and oversized content", () => {
    expect(buildStaticPayload("text", { text: "  " }).ok).toBe(false);
    expect(buildStaticPayload("text", { text: "a".repeat(1001) }).ok).toBe(false);
  });
});
