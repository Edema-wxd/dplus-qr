/**
 * Dates on the blog, always in Lagos time: a post published at 00:30 WAT
 * was published on that day, not the evening before in UTC.
 */
const ZONE = "Africa/Lagos";

const long = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: ZONE });
const dayMonth = new Intl.DateTimeFormat("en-NG", { day: "2-digit", month: "short", timeZone: ZONE });
const yearOnly = new Intl.DateTimeFormat("en-NG", { year: "numeric", timeZone: ZONE });

/** "10 November 2026" */
export function longDate(iso: string): string {
  return long.format(new Date(iso));
}

/** "10 NOV", for the board's flaps. */
export function boardDate(iso: string): string {
  const parts = dayMonth.formatToParts(new Date(iso));
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${day} ${month.slice(0, 3)}`.toUpperCase();
}

/** The year, when it is not this one, so an old post is never mistaken for a new one. */
export function otherYear(iso: string, now: Date = new Date()): string | null {
  const year = yearOnly.format(new Date(iso));
  return year === yearOnly.format(now) ? null : year;
}
