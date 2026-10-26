/**
 * vCard 3.0, the version every phone camera still reads.
 *
 * Shared by the static vCard code, which puts the card in the pattern, and the
 * hosted profile page, which offers it as a download. Pure, so both the
 * browser and the tests can build one.
 */

export type VCardInput = {
  firstName?: string;
  lastName?: string;
  /** Used whole when no first or last name is given. */
  fullName?: string;
  organisation?: string;
  title?: string;
  mobile?: string;
  phone?: string;
  email?: string;
  website?: string;
  street?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
  note?: string;
};

/** RFC 2426 text escaping: backslash first, so it does not double-escape. */
export function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

export function buildVCard(input: VCardInput): string {
  const v = (key: keyof VCardInput) => escapeVCard((input[key] ?? "").trim());
  const first = v("firstName");
  const last = v("lastName");
  const full =
    [first, last].filter(Boolean).join(" ") || v("fullName") || v("organisation");

  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${last};${first};;;`, `FN:${full}`];
  if (v("organisation")) lines.push(`ORG:${v("organisation")}`);
  if (v("title")) lines.push(`TITLE:${v("title")}`);
  if (v("mobile")) lines.push(`TEL;TYPE=CELL:${v("mobile")}`);
  if (v("phone")) lines.push(`TEL;TYPE=WORK:${v("phone")}`);
  if (v("email")) lines.push(`EMAIL:${v("email")}`);
  if (v("website")) lines.push(`URL:${v("website")}`);
  const address = [v("street"), v("city"), v("region"), v("postcode"), v("country")];
  if (address.some(Boolean)) lines.push(`ADR;TYPE=WORK:;;${address.join(";")}`);
  if (v("note")) lines.push(`NOTE:${v("note")}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
