"use client";

import { useState } from "react";
import type { Analytics } from "@/lib/user-codes";

/**
 * Scans over time, by country and by device.
 *
 * All three windows are rendered on the server and switched here, rather than
 * read from `searchParams`. Under Cache Components a page that reads
 * searchParams must do it inside a Suspense child or the build fails on
 * prerender; keeping the range in client state avoids that entirely and makes
 * switching instant.
 */
export function AnalyticsPanel({
  windows,
}: {
  windows: { days: number; data: Analytics }[];
}) {
  const [active, setActive] = useState(windows[1]?.days ?? windows[0].days);
  const current = windows.find((w) => w.days === active) ?? windows[0];
  const peak = Math.max(1, ...current.data.days.map((d) => d.scans));

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
              className={`rounded px-3 py-1 text-xs transition-colors duration-150 ${
                w.days === active
                  ? "bg-[var(--paper-ink)] text-[var(--paper)]"
                  : "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]"
              }`}
            >
              {w.days} days
            </button>
          ))}
        </div>
      </div>

      <p className="dash-num mt-3 text-sm text-[var(--paper-soft)]">
        <span className="text-[1.6rem] text-[var(--paper-ink)]">
          {current.data.total.toLocaleString("en-NG")}
        </span>{" "}
        scans in the last {current.days} days
      </p>

      {current.data.total === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-10 text-center text-sm text-[var(--paper-soft)]">
          Nothing has scanned this code yet. Link previews and bots are never
          counted, so this stays at zero until a real phone reads it.
        </p>
      ) : (
        <>
          {/*
            Bars, not a line: these are counts per day, and a line between two
            days implies values that were never measured in between.
          */}
          <div
            className="mt-5 flex h-32 items-end gap-[2px]"
            aria-hidden
          >
            {current.data.days.map((point) => (
              <div
                key={point.day}
                className="group relative flex-1"
                style={{ height: "100%" }}
              >
                <div
                  className="absolute bottom-0 w-full rounded-[2px] bg-[var(--pin-ink)] transition-opacity duration-150 group-hover:opacity-80"
                  style={{
                    // A day with scans never renders as nothing: a 2px floor
                    // keeps one scan visibly different from zero.
                    height:
                      point.scans === 0
                        ? "1px"
                        : `max(2px, ${(point.scans / peak) * 100}%)`,
                    opacity: point.scans === 0 ? 0.25 : 1,
                  }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--paper-ink)] px-2 py-1 text-xs text-[var(--paper)] group-hover:block">
                  {point.scans} on {point.day}
                </span>
              </div>
            ))}
          </div>
          <div className="dash-num mt-2 flex justify-between text-xs text-[var(--paper-soft)]">
            <span>{current.data.days[0]?.day}</span>
            <span>{current.data.days.at(-1)?.day}</span>
          </div>

          {/*
            The figures themselves, for anyone the bars do not serve.
            The tooltip above is hover-only -- there is no hover on a phone and
            no focus on a `div` -- so an `aria-label` quoting just the peak was
            the entire alternative to a chart of up to ninety values. This is
            the same data as a table, which a screen reader can walk row by
            row, and which a touch user gets nothing worse than scrolling for.
            The bars are `aria-hidden` so the two are not announced twice.
          */}
          <table className="sr-only">
            <caption>
              Scans per day over the last {current.days} days.
            </caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Scans</th>
              </tr>
            </thead>
            <tbody>
              {current.data.days.map((point) => (
                <tr key={point.day}>
                  <th scope="row">{point.day}</th>
                  <td>{point.scans}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <Breakdown title="Country" slices={current.data.countries} />
            <Breakdown title="Device" slices={current.data.devices} />
          </div>
        </>
      )}
    </section>
  );
}

function Breakdown({
  title,
  slices,
}: {
  title: string;
  slices: { label: string; scans: number }[];
}) {
  const total = slices.reduce((sum, s) => sum + s.scans, 0) || 1;

  return (
    <div>
      <h3 className="border-b border-[var(--paper-rule)] pb-2 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">
        {title}
      </h3>
      {slices.length === 0 ? (
        <p className="py-3 text-sm text-[var(--paper-soft)]">No data yet.</p>
      ) : (
        <dl>
          {slices.map((slice) => (
            <div
              key={slice.label}
              className="flex items-center gap-3 border-b border-[var(--paper-rule)] py-2.5 last:border-b-0"
            >
              <dt className="w-28 shrink-0 truncate text-sm">{slice.label}</dt>
              <dd className="flex flex-1 items-center gap-3">
                <span
                  aria-hidden
                  className="h-1.5 rounded-full bg-[var(--pin-ink)]"
                  style={{ width: `${Math.max(2, (slice.scans / total) * 100)}%` }}
                />
                <span className="dash-num ml-auto text-sm text-[var(--paper-soft)]">
                  {slice.scans.toLocaleString("en-NG")}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
