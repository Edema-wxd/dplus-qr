import { DEMO_CODE } from "./demo-code";

/**
 * Everything the landing page says, in one place.
 *
 * Two rules govern this file, and both come from PRODUCT.md:
 *
 * 1. Nothing here is invented. Every engineering claim is checkable against
 *    the code it describes, and the file names that code so a later reader can
 *    verify it rather than trust it.
 * 2. Demonstration data is marked. The destination log is illustrative — it is
 *    design material showing how history reads, not a real client's codes — and
 *    the page labels it as such on screen.
 *
 * Prices live in `brand.ts` and are undecided; see `PRICE_FROM_NGN`.
 */

/**
 * The code reference used throughout the page's demonstration material.
 *
 * Defined in `demo-code.ts` and re-exported here, because the redirect path
 * answers it and must not import this file: the specimen is printed on a
 * public page, so a scan of it resolves rather than reaching the not-found
 * page. Re-exported rather than relocated so the page's own imports keep
 * reading from the one place that holds everything the page says.
 */
export { DEMO_CODE };

/**
 * Illustrative destination history for one code. The dates run backwards from
 * "today" so the page reads the way the dashboard's history will: the printed
 * thing is old, its destination is new.
 */
export const DESTINATION_LOG: ReadonlyArray<{
  when: string;
  url: string;
  note: string;
}> = [
  {
    when: "Mar 2024",
    url: "example.com/launch-campaign",
    note: "Printed on 5,000 wrap labels",
  },
  {
    when: "Aug 2024",
    url: "example.com/menu/dry-season",
    note: "Campaign ended, menu went up",
  },
  {
    when: "Jan 2025",
    url: "example.com/catalogue/gifting",
    note: "Season changed",
  },
  {
    when: "Nov 2025",
    url: "shop.example.com/wholesale",
    note: "Moved onto the new shop",
  },
  {
    when: "Today",
    url: "example.com/wherever-you-need",
    note: "Changed in seconds. Same labels.",
  },
];

/**
 * What the product fixes versus what it leaves you holding. Stated as a pair
 * because the whole offer is the boundary between the two columns, and because
 * a visitor's first fear is that "dynamic" means the printed thing is fragile.
 */
export const FIXED: ReadonlyArray<{ what: string; why: string }> = [
  {
    what: "The symbol on the print",
    why: "Generated once. Nothing in the product can redraw it.",
  },
  {
    what: "The seven characters",
    why: `${DEMO_CODE} stays yours. Codes are never reissued or recycled.`,
  },
  {
    what: "The host inside the code",
    why: "qriateplus.com, permanently. The most irreversible decision we made.",
  },
];

export const YOURS: ReadonlyArray<{ what: string; why: string }> = [
  {
    what: "Where it points",
    why: "Any destination, any time, live within a minute.",
  },
  {
    what: "What you call it",
    why: "Rename a code without touching what is printed.",
  },
  {
    what: "Whether it is live",
    why: "Pause a code and scanners meet a calm page, not an error.",
  },
];

/**
 * The redirect contract. Every line here is enforced in
 * `src/app/[code]/route.ts` and asserted in
 * `src/__tests__/redirect-isolation.test.ts`, which is the point: these are
 * commitments with tests behind them, not reassurances.
 */
export const CONTRACT: ReadonlyArray<{ claim: string; detail: string }> = [
  {
    claim: "302, never 301",
    detail:
      "A permanent redirect is cached by the browser forever, so a later change would never reach anyone who had already scanned. Every response is a 302.",
  },
  {
    claim: "Nothing is cached on the way back",
    detail:
      "Cache-Control: no-store on every response, so a destination change is never served from a stale copy.",
  },
  {
    claim: "One lookup, then the redirect",
    detail:
      "The handler does a single cached lookup and responds. Memory, then Redis, then Postgres, each tier failing softly into the next.",
  },
  {
    claim: "Counting happens after you have gone",
    detail:
      "The scan is recorded after the response is sent. Analytics can fail entirely and the redirect still lands.",
  },
  {
    claim: "A rate-limited scan still redirects",
    detail:
      "Past 300 scans a minute from one address we drop the record, never the redirect. The person holding the print is not the problem.",
  },
  {
    claim: "We never store your scanners' addresses",
    detail:
      "Only a salted daily hash of the IP is kept, so a scan can be counted once without the address existing anywhere.",
  },
];

/** The states a scanner can land in, and the tone each one takes. */
export const STATES: ReadonlyArray<{
  label: string;
  accent: "pending" | "struck" | "pin";
  copy: string;
}> = [
  {
    label: "Paused",
    accent: "pending",
    copy: "Names the business, explains that the link is temporarily off, and offers a way through.",
  },
  {
    label: "Blocked",
    accent: "struck",
    copy: "For a destination that turned unsafe. The scanner is told plainly, and can report it.",
  },
  {
    label: "Not available",
    accent: "pin",
    copy: "If our own lookup fails, the scanner gets a branded try-again page, never a crash.",
  },
];
