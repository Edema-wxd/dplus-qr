"use client";

import Link from "next/link";
import { useState } from "react";
import type { Analytics, Slice } from "@/lib/user-codes";

/**
 * Scans over time, by country, device, operating system and city.
 *
 * All windows are rendered on the server and switched here, rather than read
 * from `searchParams`. Under Cache Components a page that reads searchParams
 * must do it inside a Suspense child or the build fails on prerender; keeping
 * the range in client state avoids that entirely and makes switching instant.
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
  exportBase = null,
}: {
  /** `data` is null for a window longer than the plan's scan history. */
  windows: { days: number; data: Analytics | null }[];
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
  /**
   * The CSV export route for this code (`/app/{id}/export`), when the plan
   * includes export. Each table then offers its own CSV.
   */
  exportBase?: string | null;
}) {
  const [active, setActive] = useState(windows[1]?.days ?? windows[0].days);
  const current = windows.find((w) => w.days === active) ?? windows[0];

  return (
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
              onClick={() => setActive(w.days)}
              className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs transition-colors duration-150 ${
                w.days === active
                  ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                  : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
              }`}
            >
              {w.data ? null : <LockIcon />}
              {w.days} days
              {w.data ? null : <span className="sr-only"> (not on your plan)</span>}
            </button>
          ))}
        </div>
      </div>

      {current.data === null ? (
        <Locked
          className="mt-6"
          title={`${current.days} days of scans`}
          line={`Your plan keeps ${historyDays} days of scan history. Upgrade to see the last ${current.days} days.`}
        />
      ) : (
        <WindowView
          days={current.days}
          data={current.data}
          insights={insights}
          createdAt={createdAt}
          audience={audience}
          exportBase={audience === "owner" ? exportBase : null}
        />
      )}
    </section>
  );
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
  const csv = (table: string) => (exportBase ? `${exportBase}?table=${table}&days=${days}` : null);
  const peak = Math.max(1, ...data.days.map((d) => d.scans));
  const today = data.days.at(-1)?.scans ?? 0;
  const detail = data.detail;
  const showUnique = insights && detail?.unique !== null && detail?.unique !== undefined;

  return (
    <>
      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] sm:grid-cols-4">
        <Stat label={`Scans, ${days} days`}>
          <span className="text-2xl leading-none text-[var(--paper-ink)]">
            {data.total.toLocaleString("en-NG")}
          </span>
          {detail ? (
            <Trend total={data.total} previous={detail.previousTotal} days={days} />
          ) : (
            isPublic ? null : <UpsellLine>Trend vs the previous {days} days on Starter</UpsellLine>
          )}
        </Stat>
        <Stat label="Unique scans">
          {!insights ? (
            isPublic ? (
              <span className="text-sm text-[var(--paper-soft)]">—</span>
            ) : (
              <UpsellLine>Available on Starter and up</UpsellLine>
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
            {today.toLocaleString("en-NG")}
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
          {showUnique ? (
            <ul className="mt-6 flex gap-4 text-xs text-[var(--paper-soft)]" aria-label="Chart key">
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[var(--pin-ink)] opacity-35" />
                Scans
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[var(--pin-ink)]" />
                Unique
              </li>
            </ul>
          ) : null}

          {/*
            Bars, not a line: these are counts per day, and a line between two
            days implies values that were never measured in between. Unique
            scans sit inside each day's bar: they can never exceed it, so one
            bar carries both without a second scale.
          */}
          <div className={`${showUnique ? "mt-2" : "mt-5"} flex h-32 items-end gap-[2px]`} aria-hidden>
            {data.days.map((point) => (
              <div key={point.day} className="group relative flex-1" style={{ height: "100%" }}>
                <div
                  className="absolute bottom-0 w-full rounded-[2px] bg-[var(--pin-ink)] transition-opacity duration-150"
                  style={{
                    // A day with scans never renders as nothing: a 2px floor
                    // keeps one scan visibly different from zero.
                    height: point.scans === 0 ? "1px" : `max(2px, ${(point.scans / peak) * 100}%)`,
                    opacity: point.scans === 0 ? 0.25 : showUnique ? 0.35 : 1,
                  }}
                />
                {showUnique && point.unique > 0 ? (
                  <div
                    className="absolute bottom-0 w-full rounded-[2px] bg-[var(--pin-ink)]"
                    style={{ height: `max(2px, ${(point.unique / peak) * 100}%)` }}
                  />
                ) : null}
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--paper-ink)] px-2 py-1 text-xs text-[var(--paper)] group-hover:block">
                  {point.scans} {point.scans === 1 ? "scan" : "scans"}
                  {showUnique ? `, ${point.unique} unique` : ""} on {point.day}
                </span>
              </div>
            ))}
          </div>
          <div className="dash-num mt-2 flex justify-between text-xs text-[var(--paper-soft)]">
            <span>{data.days[0]?.day}</span>
            {csv("days") ? <CsvLink href={csv("days")!} label={`scans per day, ${days} days`} /> : null}
            <span>{data.days.at(-1)?.day}</span>
          </div>

          {/*
            The figures themselves, for anyone the bars do not serve. The
            tooltip is hover-only -- there is no hover on a phone and no focus
            on a `div` -- so the same data is a table a screen reader can walk
            row by row. The bars are `aria-hidden` so the two are not
            announced twice.
          */}
          <table className="sr-only">
            <caption>Scans per day over the last {days} days.</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Scans</th>
                {showUnique ? <th scope="col">Unique</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.days.map((point) => (
                <tr key={point.day}>
                  <th scope="row">{point.day}</th>
                  <td>{point.scans}</td>
                  {showUnique ? <td>{point.unique}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>

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
                <Locked title="Operating system" line="See whether people scan with iPhone or Android. Available on Starter and up." />
                <Locked title="City" line="See which cities your scans come from. Available on Starter and up." />
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
function Trend({ total, previous, days }: { total: number; previous: number; days: number }) {
  if (previous === 0) {
    return (
      <span className="text-xs text-[var(--paper-soft)]">
        {total > 0 ? `No scans in the ${days} days before` : `None in the ${days} days before either`}
      </span>
    );
  }
  const change = Math.round(((total - previous) / previous) * 100);
  const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  return (
    <span className="text-xs text-[var(--paper-soft)]">
      <span aria-hidden>{arrow} </span>
      {change === 0
        ? `Same as the ${days} days before`
        : `${Math.abs(change)}% ${change > 0 ? "up" : "down"} on the ${days} days before`}
    </span>
  );
}

function UpsellLine({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/billing" className="text-xs text-[var(--paper-soft)] underline underline-offset-4 hover:text-[var(--paper-ink)]">
      {children}
    </Link>
  );
}

/** A feature the plan does not include: what it is, and where to get it. */
function Locked({ title, line, className = "" }: { title: string; line: string; className?: string }) {
  return (
    <div className={className}>
      <h3 className="flex items-center gap-1.5 border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">
        <LockIcon />
        {title}
      </h3>
      <div className="mt-3 rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-4 py-5 text-sm leading-relaxed text-[var(--paper-soft)]">
        <p>{line}</p>
        <Link href="/billing" className="mt-2 inline-block text-[var(--paper-ink)] underline underline-offset-4">
          See plans
        </Link>
      </div>
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
