/**
 * The scan chart's date ranges and how each one is drawn.
 *
 * Pure, with no imports, so the code page's client panel can use the labels
 * and the bucketing is tested without a database.
 *
 * Short ranges are drawn a bar per day. Longer ones would be hundreds of
 * hairline bars, so they are summed into weeks (6 and 12 months) or months
 * (24 months). Which ranges a customer may pick is the plan's `history_days`
 * (`chartWindows` in `entitlement.ts`), not a separate flag: the length of
 * history a plan keeps and the length of chart it shows are one promise.
 */

/** The only windows the analytics queries will accept, in days. */
export const ANALYTICS_WINDOWS = [7, 30, 90, 180, 365, 730] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

/**
 * The longest window drawn a bar per day, and the longest the code page
 * computes on the server. Anything longer is fetched when picked, so the
 * page's 30-second live refresh never re-runs a two-year query.
 */
export const LONGEST_DAILY_WINDOW = 90;

/**
 * Clamp a requested range to a known window.
 *
 * This is a security boundary, not a convenience. Postgres will not take a
 * bound parameter inside an `interval` literal, so the number that comes out
 * of here is interpolated into SQL, which is safe only because nothing but a
 * member of `ANALYTICS_WINDOWS` can ever come out. Anything else, including
 * `NaN` from a malformed query string, collapses to 30.
 */
export function analyticsWindow(days: number): AnalyticsWindow {
  return isAnalyticsWindow(days) ? days : 30;
}

export function isAnalyticsWindow(days: number): days is AnalyticsWindow {
  return (ANALYTICS_WINDOWS as readonly number[]).includes(days);
}

export type Bucket = "day" | "week" | "month";

/** How a window is drawn. Weeks start on Monday, as `date_trunc` does. */
export function bucketFor(window: number): Bucket {
  if (window <= LONGEST_DAILY_WINDOW) return "day";
  if (window <= 365) return "week";
  return "month";
}

/**
 * "90 days", "6 months", "12 months", "24 months". Also the pricing table's
 * label for a plan's history (`historyLabel`), so the chart and the price
 * table name a length the same way. Never rounds down to a shorter promise:
 * 200 days stays "200 days", not "6 months".
 */
export function windowLabel(days: number): string {
  if (days >= 730) return "24 months";
  if (days >= 365) return "12 months";
  if (days === 180) return "6 months";
  return `${days} days`;
}

/** The same, short enough for six buttons across a phone. */
export function windowShortLabel(days: number): string {
  if (days >= 180) return `${Math.round(days / 30.4)}m`;
  return `${days}d`;
}

/** One day's figures, as the daily query returns them. */
export type DayFigures = { day: string; scans: number; unique: number };

/**
 * One bar.
 *
 * `start` and `end` are the first and last days it counts, `YYYY-MM-DD`, UTC.
 * They are the same day for a daily bar.
 *
 * `unique` is distinct visitors that day, from the daily-rotating IP hash.
 * Null for a week or a month: the hash changes every day, so the same phone
 * on Monday and Tuesday is two visitors, and adding the days up would claim
 * a weekly figure the data cannot give.
 *
 * `partial` marks a week or month the window does not cover in full: the one
 * still under way, or the first, when the window starts partway through it
 * while the code already existed. It is drawn lighter so a short bar reads as
 * short on time, not on scans.
 */
export type ChartPoint = {
  start: string;
  end: string;
  scans: number;
  unique: number | null;
  partial: boolean;
};

const DAY_MS = 86_400_000;

function toTime(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function toDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** First and last day of the week or month holding `day`. */
function period(day: string, bucket: "week" | "month"): { first: string; last: string } {
  const time = toTime(day);
  const date = new Date(time);
  if (bucket === "week") {
    const sinceMonday = (date.getUTCDay() + 6) % 7;
    const first = time - sinceMonday * DAY_MS;
    return { first: toDay(first), last: toDay(first + 6 * DAY_MS) };
  }
  const first = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const last = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
  return { first: toDay(first), last: toDay(last) };
}

/**
 * A window's daily figures as bars.
 *
 * `days` is every day of the window in order, gaps filled with zeros, as the
 * daily query returns it. `createdDay` is the code's creation day (UTC): a
 * long window starts there when the code is younger than the window, so a
 * code made in October does not open on fifty empty weeks. Daily windows
 * keep every day, as they always have.
 */
export function toBuckets(days: DayFigures[], bucket: Bucket, createdDay?: string): ChartPoint[] {
  if (bucket === "day") {
    return days.map((d) => ({ start: d.day, end: d.day, scans: d.scans, unique: d.unique, partial: false }));
  }
  if (days.length === 0) return [];

  const windowFirst = days[0].day;
  const windowLast = days[days.length - 1].day;
  // ISO dates compare correctly as strings.
  const kept = createdDay && createdDay > windowFirst ? days.filter((d) => d.day >= createdDay) : days;

  const points: ChartPoint[] = [];
  let open: { point: ChartPoint; key: string } | null = null;
  for (const d of kept) {
    const { first, last } = period(d.day, bucket);
    if (open === null || open.key !== first) {
      // Days the window leaves out at the front, but only those the code
      // existed for: a week cut short by the code's own creation is whole.
      const existedFrom = createdDay && createdDay > first ? createdDay : first;
      const point: ChartPoint = {
        start: d.day,
        end: d.day,
        scans: 0,
        unique: null,
        partial: existedFrom < windowFirst || last > windowLast,
      };
      points.push(point);
      open = { point, key: first };
    }
    open.point.end = d.day;
    open.point.scans += d.scans;
  }
  return points;
}
