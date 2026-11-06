"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { CODE_HOST } from "@/lib/brand";
import { DEMO_CODE, DESTINATION_LOG } from "@/lib/landing";
import { Flaps } from "./Flaps";

type Row = { id: number; when: string; url: string; added?: boolean };

/** Rows the board shows at once; older ones roll off the top, as on a real board. */
const VISIBLE_ROWS = 4;

/** Fit a destination into a fixed run of cells, the way a board truncates a long name. */
function fit(text: string, cells: number): string {
  return text.length <= cells ? text : `${text.slice(0, cells - 1)}…`;
}

/**
 * The page's one authored interaction, and the whole offer in behaviour: the
 * visitor changes the destination and the printed code does not move.
 *
 * The QR symbol arrives as `children`, rendered on the server, and nothing in
 * this component can touch it — no key, no transform, no re-render path that
 * reaches it. Only the destination flaps turn over.
 *
 * It never claims to register a code. Pointing the demo is free and local;
 * keeping it is what the account is for, which is also the funnel.
 */
export function DepartureBoard({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<Row[]>(() =>
    DESTINATION_LOG.slice(-VISIBLE_ROWS).map((row, id) => ({ id, when: row.when, url: row.url }))
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const fieldId = useId();

  const live = rows[rows.length - 1];

  function point(event: React.FormEvent) {
    event.preventDefault();
    const raw = draft.trim();
    if (!raw) {
      setError("Type a web address first, like yourshop.com/menu.");
      return;
    }

    // Mirrors the shape of the real server-side check without pretending to be
    // it: the destination is validated with zod on the server when a code is
    // actually saved. Here it only has to be a URL a person meant. `new URL`
    // alone parses "not a url at all" into a host of "not", so a destination
    // must also carry a hostname with at least one dot.
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      setError("That does not look like a web address yet. Try yourshop.com/menu.");
      return;
    }
    const host = parsed.hostname;
    const looksLikeHost =
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host) &&
      !/\s|%/.test(raw);
    if (!looksLikeHost) {
      setError("That does not look like a web address yet. Try yourshop.com/menu.");
      return;
    }
    if (host === CODE_HOST || host.endsWith(".de-signplus.com") || host === "de-signplus.com") {
      setError("A code cannot point at another code. Try your own address.");
      return;
    }

    setError(null);
    setDraft("");
    setChanged(true);
    setRows((previous) => {
      const next = [
        ...previous.map((row, index) =>
          index === previous.length - 1
            ? { ...row, when: "Earlier", added: false }
            : { ...row, added: false }
        ),
        {
          id: previous[previous.length - 1].id + 1,
          when: "Just now",
          url: `${host.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`,
          added: true,
        },
      ];
      return next.slice(-VISIBLE_ROWS);
    });
  }

  return (
    <div className="lp-board p-4 sm:p-6">
      {/* The fixed column: the printed code. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 sm:gap-6">
        <div className="rounded-lg bg-white p-1.5 sm:p-2">{children}</div>
        <div className="min-w-0">
          <p className="text-[13px] text-(--chalk-soft)">The printed code</p>
          <p className="mt-2 hidden text-[clamp(12px,1.4vw,15px)] sm:block xl:text-[clamp(11px,1.1vw,15px)]">
            <Flaps text={`${CODE_HOST}/${DEMO_CODE}`} />
          </p>
          <p className="mt-2 max-w-[30ch] text-sm leading-snug text-(--chalk-soft) sm:mt-3">
            Printed once. It never changes. Only where it sends people does.
          </p>
        </div>
        {/* On a phone the address needs the board's full width to stay legible. */}
        <p className="col-span-2 text-[clamp(11px,3.5vw,15px)] sm:hidden">
          <Flaps text={`${CODE_HOST}/${DEMO_CODE}`} />
        </p>
      </div>

      {/* The moving column: where it sends people. */}
      <div className="mt-6 border-t lp-board-rule pt-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 pb-2 text-xs text-[var(--chalk-muted)] sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]">
          <span className="hidden sm:block">When</span>
          <span>Sends people to</span>
          <span className="text-right">Status</span>
        </div>
        <ol aria-label={`Where ${DEMO_CODE} has pointed (illustrative)`}>
          {rows.map((row, index) => {
            const isLive = row === live;
            const delay = row.added ? 0 : index * 140;
            return (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t lp-board-rule py-2 text-[clamp(11px,2.9vw,14px)] sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]"
              >
                <span className="hidden sm:block">
                  <Flaps text={row.when} tone="dim" flip delayMs={delay} />
                </span>
                <span className="min-w-0 overflow-hidden">
                  <span className="sm:hidden">
                    <Flaps text={fit(row.url, 17)} tone={isLive ? "plain" : "dim"} flip delayMs={delay} />
                  </span>
                  <span className="hidden sm:inline">
                    <Flaps text={fit(row.url, 22)} tone={isLive ? "plain" : "dim"} flip delayMs={delay} />
                  </span>
                </span>
                <span className="text-right">
                  <Flaps
                    key={isLive ? "live" : "was"}
                    text={isLive ? "LIVE" : "WAS "}
                    tone={isLive ? "live" : "dim"}
                    flip
                    delayMs={row.added ? 380 : delay + 200}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <form onSubmit={point} className="mt-5 border-t lp-board-rule pt-5" noValidate>
        <label htmlFor={fieldId} className="block text-[15px] text-[var(--chalk)]">
          Try it: send this code somewhere else
        </label>
        <div className="mt-2.5 flex gap-2">
          <input
            id={fieldId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (error) setError(null);
            }}
            placeholder="yourshop.com/menu"
            inputMode="url"
            autoComplete="url"
            aria-invalid={error ? true : undefined}
            aria-describedby={`${fieldId}-help`}
            className="lp-field min-w-0 flex-1 px-3.5 py-2.5 text-base"
          />
          <button type="submit" className="lp-btn lp-btn-cyan shrink-0 px-4 py-2.5 text-lg leading-none">
            Change it
          </button>
        </div>
        <p
          id={`${fieldId}-help`}
          role={error ? "alert" : undefined}
          aria-live="polite"
          className={`mt-2 min-h-[2.5em] text-[13px] leading-snug ${
            error ? "text-[var(--coral)]" : "text-[var(--chalk-muted)]"
          }`}
        >
          {error ??
            (changed
              ? `Done. ${DEMO_CODE} now opens ${live.url}, and the printed code above did not change at all.`
              : "A preview in your browser. The history above is illustrative and nothing is saved.")}
        </p>
      </form>

      {changed ? (
        <Link
          href="/auth/sign-up"
          className="lp-btn lp-btn-cyan mt-2 w-full justify-between px-5 py-3.5 text-xl"
          data-plain
        >
          Make a real one
          <span className="font-sans text-sm">Create an account</span>
        </Link>
      ) : null}
    </div>
  );
}
