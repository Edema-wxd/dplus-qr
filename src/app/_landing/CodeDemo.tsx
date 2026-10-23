"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CODE_HOST, PRODUCT_NAME } from "@/lib/brand";
import { DEMO_CODE, DESTINATION_LOG } from "@/lib/landing";

type Row = { when: string; url: string; note: string; added?: boolean };

/**
 * The page's one authored interaction, and the whole thesis in behaviour:
 * the visitor changes the destination and the symbol does not move.
 *
 * The symbol arrives as `children`, rendered on the server, and nothing in this
 * component can touch it — no key, no transform, no re-render path that reaches
 * it. That is deliberate. The proof is structural, not animated: the one thing
 * on screen that never reacts is the thing that is printed.
 *
 * It never claims to register a code. Pointing the demo is free and local;
 * keeping it is what the account is for, which is also the funnel.
 */
export function CodeDemo({
  heading,
  children,
}: {
  heading: React.ReactNode;
  children: React.ReactNode;
}) {
  const [rows, setRows] = useState<Row[]>(() => [...DESTINATION_LOG]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const logRef = useRef<HTMLOListElement>(null);

  const live = rows[rows.length - 1];

  function point(event: React.FormEvent) {
    event.preventDefault();
    const raw = draft.trim();
    if (!raw) return;

    // Mirrors the shape of the real server-side check without pretending to be
    // it: the destination is validated with zod on the server when a code is
    // actually saved. Here it only has to be a URL a person meant.
    //
    // `new URL` alone is far too permissive for that — it happily parses
    // "not a url at all" into a host of "not" and a percent-encoded path, which
    // then reads as a live destination in the log and makes the demonstration
    // lie. A destination has to carry a hostname with at least one dot and
    // nothing in it but the characters a hostname may hold.
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      setError("That does not look like a web address yet.");
      return;
    }
    const host = parsed.hostname;
    const looksLikeHost =
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host) &&
      !/\s|%/.test(raw);
    if (!looksLikeHost) {
      setError("That does not look like a web address yet.");
      return;
    }
    if (host === CODE_HOST || host.endsWith(".de-signplus.com") || host === "de-signplus.com") {
      setError("A code cannot point at another code. Try your own address.");
      return;
    }

    setError(null);
    setDraft("");
    setRows((previous) => [
      // Retire whatever is currently live, whatever it happens to be labelled.
      // Matching the literal string "Today" left a second submission with two
      // rows both claiming to be the live destination.
      ...previous.map((row, index) =>
        index === previous.length - 1 ? { ...row, when: "Earlier", added: false } : row
      ),
      {
        when: "Just now",
        url: `${host}${parsed.pathname === "/" ? "" : parsed.pathname}`,
        note: "You changed it. The symbol did not.",
        added: true,
      },
    ]);
  }

  return (
    <>
      {/*
        On a phone the headline comes first: a visitor who meets a QR symbol and
        the word "specimen" before any sentence has not been told what this is.
        On desktop the grid puts the specimen back on the left, spanning both
        rows, where it can pin.
      */}
      <div className="order-1 lg:order-none lg:col-start-2 lg:row-start-1 lg:px-14 lg:pt-20 px-7 pb-2 pt-12 sm:px-10 lg:pb-0">
        {heading}
      </div>

      <div className="lp-paper order-2 flex flex-col px-7 pb-8 pt-9 sm:px-10 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <Image
            src="/brand/qriate-wordmark.svg"
            alt={PRODUCT_NAME}
            width={150}
            height={62}
            priority
            className="hidden h-auto w-[150px] lg:block"
          />
          <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--paper-soft)]">
            Specimen · 7 characters · base-58
          </p>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center py-7 lg:py-5">
          <div className="relative">
            {children}
            {["-top-2 -left-2", "-top-2 -right-2", "-bottom-2 -left-2", "-bottom-2 -right-2"].map(
              (where) => (
                <span
                  key={where}
                  aria-hidden
                  className={`absolute ${where} size-3 rounded-full bg-[var(--pin)] shadow-[0_1px_3px_rgba(0,0,0,0.35)]`}
                />
              )
            )}
          </div>

          <p className="mt-6 text-center text-[11px] uppercase tracking-[0.2em] text-[var(--paper-soft)]">
            This symbol never changes again
          </p>
          <p className="lp-num mt-1.5 text-center font-mono text-[15px] sm:text-base">
            {CODE_HOST}/{DEMO_CODE}
          </p>
        </div>

        <form
          onSubmit={point}
          className="mt-6 border-t border-[var(--paper-rule)] pt-5"
          noValidate
        >
          <label htmlFor={fieldId} className="block text-sm text-[var(--paper-soft)]">
            Send it somewhere else
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id={fieldId}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              placeholder="your-site.com/anywhere"
              inputMode="url"
              autoComplete="url"
              aria-describedby={error ? `${fieldId}-error` : undefined}
              className="min-w-0 flex-1 rounded-lg border border-[var(--paper-rule)] bg-white px-3.5 py-2.5 text-[15px] text-[var(--paper-ink)] placeholder:text-[var(--paper-soft)] transition-colors duration-150 focus:border-[var(--paper-ink)]"
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--paper-ink)] px-4 py-2.5 font-sarlotte text-lg text-[var(--paper)] transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
            >
              Point it
            </button>
          </div>
          {error ? (
            <p id={`${fieldId}-error`} role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
              {error}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-[var(--paper-soft)]">
              A preview, here in your browser. Nothing is saved and no code is issued yet.
            </p>
          )}
        </form>

        <Link
          href="/auth/sign-up"
          className="mt-4 flex flex-col gap-1.5 rounded-lg bg-[var(--pin)] px-5 py-4 text-[var(--paper-ink)] no-underline transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.99] sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          data-plain
        >
          <span className="whitespace-nowrap font-sarlotte text-2xl leading-none">
            Keep this code
          </span>
          <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.16em] opacity-70">
            Create an account
          </span>
        </Link>
      </div>

      <div className="order-3 px-7 pb-16 pt-12 sm:px-10 lg:order-none lg:col-start-2 lg:row-start-2 lg:px-14 lg:pb-20 lg:pt-10">
        <div className="mt-0 flex items-baseline justify-between gap-4 border-b border-[var(--field-rule)] pb-2.5 text-[11px] uppercase tracking-[0.2em] text-[var(--field-muted)]">
          <span>Destination history · {DEMO_CODE}</span>
          <span>Illustrative</span>
        </div>

        <ol ref={logRef} className="mb-10">
          {rows.map((row, index) => {
            const isLive = row === live;
            return (
              <li
                key={`${row.when}-${row.url}-${index}`}
                className={`grid grid-cols-[5.5rem_1fr] items-baseline gap-x-4 gap-y-1 border-b border-[var(--field-rule)]/55 py-3.5 sm:grid-cols-[7rem_1fr_auto] ${
                  row.added ? "lp-rise" : ""
                }`}
                style={
                  row.added || index > DESTINATION_LOG.length
                    ? undefined
                    : { animationDelay: `${index * 55}ms` }
                }
              >
                <time className="lp-num text-[11px] uppercase tracking-[0.12em] text-[var(--field-muted)]">
                  {row.when}
                </time>
                <span
                  className={`truncate font-mono text-[13.5px] sm:text-sm ${
                    isLive ? "text-[var(--live)]" : "text-[var(--field-muted)]"
                  }`}
                >
                  {row.url}
                </span>
                <span className="col-start-2 text-xs text-[var(--field-muted)] sm:col-start-3 sm:text-right">
                  {isLive ? (
                    <span className="rounded-full border border-[var(--live)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--live)]">
                      Live
                    </span>
                  ) : (
                    row.note
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        <p
          aria-live="polite"
          className="max-w-[40ch] text-sm leading-relaxed text-[var(--field-muted)]"
        >
          {live.note}
        </p>

        {/*
          The proof, in the fold. Three of the redirect contract's commitments
          run as a hairline strip under the log, so a visitor who never scrolls
          has still been told why a printed code keeps resolving.
        */}
        <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-2 border-t border-[var(--field-rule)] pt-4 text-[11px] uppercase tracking-[0.15em] text-[var(--field-muted)] lg:mt-12">
          {["302, never 301", "no-store on every response", "one cached lookup"].map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
