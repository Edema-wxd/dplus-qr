/**
 * Read a contact into the vCard form's fields, from either source a browser
 * can offer:
 *
 *   - the Contact Picker API (`navigator.contacts.select`), which opens the
 *     phone's own contact book. Chrome on Android only, as of 2026: Safari
 *     and desktop browsers do not ship it.
 *   - a `.vcf` file, which every contacts app can export or share, so it is
 *     the path that works everywhere else.
 *
 * Either way the result only fills the form. Nothing is uploaded: a static
 * code is built in the browser, and so is this.
 */

export type ContactFields = {
  firstName: string;
  lastName: string;
  organisation: string;
  title: string;
  mobile: string;
  phone: string;
  email: string;
  website: string;
  street: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
};

export function emptyContact(): ContactFields {
  return {
    firstName: "",
    lastName: "",
    organisation: "",
    title: "",
    mobile: "",
    phone: "",
    email: "",
    website: "",
    street: "",
    city: "",
    region: "",
    postcode: "",
    country: "",
  };
}

/** RFC 6350 text unescaping: `\n`, `\,`, `\;` and `\\`. */
function unescape(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** Split on separators that are not escaped. */
function splitUnescaped(value: string, separator: ";" | ","): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && i + 1 < value.length) {
      current += c + value[i + 1];
      i++;
    } else if (c === separator) {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts.map(unescape);
}

/** Decode a QUOTED-PRINTABLE value, as vCard 2.1 exports from older phones use. */
function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(value.charCodeAt(i));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

type Line = { name: string; params: string; value: string };

/**
 * Unfold and split the first card in a file. A continuation line starts with
 * a space or tab (RFC 6350); a vCard 2.1 quoted-printable value continues
 * after a trailing `=` instead.
 */
function cardLines(text: string): Line[] {
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    const last = lines.length - 1;
    if (last >= 0 && /^[ \t]/.test(line)) {
      lines[last] += line.slice(1);
    } else if (last >= 0 && /QUOTED-PRINTABLE/i.test(lines[last]!) && lines[last]!.endsWith("=")) {
      lines[last] = lines[last]!.slice(0, -1) + line;
    } else {
      lines.push(line);
    }
  }

  const begin = lines.findIndex((l) => /^BEGIN:VCARD$/i.test(l.trim()));
  if (begin === -1) return [];
  const out: Line[] = [];
  for (const line of lines.slice(begin + 1)) {
    if (/^END:VCARD$/i.test(line.trim())) break;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const head = line.slice(0, colon);
    // `item1.TEL` -- Apple groups a property with its label.
    const [nameWithGroup, ...params] = head.split(";");
    const name = nameWithGroup!.replace(/^[^.]*\./, "").toUpperCase();
    let value = line.slice(colon + 1);
    const paramText = params.join(";");
    if (/ENCODING=QUOTED-PRINTABLE|^QUOTED-PRINTABLE$/i.test(paramText)) {
      value = decodeQuotedPrintable(value);
    }
    out.push({ name, params: paramText.toUpperCase(), value });
  }
  return out;
}

/** True when the text holds at least one vCard. */
export function looksLikeVCard(text: string): boolean {
  return /BEGIN:VCARD/i.test(text);
}

/**
 * The first contact in a `.vcf` file, as form fields. Fields the file does
 * not have come back empty, so applying the result replaces the form rather
 * than mixing two people.
 */
export function parseVCard(text: string): ContactFields {
  const fields = emptyContact();
  let fullName = "";
  const phones: { value: string; params: string }[] = [];

  for (const { name, params, value } of cardLines(text)) {
    switch (name) {
      case "N": {
        const [last = "", first = ""] = splitUnescaped(value, ";");
        fields.lastName ||= last.trim();
        fields.firstName ||= first.trim();
        break;
      }
      case "FN":
        fullName ||= unescape(value).trim();
        break;
      case "ORG":
        fields.organisation ||= splitUnescaped(value, ";")[0]!.trim();
        break;
      case "TITLE":
        fields.title ||= unescape(value).trim();
        break;
      case "TEL":
        phones.push({ value: value.replace(/^tel:/i, "").trim(), params });
        break;
      case "EMAIL":
        fields.email ||= value.replace(/^mailto:/i, "").trim();
        break;
      case "URL":
        fields.website ||= unescape(value).trim();
        break;
      case "ADR": {
        if (fields.street || fields.city) break;
        // PO box; extended; street; locality; region; postcode; country
        const [, extended = "", street = "", city = "", region = "", postcode = "", country = ""] =
          splitUnescaped(value, ";");
        fields.street = [street, extended].map((s) => s.trim()).filter(Boolean).join(", ");
        fields.city = city.trim();
        fields.region = region.trim();
        fields.postcode = postcode.trim();
        fields.country = country.trim();
        break;
      }
    }
  }

  if (!fields.firstName && !fields.lastName && fullName) {
    Object.assign(fields, splitName(fullName));
  }

  // A mobile is the number people want on a card; the first other number
  // fills the work field.
  const mobile = phones.find((p) => /CELL|MOBILE|IPHONE/.test(p.params));
  fields.mobile = (mobile ?? phones[0])?.value ?? "";
  fields.phone = phones.find((p) => p !== (mobile ?? phones[0]))?.value ?? "";
  return fields;
}

/** "Ada Nneka Obi" as first "Ada Nneka", last "Obi". A single word is a first name. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return { firstName: words[0] ?? "", lastName: "" };
  return { firstName: words.slice(0, -1).join(" "), lastName: words.at(-1)! };
}

/** What the Contact Picker API returns for one contact. */
export type PickedContact = {
  name?: string[];
  email?: string[];
  tel?: string[];
  address?: {
    addressLine?: string[];
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  }[];
};

export function fromPickedContact(contact: PickedContact): ContactFields {
  const fields = emptyContact();
  Object.assign(fields, splitName(contact.name?.[0] ?? ""));
  fields.email = contact.email?.[0] ?? "";
  fields.mobile = contact.tel?.[0] ?? "";
  fields.phone = contact.tel?.[1] ?? "";
  const address = contact.address?.[0];
  if (address) {
    fields.street = (address.addressLine ?? []).join(", ");
    fields.city = address.city ?? "";
    fields.region = address.region ?? "";
    fields.postcode = address.postalCode ?? "";
    fields.country = address.country ?? "";
  }
  return fields;
}

/**
 * A contact as the Profile Card's fields. The card has one address box and
 * one phone, so the parts are joined and the mobile wins over a work number.
 * Every contact field is returned, empty or not, so an import replaces the
 * previous person; the photo, bio and links are left alone because no
 * contact card carries them in a form the page can use.
 */
export function toProfileFields(contact: ContactFields) {
  const join = (parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(", ");
  return {
    name:
      [contact.firstName, contact.lastName].map((p) => p.trim()).filter(Boolean).join(" ") ||
      contact.organisation,
    title: contact.title,
    company: contact.organisation,
    mobile: contact.mobile || contact.phone,
    email: contact.email,
    website: contact.website,
    address: join([contact.street, contact.city, contact.region, contact.postcode, contact.country]),
  };
}
