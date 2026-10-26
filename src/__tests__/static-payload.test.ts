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

describe("buildStaticPayload, newer kinds", () => {
  it("builds a wa.me link and requires a country code", () => {
    expect(content("whatsapp", { phone: "+234 801 234 5678", message: "Hi there" })).toBe(
      "https://wa.me/2348012345678?text=Hi%20there"
    );
    expect(content("whatsapp", { phone: "+2348012345678" })).toBe("https://wa.me/2348012345678");
    expect(buildStaticPayload("whatsapp", { phone: "08012345678" }).ok).toBe(false);
  });

  it("builds a vCard and escapes reserved characters", () => {
    const card = content("vcard", {
      firstName: "Ada",
      lastName: "Obi",
      organisation: "Obi; Sons",
      mobile: "+234 801 234 5678",
      email: "ada@obi.ng",
      website: "obi.ng",
    });
    expect(card).toContain("BEGIN:VCARD\r\nVERSION:3.0\r\nN:Obi;Ada;;;\r\nFN:Ada Obi");
    expect(card).toContain("ORG:Obi\\; Sons");
    expect(card).toContain("TEL;TYPE=CELL:+2348012345678");
    expect(card).toContain("URL:https://obi.ng/");
    expect(card.endsWith("END:VCARD")).toBe(true);
    expect(buildStaticPayload("vcard", {}).ok).toBe(false);
    expect(buildStaticPayload("vcard", { firstName: "A", email: "nope" }).ok).toBe(false);
  });

  it("builds a PayPal payment link", () => {
    const link = content("paypal", {
      email: "pay@shop.ng",
      item: "Order 12",
      amount: "25.50",
      currency: "GBP",
    });
    const url = new URL(link);
    expect(url.hostname).toBe("www.paypal.com");
    expect(url.searchParams.get("cmd")).toBe("_xclick");
    expect(url.searchParams.get("business")).toBe("pay@shop.ng");
    expect(url.searchParams.get("item_name")).toBe("Order 12");
    expect(url.searchParams.get("amount")).toBe("25.50");
    expect(url.searchParams.get("currency_code")).toBe("GBP");
    expect(buildStaticPayload("paypal", { email: "pay@shop.ng", item: "x", currency: "NGN" }).ok).toBe(
      false
    );
    expect(buildStaticPayload("paypal", { email: "pay@shop.ng", item: "x", amount: "1,000" }).ok).toBe(
      false
    );
  });

  it("builds a BIP 21 bitcoin URI", () => {
    expect(
      content("bitcoin", {
        address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
        amount: "0.0015",
        label: "Ada Obi",
      })
    ).toBe("bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.0015&label=Ada%20Obi");
    expect(content("bitcoin", { address: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT" })).toBe(
      "bitcoin:1BoatSLRHtKNngkdXEeobR76b53LETtpyT"
    );
    expect(buildStaticPayload("bitcoin", { address: "send me money" }).ok).toBe(false);
    expect(
      buildStaticPayload("bitcoin", { address: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT", amount: "-1" }).ok
    ).toBe(false);
  });
});
