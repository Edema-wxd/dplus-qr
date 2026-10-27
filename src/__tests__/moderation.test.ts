import {
  codeFiltersSchema,
  destinationHost,
  eraseRefusal,
  erasureConfirmed,
  reasonSchema,
  splitDestination,
  type EraseFacts,
} from "@/lib/moderation";

describe("codeFiltersSchema", () => {
  it("reads every filter", () => {
    expect(
      codeFiltersSchema.parse({ q: " bank ", status: "blocked", kind: "pdf", flag: "reported", page: "3" })
    ).toEqual({ q: "bank", status: "blocked", kind: "pdf", flag: "reported", page: 3 });
  });

  it("reads a bad value as no filter rather than failing the page", () => {
    expect(
      codeFiltersSchema.parse({ status: "deleted", kind: "nope", flag: "x", page: "-2" })
    ).toEqual({ q: "", status: undefined, kind: undefined, flag: undefined, page: 1 });
  });

  it("takes the first of a repeated parameter", () => {
    expect(codeFiltersSchema.parse({ status: ["paused", "active"] }).status).toBe("paused");
  });

  it("defaults to page one with nothing given", () => {
    expect(codeFiltersSchema.parse({})).toEqual({
      q: "",
      status: undefined,
      kind: undefined,
      flag: undefined,
      page: 1,
    });
  });
});

describe("reasonSchema", () => {
  it("requires a reason the owner can read", () => {
    expect(reasonSchema.safeParse("  ").success).toBe(false);
    expect(reasonSchema.safeParse("Phishing page").success).toBe(true);
    expect(reasonSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});

describe("destinationHost", () => {
  it("is the host of an outside link", () => {
    expect(destinationHost("https://Shop.example.com/sale?x=1")).toBe("shop.example.com");
  });

  it("is null for a page hosted here and for anything not a web link", () => {
    expect(destinationHost("/p/Ab3kQ9x")).toBeNull();
    expect(destinationHost("")).toBeNull();
    expect(destinationHost("javascript:alert(1)")).toBeNull();
  });
});

describe("splitDestination", () => {
  it("sets the host apart from the rest", () => {
    expect(splitDestination("https://example.com/path?q=1")).toEqual({
      before: "https://",
      host: "example.com",
      rest: "/path?q=1",
    });
  });

  it("names the real host, not a look-alike in the userinfo", () => {
    expect(splitDestination("https://paystack.com@evil.ng/login")).toEqual({
      before: "https://paystack.com@",
      host: "evil.ng",
      rest: "/login",
    });
  });

  it("is not fooled when the userinfo repeats the host", () => {
    expect(splitDestination("https://evil.ng@evil.ng/x").before).toBe("https://evil.ng@");
  });

  it("keeps the case the destination was written in", () => {
    expect(splitDestination("https://Example.COM/").host).toBe("Example.COM");
  });

  it("shows the rewritten form of an internationalised host first", () => {
    const split = splitDestination("https://pаypal.com/"); // Cyrillic а
    expect(split.host.startsWith("xn--")).toBe(true);
    expect(split.rest).toContain("pаypal.com");
  });

  it("leaves a non-link whole", () => {
    expect(splitDestination("/p/Ab3kQ9x")).toEqual({ before: "", host: "", rest: "/p/Ab3kQ9x" });
  });
});

describe("erasureConfirmed", () => {
  it("accepts the account's email, forgiving case and spaces", () => {
    expect(erasureConfirmed("  Ada@Example.com ", "ada@example.com")).toBe(true);
  });

  it("refuses anything else", () => {
    expect(erasureConfirmed("ada@example.co", "ada@example.com")).toBe(false);
    expect(erasureConfirmed("", "ada@example.com")).toBe(false);
  });

  it("can never be confirmed against an empty email, as an erased account has", () => {
    expect(erasureConfirmed("", "")).toBe(false);
    expect(erasureConfirmed(" ", "")).toBe(false);
  });
});

describe("eraseRefusal", () => {
  const facts = (overrides: Partial<EraseFacts> = {}): EraseFacts => ({
    staffId: "staff",
    userId: "customer",
    targetIsAdmin: false,
    alreadyErased: false,
    liveViaPaystack: false,
    ...overrides,
  });

  it("allows an ordinary account", () => {
    expect(eraseRefusal(facts())).toBeNull();
  });

  it("refuses staff erasing themselves", () => {
    expect(eraseRefusal(facts({ userId: "staff" }))).toMatch(/your own/);
  });

  it("refuses a staff account", () => {
    expect(eraseRefusal(facts({ targetIsAdmin: true }))).toMatch(/staff account/);
  });

  it("refuses an account already erased", () => {
    expect(eraseRefusal(facts({ alreadyErased: true }))).toMatch(/already/);
  });

  it("refuses an account Paystack is still charging", () => {
    expect(eraseRefusal(facts({ liveViaPaystack: true }))).toMatch(/Paystack/);
  });
});
