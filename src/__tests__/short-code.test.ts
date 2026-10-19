import {
  ALPHABET,
  CODE_LENGTH,
  generateCode,
  isReserved,
  isValidCodeFormat,
  RESERVED_CODES,
} from "@/lib/short-code";

describe("short code alphabet", () => {
  it("excludes the characters that are ambiguous in print", () => {
    for (const char of ["0", "O", "I", "l"]) {
      expect(ALPHABET).not.toContain(char);
    }
  });

  it("is base-58", () => {
    expect(ALPHABET).toHaveLength(58);
    expect(new Set(ALPHABET).size).toBe(58);
  });
});

describe("isValidCodeFormat", () => {
  it("accepts a well-formed code", () => {
    expect(isValidCodeFormat("Ab3kQ9x")).toBe(true);
  });

  it.each([
    ["too short", "Ab3kQ9"],
    ["too long", "Ab3kQ9xy"],
    ["ambiguous zero", "Ab3kQ90"],
    ["ambiguous capital O", "Ab3kQ9O"],
    ["hyphen", "Ab3-Q9x"],
    ["empty", ""],
    ["path traversal", "../../et"],
  ])("rejects %s", (_label, input) => {
    expect(isValidCodeFormat(input)).toBe(false);
  });

  it("accepts a reserved word that happens to be well-formed", () => {
    // "favicon" is seven valid base-58 characters, so the format check passes.
    // Keeping it out of circulation is the reserved list's job, not this
    // function's -- which is exactly why the reserved list has to exist.
    expect(isValidCodeFormat("favicon")).toBe(true);
    expect(isReserved("favicon")).toBe(true);
  });
});

describe("generateCode", () => {
  it("always produces a valid, non-reserved code", () => {
    for (let i = 0; i < 2_000; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isValidCodeFormat(code)).toBe(true);
      expect(isReserved(code)).toBe(false);
    }
  });

  it("does not repeat itself over a large sample", () => {
    const seen = new Set(Array.from({ length: 5_000 }, () => generateCode()));
    // Collisions are possible but astronomically unlikely at this sample size.
    expect(seen.size).toBe(5_000);
  });
});

describe("reserved codes", () => {
  it("covers every route that exists on this host", () => {
    // If a route is added without being reserved, a generated code could
    // shadow it and a printed code would dead-end.
    for (const route of ["health", "paused", "blocked", "report"]) {
      expect(RESERVED_CODES.has(route)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReserved("HEALTH")).toBe(true);
  });
});
