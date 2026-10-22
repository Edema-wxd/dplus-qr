"use client";

import { BRAND_COLORS, COMPANY_NAME, PRODUCT_NAME, SUPPORT_EMAIL } from "@/lib/brand";

/**
 * The last boundary: the root layout itself failed, so this file replaces it
 * and renders its own document.
 *
 * Which means nothing from the app is available here -- not globals.css, not
 * the Tailwind tokens, not the loaded fonts. Everything is therefore inline,
 * including the two-theme palette and the glyph, and nothing on this page
 * imports more than the brand constants. That is the point: a page that exists
 * because the app broke must not depend on the app.
 *
 * No `metadata` export either, as error boundaries are Client Components, so
 * the title is the React `<title>` element.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const digest =
    typeof error === "object" && error !== null && typeof (error as { digest?: unknown }).digest === "string"
      ? (error as { digest: string }).digest
      : undefined;

  return (
    <html lang="en">
      <head>
        <title>{`Something went wrong · ${PRODUCT_NAME}`}</title>
        <meta name="robots" content="noindex" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{CSS}</style>
      </head>
      <body>
        <main>
          <svg
            width="64"
            height="64"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            {[
              [2, 2],
              [30, 2],
              [2, 30],
            ].map(([x, y]) => (
              <g key={`${x}-${y}`}>
                <rect
                  x={x + 1.75}
                  y={y + 1.75}
                  width="12.5"
                  height="12.5"
                  rx="3.5"
                  stroke="currentColor"
                  strokeWidth="3.5"
                />
                <rect x={x + 5.5} y={y + 5.5} width="5" height="5" rx="1.5" fill="currentColor" />
              </g>
            ))}
            <rect x="30" y="30" width="6" height="6" rx="1.75" fill={BRAND_COLORS.cyan} />
            <rect x="38" y="30" width="6" height="6" rx="1.75" fill={BRAND_COLORS.green} />
            <rect x="38" y="38" width="6" height="6" rx="1.75" fill={BRAND_COLORS.amber} />
            <rect x="30" y="38" width="6" height="6" rx="1.75" fill={BRAND_COLORS.coral} />
          </svg>

          <h1>Something went wrong</h1>

          <p>
            {PRODUCT_NAME} could not load this page at all. It is our side, not
            yours. Trying again often clears it.
          </p>

          <p>
            If you scanned a printed code, the code itself is almost certainly
            fine — scanning it again shortly is worth a try.
          </p>

          <p className="actions">
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
          </p>

          {digest ? (
            <p className="reference">
              Reference: <span className="mono">{digest}</span>
            </p>
          ) : null}

          <p className="footer">
            {COMPANY_NAME} · <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </main>
      </body>
    </html>
  );
}

/**
 * Hand-written rather than generated, to match the look of globals.css closely
 * enough that the page is recognisable while sharing none of its machinery.
 * The colours are the same oklch values; a `global-error` page follows the
 * operating system's scheme, as there is no app theme left to read.
 */
const CSS = `
  :root {
    --bg: oklch(0.99 0.0025 90);
    --fg: oklch(0.18 0.005 226);
    --muted: oklch(0.48 0.005 226);
    --border: oklch(0.91 0.003 226);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: oklch(0.18 0.005 226);
      --fg: oklch(0.98 0.002 226);
      --muted: oklch(0.72 0.005 226);
      --border: oklch(0.32 0.005 226);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: 28rem;
    margin: 0 auto;
    padding: 3rem 1rem;
  }
  h1 { font-size: 1.75rem; line-height: 1.2; margin: 1.5rem 0 0; font-weight: 600; }
  p { color: var(--muted); line-height: 1.6; margin: 1rem 0 0; }
  .actions { margin-top: 2rem; }
  button {
    font: inherit;
    border: 0;
    border-radius: 0.625rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    background: var(--fg);
    color: var(--bg);
    cursor: pointer;
  }
  .reference { font-size: 0.75rem; margin-top: 1.5rem; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  .footer {
    font-size: 0.75rem;
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
  }
  a { color: inherit; }
`;
