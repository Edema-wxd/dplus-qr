import {
  checkQrStyle,
  contrastRatio,
  DEFAULT_QR_STYLE,
  isDefaultQrStyle,
  pageBrand,
  MIN_QR_CONTRAST,
  qrStyleSchema,
  qrStyleVars,
  readQrStyle,
  weakestContrast,
  type QrStyle,
} from "@/lib/qr-style";

/** A style that differs from the default only in its two colours. */
const pair = (dark: string, light: string): QrStyle => ({ ...DEFAULT_QR_STYLE, dark, light });

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
    expect(checkQrStyle(pair("#0B3D5C", "#FFF8EC")).ok).toBe(true);
  });

  it("refuses an inverted code even at full contrast, because many scanners cannot read one", () => {
    const result = checkQrStyle(pair("#FFFFFF", "#000000"));
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toMatch(/darker than the background/i);
  });

  it("refuses identical colours", () => {
    expect(checkQrStyle(pair("#336699", "#336699")).ok).toBe(false);
  });

  it("refuses a pair below the minimum and quotes the ratio", () => {
    // Mid grey on white: about 4.0:1, under the 4.5 floor.
    const result = checkQrStyle(pair("#808080", "#FFFFFF"));
    if (result.ok) throw new Error("expected refusal");
    expect(result.reason).toContain(`${MIN_QR_CONTRAST}:1`);
    expect(result.reason).toMatch(/\d\.\d:1/);
  });

  it("accepts a pair just above the minimum", () => {
    // #767676 on white is the classic 4.54:1.
    expect(checkQrStyle(pair("#767676", "#FFFFFF")).ok).toBe(true);
  });
});

describe("qrStyleSchema", () => {
  it("normalises to uppercase", () => {
    expect(qrStyleSchema.parse({ dark: "#0b3d5c", light: " #ffffff " })).toEqual(pair("#0B3D5C", "#FFFFFF"));
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
    expect(readQrStyle({ dark: "#0b3d5c", light: "#FFF8EC" })).toEqual(pair("#0B3D5C", "#FFF8EC"));
  });

  it("keeps the colours when other keys share the object", () => {
    expect(
      readQrStyle({ dark: "#0B3D5C", light: "#FFFFFF", logo: { size: 0.2 } })
    ).toEqual(pair("#0B3D5C", "#FFFFFF"));
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

describe("patterns and corners", () => {
  it("reads a row saved before patterns existed as the artwork it always drew", () => {
    expect(readQrStyle({ dark: "#0B3D5C", light: "#FFFFFF" })).toMatchObject({
      pattern: "square",
      cornerFrame: "auto",
      cornerDot: "auto",
      cornerFrameColor: null,
      cornerDotColor: null,
      transparent: false,
    });
  });

  it("reads a full style", () => {
    const stored = {
      dark: "#000000",
      light: "#FFFFFF",
      pattern: "classy-rounded",
      cornerFrame: "circle",
      cornerDot: "dot",
      cornerFrameColor: "#2E6B2E",
      cornerDotColor: "#1A4F8A",
      transparent: true,
    };
    expect(readQrStyle(stored)).toEqual({ ...stored, frame: "none", frameText: "Scan me!", frameColor: null });
  });

  it("drops one bad key without losing the rest", () => {
    const style = readQrStyle({
      dark: "#0B3D5C",
      light: "#FFFFFF",
      pattern: "hearts",
      cornerFrame: "circle",
      cornerFrameColor: "#EEEEEE", // far too pale to scan
    });
    expect(style).toMatchObject({ dark: "#0B3D5C", pattern: "square", cornerFrame: "circle", cornerFrameColor: null });
  });

  it("holds the corner colours to the same rule as the code colour", () => {
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, cornerFrameColor: "#72C166" }).ok).toBe(false);
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, cornerDotColor: "#1BA3DD" }).ok).toBe(false);
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, cornerFrameColor: "#2E6B2E", cornerDotColor: "#1A4F8A" }).ok).toBe(true);
  });

  it("names the colour that fails", () => {
    const result = checkQrStyle({ ...DEFAULT_QR_STYLE, cornerDotColor: "#FFFFFF" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/corner dot/);
  });

  it("quotes the weakest contrast among the inks", () => {
    const style = { ...DEFAULT_QR_STYLE, dark: "#000000", cornerFrameColor: "#767676" };
    expect(weakestContrast(style)).toBeCloseTo(contrastRatio("#767676", "#FFFFFF"));
  });

  it.each([
    ["an unknown pattern", { pattern: "hearts" }],
    ["an unknown corner", { cornerFrame: "star" }],
    ["a malformed corner colour", { cornerDotColor: "blue" }],
    ["a non-boolean transparency", { transparent: "yes" }],
  ])("the schema refuses %s", (_name, extra) => {
    expect(qrStyleSchema.safeParse({ dark: "#000000", light: "#FFFFFF", ...extra }).success).toBe(false);
  });

  it("counts any change from the default as not default", () => {
    expect(isDefaultQrStyle({ ...DEFAULT_QR_STYLE, pattern: "dots" })).toBe(false);
    expect(isDefaultQrStyle({ ...DEFAULT_QR_STYLE, transparent: true })).toBe(false);
  });
});

describe("frames", () => {
  it("defaults to no frame with the standard call to action", () => {
    expect(readQrStyle({ dark: "#000000", light: "#FFFFFF" })).toMatchObject({
      frame: "none",
      frameText: "Scan me!",
      frameColor: null,
    });
  });

  it("checks the frame colour is readable on the background", () => {
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, frame: "box", frameColor: "#DDDDDD" }).ok).toBe(false);
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, frame: "box", frameColor: "#1A4F8A" }).ok).toBe(true);
  });

  it("ignores the frame colour when there is no frame", () => {
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, frame: "none", frameColor: "#FFFFFF" }).ok).toBe(true);
  });

  it("refuses frame text it cannot draw, or none at all", () => {
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, frame: "pill", frameText: "Scan 🙂" }).ok).toBe(false);
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, frame: "pill", frameText: "  " }).ok).toBe(false);
    expect(checkQrStyle({ ...DEFAULT_QR_STYLE, frame: "pill", frameText: "Pay ₦500 here" }).ok).toBe(true);
  });

  it("the schema holds the same rules", () => {
    const base = { dark: "#000000", light: "#FFFFFF", frame: "box" };
    expect(qrStyleSchema.safeParse({ ...base, frameText: "x".repeat(25) }).success).toBe(false);
    expect(qrStyleSchema.safeParse({ ...base, frameText: "日本" }).success).toBe(false);
    expect(qrStyleSchema.safeParse({ ...base, frame: "starburst" }).success).toBe(false);
    expect(qrStyleSchema.safeParse({ ...base, frameText: "See our menu" }).success).toBe(true);
  });
});

describe("helpers", () => {
  it("knows the default", () => {
    expect(isDefaultQrStyle(DEFAULT_QR_STYLE)).toBe(true);
    expect(isDefaultQrStyle(pair("#000000", "#FFFFFF"))).toBe(false);
  });

  it("maps a style onto the properties QrSymbol paints with", () => {
    expect(qrStyleVars(pair("#0B3D5C", "#FFF8EC"))).toEqual({
      "--qr-ink": "#0B3D5C",
      "--qr-ground": "#FFF8EC",
      "--qr-ground-solid": "#FFF8EC",
    });
  });
});

describe("pageBrand", () => {
  it("leaves an unbranded page on the site's own colours, so dark mode still works", () => {
    expect(pageBrand(DEFAULT_QR_STYLE)).toBeNull();
  });

  it("fills buttons with the code colour", () => {
    expect(pageBrand(pair("#0B3D5C", "#FFFFFF"))?.fill).toBe("#0B3D5C");
  });

  it("puts white text on a dark brand colour", () => {
    expect(pageBrand(pair("#0B3D5C", "#FFFFFF"))?.ink).toBe("#FFFFFF");
  });

  it("puts black text on a mid-tone brand colour where black reads better", () => {
    // #767676 is about the lightest grey a code may use on white. White on it
    // is 4.54:1 and black about 4.6:1, so black narrowly wins.
    expect(pageBrand(pair("#767676", "#FFFFFF"))?.ink).toBe("#000000");
  });

  it.each(["#0B3D5C", "#7A1F1F", "#1F5E2E", "#5A2D82", "#767676", "#000000"])(
    "always leaves button text readable on %s",
    (dark) => {
      const brand = pageBrand(pair(dark, "#FFFFFF"))!;
      expect(contrastRatio(brand.fill, brand.ink)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
