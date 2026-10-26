/**
 * Small pure helpers for hosted page types: GS1 check digits, calendar files,
 * video embeds. No I/O, so the editor, the public page and the tests share
 * one implementation.
 */

/**
 * GS1 mod-10 check digit, over every digit but the last. Weights alternate
 * 3, 1, 3... starting from the digit nearest the check digit, which is what
 * lets GTIN-8, 12, 13 and 14 share one routine.
 */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(value: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return false;
  return gs1CheckDigit(value.slice(0, -1)) === Number(value.at(-1));
}

/** GTIN-14, the form GS1 application identifier (01) carries. */
export function gtin14(value: string): string {
  return value.padStart(14, "0");
}

/** `2027-03-31` as GS1's YYMMDD, for application identifier (17). */
export function gs1Date(isoDate: string): string {
  return isoDate.slice(2).replace(/-/g, "");
}

/**
 * The human-readable GS1 element string: `(01)…(10)…(17)…(21)…`. Printed on
 * the page under the product so a stock-taker can read what a barcode
 * scanner would.
 */
export function gs1ElementString(input: {
  gtin: string;
  batch?: string;
  expiry?: string;
  serial?: string;
}): string {
  let out = `(01)${gtin14(input.gtin)}`;
  if (input.batch) out += `(10)${input.batch}`;
  if (input.expiry) out += `(17)${gs1Date(input.expiry)}`;
  if (input.serial) out += `(21)${input.serial}`;
  return out;
}

/** UTC offsets offered for events. West Africa first; no DST to model. */
export const EVENT_OFFSETS = [
  "+01:00",
  "+00:00",
  "+02:00",
  "+03:00",
  "-05:00",
  "-04:00",
  "+04:00",
] as const;

/** A `datetime-local` value plus an offset, as an instant. */
export function eventInstant(local: string, offset: string): Date {
  return new Date(`${local}:00${offset}`);
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/**
 * An iCalendar file with one event, in UTC so no VTIMEZONE block is needed.
 * An event with no end is given one hour, which is what calendar apps assume
 * anyway and some refuse an event without one.
 */
export function buildIcs(input: {
  uid: string;
  title: string;
  start: Date;
  end?: Date | null;
  location?: string;
  description?: string;
  url?: string;
}): string {
  const end = input.end ?? new Date(input.start.getTime() + 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//QRiate+//Event//EN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(input.start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${escapeIcs(input.title)}`,
  ];
  if (input.location) lines.push(`LOCATION:${escapeIcs(input.location)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeIcs(input.description)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * An embeddable player URL for YouTube or Vimeo, or null for anything else,
 * which the page then shows as a plain "Watch" link instead.
 */
export function videoEmbedUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");

  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  if (host === "youtube.com") {
    id =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ??
      null;
  }
  if (id && /^[\w-]{6,20}$/.test(id)) {
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }

  if (host === "vimeo.com") {
    const vimeo = url.pathname.match(/^\/(\d{4,12})/)?.[1];
    if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;
  }
  return null;
}
