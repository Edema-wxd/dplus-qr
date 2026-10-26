import {
  checkQrStyle,
  contrastRatio,
  DEFAULT_QR_STYLE,
  isDefaultQrStyle,
  MIN_QR_CONTRAST,
  qrStyleSchema,
  qrStyleVars,
  readQrStyle,
} from "@/lib/qr-style";

/**
 * The style module decides which colour pairs a customer may print. A pair
 * that passes here goes onto packaging and has to scan for years, so these
 * hold the checks, not the styling.
 */

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#1A1A1A", "#F5E6C8")).toBeCloseTo(
      contrastRatio("#F5E6C8", "#1A1A1A"),
      10
    );
  });
});

describe("checkQrStyle", () => {
  it("accepts the default", () => {
    expect(checkQrStyle(DEFAULT_QR_STYLE)).toEqual({ ok: true });
  });

  it("accepts a dark brand colour on a light ground", () => {
    expect(checkQrStyle({ dark: "#0B3D5C", light: "#FFF8EC" }).ok).toBe(true);
  });

  it("refuses an inverted code even at full contrast, because many scanners cannot read one", () => {
    const result = checkQrStyle({ dark: "#FFFFFF", light: "#000000" });
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toMatch(/darker than the background/i);
  });

  it("refuses identical colours", () => {
    expect(checkQrStyle({ dark: "#336699", light: "#336699" }).ok).toBe(false);
  });

  it("refuses a pair below the minimum and quotes the ratio", () => {
    // Mid grey on white: about 4.0:1, under the 4.5 floor.
    const result = checkQrStyle({ dark: "#808080", light: "#FFFFFF" });
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toContain(`${MIN_QR_CONTRAST}:1`);
    expect(result.reason).toMatch(/\d\.\d:1/);
  });

  it("accepts a pair just above the minimum", () => {
    // #767676 on white is the classic 4.54:1.
    expect(checkQrStyle({ dark: "#767676", light: "#FFFFFF" }).ok).toBe(true);
  });
});

describe("qrStyleSchema", () => {
  it("normalises to uppercase", () => {
    expect(qrStyleSchema.parse({ dark: "#0b3d5c", light: " #ffffff " })).toEqual({
      dark: "#0B3D5C",
      light: "#FFFFFF",
    });
  });

  it.each(["0B3D5C", "#FFF", "#GGGGGG", "#0B3D5C80", "red", "", null, 42])(
    "rejects %p",
    (value) => {
      expect(qrStyleSchema.safeParse({ dark: value, light: "#FFFFFF" }).success).toBe(
        false
      );
    }
  );
});

describe("readQrStyle", () => {
  it("reads a valid stored pair", () => {
    expect(readQrStyle({ dark: "#0b3d5c", light: "#FFF8EC" })).toEqual({
      dark: "#0B3D5C",
      light: "#FFF8EC",
    });
  });

  it("keeps the colours when other keys share the object", () => {
    expect(
      readQrStyle({ dark: "#0B3D5C", light: "#FFFFFF", logo: { size: 0.2 } })
    ).toEqual({ dark: "#0B3D5C", light: "#FFFFFF" });
  });

  it.each([
    ["the column default", {}],
    ["null", null],
    ["a string", "#000000"],
    ["only one colour", { dark: "#000000" }],
    ["malformed hex", { dark: "black", light: "white" }],
  ])("falls back to the default for %s", (_label, stored) => {
    expect(readQrStyle(stored)).toEqual(DEFAULT_QR_STYLE);
  });

  it("never hands back a pair that would not scan, whatever is stored", () => {
    // Written by hand, or before the check existed: the download must still scan.
    expect(readQrStyle({ dark: "#FFFFFF", light: "#000000" })).toEqual(
      DEFAULT_QR_STYLE
    );
    expect(readQrStyle({ dark: "#999999", light: "#AAAAAA" })).toEqual(
      DEFAULT_QR_STYLE
    );
  });
});

describe("helpers", () => {
  it("knows the default", () => {
    expect(isDefaultQrStyle(DEFAULT_QR_STYLE)).toBe(true);
    expect(isDefaultQrStyle({ dark: "#000000", light: "#FFFFFF" })).toBe(false);
  });

  it("maps a style onto the properties QrSymbol paints with", () => {
    expect(qrStyleVars({ dark: "#0B3D5C", light: "#FFF8EC" })).toEqual({
      "--qr-ink": "#0B3D5C",
      "--qr-ground": "#FFF8EC",
      "--qr-ground-solid": "#FFF8EC",
    });
  });
});
