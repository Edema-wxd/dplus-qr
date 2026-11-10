"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import type { Analytics, Slice } from "@/lib/user-codes";
import type { UpgradeOffer } from "@/lib/upgrade-offers";
import {
  windowLabel,
  windowShortLabel,
  type Bucket,
  type ChartPoint,
} from "@/lib/chart-buckets";
import { UpgradeDialog } from "../UpgradePrompt";

/**
 * Opens the upgrade prompt for an offer. Provided by the panel when the page
 * passed offers in; absent (null) on the admin and public views, where the
 * locked pieces fall back to a plain link or are not shown at all.
 */
const AskUpgrade = createContext<((offer: UpgradeOffer) => void) | null>(null);

/** The detailed-analytics offer, for the locked panels and lines inside a window. */
const InsightsOffer = createContext<UpgradeOffer | null>(null);

/** One date range the panel offers. */
export type ChartWindow = {
  days: number;
  /** Longer than the plan's scan history: offered as an upgrade, never drawn. */
  locked: boolean;
  /**
   * The figures, when the server computed them. Null on a locked window, and
   * on a long window the plan covers, which is fetched from `fetchBase` when
   * picked.
   */
  data: Analytics | null;
};

/**
 * Scans over time, by country, device, operating system and city.
 *
 * Daily windows are rendered on the server and switched here, rather than
 * read from `searchParams`. Under Cache Components a page that reads
 * searchParams must do it inside a Suspense child or the build fails on
 * prerender; keeping the range in client state avoids that entirely and makes
 * switching instant. Longer windows (6, 12 and 24 months) are fetched when
 * picked, so the page's live refresh does not recompute them every 30 seconds.
 *
 * What a plan does not include is shown, locked, with one line on what
 * upgrading unlocks, rather than hidden: a feature nobody can see is one
 * nobody asks for. A locked window or panel arrives here with no data at all
 * (`data: null`, `detail: null`), because the server never queried it.
 */
export function AnalyticsPanel({
  windows,
  insights,
  historyDays,
  createdAt,
  audience = "owner",
  fetchBase = null,
  exportBase = null,
  upgrade,
}: {
  windows: ChartWindow[];
  /** Whether the plan includes unique scans, OS, cities and the trend. */
  insights: boolean;
  /** The plan's scan history in days, quoted when a window is locked. */
  historyDays: number;
  /** When the code was made, for the summary strip. */
  createdAt?: string;
  /**
   * "public" is a shared stats link (`/s/{token}`): the visitor is not the
   * customer, so there is no plan talk, no upgrade links and no exports.
   */
  audience?: "owner" | "public";
  /** Where a window without data is fetched from (`/app/{id}/analytics`). */
  fetchBase?: string | null;
  /**
   * The CSV export route for this code (`/app/{id}/export`), when the plan
   * includes export. Each table then offers its own CSV.
   */
  exportBase?: string | null;
  /**
   * What each locked piece says when clicked, from the page's live plan rows:
   * the detailed analytics, and each chart window longer than the plan keeps.
   */
  upgrade?: { insights: UpgradeOffer; history: Record<number, UpgradeOffer> };
}) {
  const [active, setActive] = useState(
    windows.find((w) => w.days === 30 && !w.locked)?.days ?? windows[0].days
  );
  const [prompt, setPrompt] = useState<UpgradeOffer | null>(null);
  // Long windows, once fetched. Kept while the panel lives, and refreshed
  // each time one is picked again, so going back to it is instant and current.
  const [fetched, setFetched] = useState<Record<number, Analytics>>({});
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const current = windows.find((w) => w.days === active) ?? windows[0];
  const ask = audience === "owner" && upgrade ? (offer: UpgradeOffer) => setPrompt(offer) : null;

  const load = async (days: number) => {
    if (!fetchBase) return;
    setPending((p) => ({ ...p, [days]: true }));
    setFailed((f) => ({ ...f, [days]: false }));
    try {
      const response = await fetch(`${fetchBase}?days=${days}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(String(response.status));
      // A signed-out fetch follows the proxy to the sign-in page and gets
      // HTML with a 200, which `json()` refuses: reported as a failure.
      const data = (await response.json()) as Analytics;
      setFetched((f) => ({ ...f, [days]: data }));
    } catch {
      setFailed((f) => ({ ...f, [days]: true }));
    } finally {
      setPending((p) => ({ ...p, [days]: false }));
    }
  };

  const pick = (w: ChartWindow) => {
    // A window the plan does not keep explains itself rather than switching
    // to an empty view.
    const offer = w.locked ? upgrade?.history[w.days] : null;
    if (offer && ask) {
      ask(offer);
      return;
    }
    setActive(w.days);
    if (!w.locked && w.data === null) void load(w.days);
  };

  const data = current.data ?? fetched[current.days] ?? null;
  const label = windowLabel(current.days);

  return (
    <AskUpgrade.Provider value={ask}>
      <InsightsOffer.Provider value={upgrade?.insights ?? null}>
        <section aria-labelledby="scans-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="scans-heading" className="font-sarlotte text-2xl leading-none">
              Scans
            </h2>

            {/*
              A group of toggle buttons, not a tablist. `role="tab"` promises a
              tabpanel to point `aria-controls` at and arrow-key navigation
              between the tabs; this has neither, and announcing "tab 1 of 3" to
              someone whose arrow keys then do nothing is worse than describing
              the controls as what they are. `aria-pressed` carries the state.
              Short labels on a phone, so six ranges fit across it.
            */}
            <div
              role="group"
              aria-label="Date range"
              className="flex rounded-md border border-[var(--paper-rule)] bg-white p-0.5"
            >
              {windows.map((w) => (
                <button
                  key={w.days}
                  type="button"
                  aria-pressed={w.days === active}
                  onClick={() => pick(w)}
                  className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs transition-colors duration-150 sm:px-3 ${
                    w.days === active
                      ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                      : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
                  }`}
                >
                  {w.locked ? <LockIcon /> : null}
                  <span aria-hidden className="sm:hidden">
                    {windowShortLabel(w.days)}
                  </span>
                  <span className="sr-only sm:not-sr-only">{windowLabel(w.days)}</span>
                  {w.locked ? <span className="sr-only"> (not on your plan)</span> : null}
                </button>
              ))}
            </div>
          </div>

          {current.locked ? (
            <Locked
              className="mt-6"
              offer={upgrade?.history[current.days]}
              title={`${label} of scans`}
              line={`Your plan keeps ${windowLabel(historyDays)} of scan history. Upgrade to see the last ${label}.`}
            />
          ) : data ? (
            <div aria-busy={pending[current.days] === true}>
              <WindowView
                days={current.days}
                data={data}
                insights={insights}
                createdAt={createdAt}
                audience={audience}
                exportBase={audience === "owner" ? exportBase : null}
              />
            </div>
          ) : failed[current.days] ? (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-10 text-center text-sm text-[var(--paper-soft)]"
            >
              The last {label} could not be loaded.{" "}
              <button
                type="button"
                onClick={() => void load(current.days)}
                className="text-[var(--paper-ink)] underline underline-offset-4"
              >
                Try again
              </button>
            </p>
          ) : (
            <p
              role="status"
              className="mt-6 rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-10 text-center text-sm text-[var(--paper-soft)]"
            >
              Loading the last {label}…
            </p>
          )}
        </section>
        {prompt ? <UpgradeDialog offer={prompt} open onClose={() => setPrompt(null)} /> : null}
      </InsightsOffer.Provider>
    </AskUpgrade.Provider>
  );
}

const BUCKET_NOUN: Record<Bucket, string> = { day: "day", week: "week", month: "month" };

/** A bar's dates, for its tooltip, the axis and the screen-reader table. */
function pointLabel(point: ChartPoint, bucket: Bucket): string {
  if (bucket === "day") return point.start;
  const date = new Date(`${point.start}T00:00:00Z`);
  if (bucket === "month") {
    return date.toLocaleDateString("en-NG", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  return `Week of ${date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

function WindowView({
  days,
  data,
  insights,
  createdAt,
  audience,
  exportBase,
}: {
  days: number;
  data: Analytics;
  insights: boolean;
  createdAt?: string;
  audience: "owner" | "public";
  exportBase: string | null;
}) {
  const isPublic = audience === "public";
  const label = windowLabel(days);
  const noun = BUCKET_NOUN[data.bucket];
  const csv = (table: string) => (exportBase ? `${exportBase}?table=${table}&days=${days}` : null);
  const peak = Math.max(1, ...data.points.map((p) => p.scans));
  const detail = data.detail;
  // Unique visitors per bar only on a daily chart: the hash behind them
  // rotates daily, so a week's figure would be days added up, not people.
  const showUnique =
    data.bucket === "day" && insights && detail?.unique !== null && detail?.unique !== undefined;
  const anyPartial = data.points.some((p) => p.partial);

  return (
    <>
      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] sm:grid-cols-4">
        <Stat label={`Scans, ${label}`}>
          <span className="text-2xl leading-none text-[var(--paper-ink)]">
            {data.total.toLocaleString("en-NG")}
          </span>
          {detail ? (
            <Trend total={data.total} previous={detail.previousTotal} label={label} />
          ) : (
            isPublic ? null : <UpsellLine>Compare with the previous {label}</UpsellLine>
          )}
        </Stat>
        <Stat label="Unique scans">
          {!insights ? (
            isPublic ? (
              <span className="text-sm text-[var(--paper-soft)]">—</span>
            ) : (
              <UpsellLine>See unique scans</UpsellLine>
            )
          ) : detail?.unique === null ? (
            <span className="text-sm text-[var(--paper-soft)]">Not recorded yet</span>
          ) : (
            <span className="text-2xl leading-none text-[var(--paper-ink)]">
              {(detail?.unique ?? 0).toLocaleString("en-NG")}
            </span>
          )}
        </Stat>
        <Stat label="Today">
          <span className="text-2xl leading-none text-[var(--paper-ink)]">
            {data.today.toLocaleString("en-NG")}
          </span>
        </Stat>
        <Stat label="Created">
          <span className="text-sm text-[var(--paper-ink)]">
            {createdAt
              ? new Date(createdAt).toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </span>
        </Stat>
      </dl>

      {data.total === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-10 text-center text-sm text-[var(--paper-soft)]">
          Nothing has scanned this code yet. Link previews and bots are never
          counted, so this stays at zero until a real phone reads it.
        </p>
      ) : (
        <>
          {showUnique || anyPartial ? (
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--paper-soft)]" aria-label="Chart key">
              {showUnique ? (
                <>
                  <li className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[var(--pin-ink)] opacity-35" />
                    Scans
                  </li>
                  <li className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[var(--pin-ink)]" />
                    Unique
                  </li>
                </>
              ) : null}
              {anyPartial ? (
                <li className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[var(--pin-ink)] opacity-40" />
                  Part of a {noun}
                </li>
              ) : null}
            </ul>
          ) : null}

          {/*
            Bars, not a line: these are counts per day, week or month, and a
            line between two bars implies values that were never measured in
            between. Unique scans sit inside each day's bar: they can never
            exceed it, so one bar carries both without a second scale. A
            week or month the window only partly covers is drawn lighter, so
            a short bar reads as short on time rather than on scans.
          */}
          <div
            className={`${showUnique || anyPartial ? "mt-2" : "mt-5"} flex h-32 items-end ${
              data.points.length > 60 ? "gap-px" : "gap-[2px]"
            }`}
            aria-hidden
          >
            {data.points.map((point) => (
              <div key={point.start} className="group relative flex-1" style={{ height: "100%" }}>
                <div
                  className="absolute bottom-0 w-full rounded-[2px] bg-[var(--pin-ink)] transition-opacity duration-150"
                  style={{
                    // A bar with scans never renders as nothing: a 2px floor
                    // keeps one scan visibly different from zero.
                    height: point.scans === 0 ? "1px" : `max(2px, ${(point.scans / peak) * 100}%)`,
                    opacity:
                      point.scans === 0 ? 0.25 : showUnique ? 0.35 : point.partial ? 0.4 : 1,
                  }}
                />
                {showUnique && point.unique ? (
                  <div
                    className="absolute bottom-0 w-full rounded-[2px] bg-[var(--pin-ink)]"
                    style={{ height: `max(2px, ${(point.unique / peak) * 100}%)` }}
                  />
                ) : null}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--paper-ink)] px-2 py-1 text-xs text-[var(--paper)] group-hover:block">
                  {point.scans} {point.scans === 1 ? "scan" : "scans"}
                  {showUnique ? `, ${point.unique ?? 0} unique` : ""}
                  {data.bucket === "day" ? " on " : ", "}
                  {pointLabel(point, data.bucket)}
                  {point.partial ? (point.end === data.points.at(-1)?.end ? " so far" : ", part") : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="dash-num mt-2 flex justify-between gap-3 text-xs text-[var(--paper-soft)]">
            <span>{data.points[0] ? pointLabel(data.points[0], data.bucket) : null}</span>
            {csv("days") ? <CsvLink href={csv("days")!} label={`scans per ${noun}, ${label}`} /> : null}
            <span>{data.points.at(-1) ? pointLabel(data.points.at(-1)!, data.bucket) : null}</span>
          </div>

          {/*
            The figures themselves, for anyone the bars do not serve. The
            tooltip is hover-only -- there is no hover on a phone and no focus
            on a `div` -- so the same data is a table a screen reader can walk
            row by row. The bars are `aria-hidden` so the two are not
            announced twice. Wrapped, because a table ignores `sr-only`'s 1px
            width once its row labels are long (a week's dates) and would push
            the page wider than a phone.
          */}
          <div className="sr-only">
            <table>
              <caption>
                Scans per {noun} over the last {label}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    {data.bucket === "day" ? "Day" : data.bucket === "week" ? "Week starting" : "Month"}
                  </th>
                  <th scope="col">Scans</th>
                  {showUnique ? <th scope="col">Unique</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.points.map((point) => (
                  <tr key={point.start}>
                    <th scope="row">
                      {pointLabel(point, data.bucket)}
                      {point.partial ? ` (part ${noun}, from ${point.start} to ${point.end})` : ""}
                    </th>
                    <td>{point.scans}</td>
                    {showUnique ? <td>{point.unique ?? 0}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <Breakdown title="Country" slices={data.countries} total={data.total} format={countryLabel} csvHref={csv("countries")} />
            <Breakdown title="Device" slices={data.devices} total={data.total} format={capitalise} csvHref={csv("devices")} />
            {detail ? (
              <>
                <Breakdown title="Operating system" slices={detail.os} total={data.total} csvHref={csv("os")} />
                <Breakdown title="City" slices={detail.cities} total={data.total} csvHref={csv("cities")} />
              </>
            ) : isPublic ? null : (
              <>
                <Locked title="Operating system" line="See whether people scan with iPhone or Android." />
                <Locked title="City" line="See which cities your scans come from." />
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 bg-white px-4 py-3.5">
      <dt className="text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">{label}</dt>
      <dd className="dash-num flex flex-col gap-1">{children}</dd>
    </div>
  );
}

/**
 * Up or down against the window of the same length just before this one.
 * Text and an arrow, in the page's ink, never colour alone: a fall in scans
 * is information, not an alarm.
 */
function Trend({ total, previous, label }: { total: number; previous: number; label: string }) {
  if (previous === 0) {
    return (
      <span className="text-xs text-[var(--paper-soft)]">
        {total > 0 ? `No scans in the ${label} before` : `None in the ${label} before either`}
      </span>
    );
  }
  const change = Math.round(((total - previous) / previous) * 100);
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  return (
    <span className="text-xs text-[var(--paper-soft)]">
      <span aria-hidden>{arrow} </span>
      {change === 0
        ? `Same as the ${label} before`
        : `${Math.abs(change)}% ${change > 0 ? "up" : "down"} on the ${label} before`}
    </span>
  );
}

/**
 * A one-line way in to the detailed analytics. With the upgrade prompt on
 * hand it opens it; otherwise it is a plain link to plans.
 */
function UpsellLine({ children }: { children: React.ReactNode }) {
  const ask = useContext(AskUpgrade);
  const insights = useContext(InsightsOffer);
  const className =
    "inline-flex items-center gap-1 text-left text-xs text-[var(--paper-soft)] underline underline-offset-4 hover:text-[var(--paper-ink)]";
  if (ask && insights) {
    return (
      <button type="button" onClick={() => ask(insights)} aria-haspopup="dialog" className={className}>
        <LockIcon />
        {children}
      </button>
    );
  }
  return (
    <Link href="/billing" className={className}>
      {children}
    </Link>
  );
}

/**
 * A feature the plan does not include: what it is, and where to get it. The
 * whole card is the way in, so a click anywhere on it explains rather than
 * landing on nothing.
 */
function Locked({
  title,
  line,
  offer,
  className = "",
}: {
  title: string;
  line: string;
  /** Defaults to the detailed-analytics offer. */
  offer?: UpgradeOffer;
  className?: string;
}) {
  const ask = useContext(AskUpgrade);
  const insights = useContext(InsightsOffer);
  const chosen = offer ?? insights;
  const unlock = chosen?.unlock ? ` Included from ${chosen.unlock.name}.` : "";
  const card =
    "mt-3 block w-full rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-4 py-5 text-left text-sm leading-relaxed text-[var(--paper-soft)]";
  return (
    <div className={className}>
      <h3 className="flex items-center gap-1.5 border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">
        <LockIcon />
        {title}
      </h3>
      {ask && chosen ? (
        <button
          type="button"
          onClick={() => ask(chosen)}
          aria-haspopup="dialog"
          className={`${card} transition-colors duration-150 hover:border-[var(--paper-ink)]`}
        >
          <span className="block">
            {line}
            {unlock}
          </span>
          <span className="mt-2 inline-block text-[var(--paper-ink)] underline underline-offset-4">
            What this adds
          </span>
        </button>
      ) : (
        <div className={card}>
          <p>{line}</p>
          <Link href="/billing" className="mt-2 inline-block text-[var(--paper-ink)] underline underline-offset-4">
            See plans
          </Link>
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/** `NG` becomes a flag and "Nigeria"; anything unrecognised is shown as given. */
function countryLabel(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  const flag = String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  let name = code;
  try {
    name = regionNames?.of(code) ?? code;
  } catch {
    name = code;
  }
  return `${flag} ${name}`;
}

function capitalise(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** A small download link for one table's figures. */
function CsvLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="normal-case tracking-normal text-[var(--paper-soft)] underline underline-offset-4 hover:text-[var(--paper-ink)]"
    >
      CSV<span className="sr-only">: {label}</span>
    </a>
  );
}

function Breakdown({
  title,
  slices,
  total,
  format = (label: string) => label,
  csvHref = null,
}: {
  title: string;
  slices: Slice[];
  /** Every scan in the window, so a share is of all scans, not the top ten. */
  total: number;
  format?: (label: string) => string;
  /** This table as CSV, when the plan includes export. */
  csvHref?: string | null;
}) {
  const denominator = total || 1;

  return (
    <div>
      <h3 className="flex items-baseline justify-between border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">
        {title}
        {csvHref ? <CsvLink href={csvHref} label={title} /> : null}
      </h3>
      {slices.length === 0 ? (
        <p className="py-3 text-sm text-[var(--paper-soft)]">No data yet.</p>
      ) : (
        <dl>
          {slices.map((slice) => {
            const share = slice.scans / denominator;
            return (
              <div
                key={slice.label}
                className="flex items-center gap-3 border-b border-[var(--paper-rule)] py-2.5 last:border-b-0"
              >
                <dt className="w-36 shrink-0 truncate text-sm">{format(slice.label)}</dt>
                <dd className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    aria-hidden
                    className="h-1.5 rounded-full bg-[var(--pin-ink)]"
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                  <span className="dash-num ml-auto shrink-0 text-sm text-[var(--paper-soft)]">
                    {slice.scans.toLocaleString("en-NG")}
                    <span className="ml-2 inline-block w-10 text-right">{Math.round(share * 100)}%</span>
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
