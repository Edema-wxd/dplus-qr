import {
  fromPickedContact,
  looksLikeVCard,
  parseVCard,
  splitName,
  toProfileFields,
} from "@/lib/vcard-import";
import { parsePageContent } from "@/lib/page-content";
import { buildStaticPayload } from "@/lib/static-payload";

// Shaped like an iPhone "Share Contact": grouped properties, folded lines.
const APPLE = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//Apple Inc.//iPhone OS 18.0//EN",
  "N:Obi;Ada;Nneka;;",
  "FN:Ada Nneka Obi",
  "ORG:Obi & Sons;",
  "TITLE:Founder",
  "item1.EMAIL;type=INTERNET;type=pref:ada@obi.ng",
  "TEL;type=WORK;type=VOICE:+234 1 234 5678",
  "TEL;type=CELL;type=VOICE;type=pref:+234 801 234 5678",
  "item2.ADR;type=HOME;type=pref:;;12 Allen Avenue;Ikeja;Lagos;100271;Nigeria",
  "item3.URL;type=pref:https://obi.ng",
  "NOTE:Met at the trade fair\\, 2026. A very long note that wraps",
  "  onto a second line.",
  "END:VCARD",
].join("\r\n");

describe("parseVCard", () => {
  it("reads an iPhone contact card", () => {
    expect(parseVCard(APPLE)).toEqual({
      firstName: "Ada",
      lastName: "Obi",
      organisation: "Obi & Sons",
      title: "Founder",
      mobile: "+234 801 234 5678",
      phone: "+234 1 234 5678",
      email: "ada@obi.ng",
      website: "https://obi.ng",
      street: "12 Allen Avenue",
      city: "Ikeja",
      region: "Lagos",
      postcode: "100271",
      country: "Nigeria",
    });
  });

  it("unescapes and unfolds values", () => {
    const card = parseVCard(
      "BEGIN:VCARD\nVERSION:4.0\nFN:Bola\nORG:Bola\\, Tunde \\; Co\nTITLE:Head of\n  Design\nEND:VCARD"
    );
    expect(card.organisation).toBe("Bola, Tunde ; Co");
    expect(card.title).toBe("Head of Design");
  });

  it("falls back to FN when there is no N, and reads tel: URIs", () => {
    const card = parseVCard(
      "BEGIN:VCARD\nVERSION:4.0\nFN:Ada Nneka Obi\nTEL;VALUE=uri;TYPE=cell:tel:+2348012345678\nEND:VCARD"
    );
    expect(card.firstName).toBe("Ada Nneka");
    expect(card.lastName).toBe("Obi");
    expect(card.mobile).toBe("+2348012345678");
  });

  it("decodes vCard 2.1 quoted-printable names from older phones", () => {
    const card = parseVCard(
      "BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ad=C3=A9;Chi=\nnedu;;;\nEND:VCARD"
    );
    expect(card.lastName).toBe("Adé");
    expect(card.firstName).toBe("Chinedu");
  });

  it("uses only the first card of several", () => {
    const two = "BEGIN:VCARD\nFN:First One\nEND:VCARD\nBEGIN:VCARD\nFN:Second Two\nEND:VCARD";
    expect(parseVCard(two).firstName).toBe("First");
  });

  it("produces fields the vCard code accepts", () => {
    const result = buildStaticPayload("vcard", parseVCard(APPLE));
    expect(result.ok).toBe(true);
    expect(result.ok && result.content).toContain("TEL;TYPE=CELL:+2348012345678");
  });

  it("recognises a card file", () => {
    expect(looksLikeVCard(APPLE)).toBe(true);
    expect(looksLikeVCard("hello")).toBe(false);
  });
});

describe("contact picker results", () => {
  it("maps the Contact Picker API's shape", () => {
    expect(
      fromPickedContact({
        name: ["Ada Obi"],
        email: ["ada@obi.ng"],
        tel: ["+2348012345678", "+23412345678"],
        address: [{ addressLine: ["12 Allen Avenue"], city: "Ikeja", country: "NG" }],
      })
    ).toMatchObject({
      firstName: "Ada",
      lastName: "Obi",
      email: "ada@obi.ng",
      mobile: "+2348012345678",
      phone: "+23412345678",
      street: "12 Allen Avenue",
      city: "Ikeja",
      country: "NG",
    });
  });

  it("treats a single word as a first name", () => {
    expect(splitName("Tunde")).toEqual({ firstName: "Tunde", lastName: "" });
  });
});

describe("toProfileFields", () => {
  it("fits a contact into a valid Profile Card", () => {
    const profile = toProfileFields(parseVCard(APPLE));
    expect(profile).toEqual({
      name: "Ada Obi",
      title: "Founder",
      company: "Obi & Sons",
      mobile: "+234 801 234 5678",
      email: "ada@obi.ng",
      website: "https://obi.ng",
      address: "12 Allen Avenue, Ikeja, Lagos, 100271, Nigeria",
    });
    expect(parsePageContent("profile", { ...profile, links: [] }).ok).toBe(true);
  });

  it("names a company-only contact after the company", () => {
    const contact = parseVCard("BEGIN:VCARD\nVERSION:3.0\nORG:Obi & Sons\nEND:VCARD");
    expect(toProfileFields(contact).name).toBe("Obi & Sons");
  });
});
