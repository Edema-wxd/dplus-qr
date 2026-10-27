import { frameLayout, inkOn, textOutline } from "@/lib/frames";
import { QR_FRAMES } from "@/lib/qr-style";
import { parseLogoChoice, readPresetLogo, PRESET_LOGOS, isPresetLogo } from "@/lib/preset-logos";

/** Every x coordinate in a path built only of absolute M/L/Q/C commands. */
function xs(d: string): number[] {
  const numbers = (d.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  return numbers.filter((_, i) => i % 2 === 0);
}

describe("textOutline", () => {
  it("never runs two numbers together, which would draw stray lines", () => {
    // In the font data a minus sign doubles as a separator ("370-33"). Once
    // placed, both numbers can be positive and must still be apart.
    const d = textOutline("Scan me! ₦500", 20, 20, 3, 100);
    expect(d).not.toMatch(/\d\.\d+\.\d/);
  });

  it("centres the text on the point given", () => {
    const x = xs(textOutline("SCAN", 50, 10, 4, 100));
    const middle = (Math.min(...x) + Math.max(...x)) / 2;
    expect(middle).toBeGreaterThan(48);
    expect(middle).toBeLessThan(52);
  });

  it("shrinks long text to fit the width it has", () => {
    const x = xs(textOutline("Scan here for our full menu", 50, 10, 6, 40));
    expect(Math.max(...x) - Math.min(...x)).toBeLessThanOrEqual(40.5);
  });
});

describe("frameLayout", () => {
  it.each(QR_FRAMES)("%s leaves the symbol whole and inside the canvas", (frame) => {
    const layout = frameLayout(frame, 37, "Scan me!", "#1A4F8A", "#FFFFFF", "#FFFFFF");
    expect(layout.qr.x).toBeGreaterThanOrEqual(0);
    expect(layout.qr.y).toBeGreaterThanOrEqual(0);
    expect(layout.qr.x + 37).toBeLessThanOrEqual(layout.width + 1e-9);
    expect(layout.qr.y + 37).toBeLessThanOrEqual(layout.height + 1e-9);
  });

  it("is just the symbol with no frame", () => {
    expect(frameLayout("none", 37, "x", "#000000", "#FFFFFF", "#FFFFFF")).toEqual({
      width: 37,
      height: 37,
      qr: { x: 0, y: 0 },
      back: [],
      front: [],
    });
  });

  it("paints the quiet zone light inside a filled tag, even when transparent", () => {
    const layout = frameLayout("tag", 37, "x", "#1A4F8A", null, "#FFF8EC");
    expect(layout.back.some((layer) => layer.fill === "#FFF8EC")).toBe(true);
  });
});

describe("inkOn", () => {
  it("puts white on dark and black on light", () => {
    expect(inkOn("#1A4F8A")).toBe("#FFFFFF");
    expect(inkOn("#F5C518")).toBe("#000000");
  });
});

describe("logo choices", () => {
  it("reads none, an upload and a preset", () => {
    expect(parseLogoChoice("")).toEqual({ kind: "none" });
    expect(parseLogoChoice("42")).toEqual({ kind: "upload", id: "42" });
    expect(parseLogoChoice("preset:instagram")).toEqual({ kind: "preset", id: "instagram" });
  });

  it.each(["preset:myspace", "preset:", "0", "-1", "abc", "42 "])("refuses %p", (raw) => {
    expect(parseLogoChoice(raw)).toBeNull();
  });

  it("does not take inherited object keys for presets", () => {
    expect(isPresetLogo("toString")).toBe(false);
    expect(parseLogoChoice("preset:constructor")).toBeNull();
  });

  it("reads a stored preset and ignores anything else", () => {
    expect(readPresetLogo({ presetLogo: "netflix" })).toBe("netflix");
    expect(readPresetLogo({ presetLogo: "nope" })).toBeNull();
    expect(readPresetLogo({})).toBeNull();
    expect(readPresetLogo(null)).toBeNull();
  });

  it("offers the twelve marks", () => {
    expect(PRESET_LOGOS).toHaveLength(12);
  });
});
