import { attachUses, fileKind, formatBytes } from "@/lib/files";

/**
 * The Files page pairs each upload with the codes that show it, by the same
 * `fileId` reference every save is checked against. If this drifts, a file
 * reads as unused while a printed code still shows it.
 */

const file = (id: string) => ({
  id,
  url: `https://fmctfyekk3.ufs.sh/f/${id}`,
  name: `${id}.pdf`,
  mime: "application/pdf",
  sizeBytes: 1000,
  uploadedAt: new Date("2026-11-01T00:00:00Z"),
});

const ref = (fileId: string) => ({ fileId, url: "x", name: "x", mime: "application/pdf" });

describe("attachUses", () => {
  it("finds a file wherever a page keeps it", () => {
    const [pdf, cover, track] = attachUses(
      [file("1"), file("2"), file("3")],
      [
        { id: "10", name: "Menu", shortCode: "Menu123", kind: "pdf", content: { title: "Menu", file: ref("1") } },
        {
          id: "11",
          name: "Album",
          shortCode: "Album12",
          kind: "playlist",
          content: { cover: ref("2"), tracks: [{ title: "One", file: ref("3") }] },
        },
      ]
    );
    expect(pdf.usedBy.map((c) => c.codeId)).toEqual(["10"]);
    expect(cover.usedBy.map((c) => c.codeId)).toEqual(["11"]);
    expect(track.usedBy.map((c) => c.codeId)).toEqual(["11"]);
  });

  it("lists every code that shows the same file", () => {
    const [shared] = attachUses(
      [file("1")],
      [
        { id: "10", name: "Front door", shortCode: "Door123", kind: "pdf", content: { file: ref("1") } },
        { id: "11", name: "Table card", shortCode: "Tabl123", kind: "pdf", content: { file: ref("1") } },
      ]
    );
    expect(shared.usedBy.map((c) => c.name)).toEqual(["Front door", "Table card"]);
  });

  it("reads a file no code refers to as unused", () => {
    const [orphan] = attachUses([file("9")], [
      { id: "10", name: "Menu", shortCode: "Menu123", kind: "pdf", content: { file: ref("1") } },
      { id: "12", name: "Site", shortCode: "Site123", kind: "url", content: null },
    ]);
    expect(orphan.usedBy).toEqual([]);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [900, "900 B"],
    [840 * 1024, "840 KB"],
    [3.24 * 1024 * 1024, "3.2 MB"],
    [16 * 1024 * 1024, "16 MB"],
  ])("%d bytes reads as %s", (bytes, label) => {
    expect(formatBytes(bytes)).toBe(label);
  });

  it("says nothing for a nonsense size", () => {
    expect(formatBytes(Number.NaN)).toBe("");
    expect(formatBytes(-1)).toBe("");
  });
});

describe("fileKind", () => {
  it.each([
    ["application/pdf", "PDF"],
    ["image/webp", "Image"],
    ["video/mp4", "Video"],
    ["audio/mpeg", "Audio"],
    ["application/zip", "File"],
  ])("%s is %s", (mime, kind) => {
    expect(fileKind(mime)).toBe(kind);
  });
});
