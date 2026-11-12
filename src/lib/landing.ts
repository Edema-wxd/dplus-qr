import { DEMO_CODE } from "./demo-code";
import { COMPANY_NAME, LAPSE_RETENTION_MONTHS } from "./brand";

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

/**
 * Ordinary QR code against a QRiate+ code, one capability per row. Every
 * "yes" in the right-hand column is a built feature; plan-gated ones are
 * worded so they stay true without naming a plan.
 */
export const COMPARISON: ReadonlyArray<{ can: string; plain: boolean; ours: boolean }> = [
  { can: "Change where it goes after it is printed", plain: false, ours: true },
  { can: "Fix a wrong link without reprinting", plain: false, ours: true },
  { can: "Pause it when a promotion ends", plain: false, ours: true },
  { can: "Count scans by day, country and phone", plain: false, ours: true },
  { can: "Open a menu, PDF, profile card or event page", plain: false, ours: true },
  { can: "Your logo and brand colours on the code", plain: true, ours: true },
];

/**
 * The benefit lines. Each is a section of the page painted in one brand colour,
 * and each entry is a row on that section's board: `flap` is the short word on
 * the flaps, `what` and `detail` the sentence beside it.
 *
 * Sources, so a later reader can check rather than trust:
 * - change: `user-codes.ts` (re-point, pause, rename), `custom_codes` and the
 *   never-reissued rule in `short-code.ts`.
 * - scans: `insights`, `csv_export`, `share_stats` in `plan-features.ts`;
 *   country from `geo.ts`.
 * - pages: `qr-types.ts`, `logos.ts`, `qr-style.ts` (contrast check), the
 *   download route.
 */
export type LineRow = { flap: string; what: string; detail: string };

export const CHANGE_ROWS: ReadonlyArray<LineRow> = [
  {
    flap: "Re-point",
    what: "Send it somewhere new",
    detail: "Type a new web address and every scan goes there within a minute. The labels on the shelf do not change.",
  },
  {
    flap: "Fix",
    what: "Correct a mistake after printing",
    detail: "A wrong link on 5,000 flyers is a two-minute fix, not a reprint.",
  },
  {
    flap: "Pause",
    what: "Switch it off, then back on",
    detail: "When a promotion ends, pause the code. Scanners meet a calm page with your business name, not an error.",
  },
  {
    flap: "Rename",
    what: "Keep your codes organised",
    detail: "Name codes by product, branch or campaign without touching anything that is printed.",
  },
  {
    flap: "/yourname",
    what: "Choose your own link",
    detail: "Pick a memorable link like qriateplus.com/yourname instead of a random one, on plans that include custom links.",
  },
];

export const SCAN_ROWS: ReadonlyArray<LineRow> = [
  {
    flap: "Daily",
    what: "Scans by day",
    detail: "See which days and which campaigns actually brought people in.",
  },
  {
    flap: "Where",
    what: "Countries and cities",
    detail: "Know where your printed material is being scanned.",
  },
  {
    flap: "Phones",
    what: "Android or iPhone",
    detail: "See which phones your customers use, and how many scans are from unique people.",
  },
  {
    flap: "Export",
    what: "Download every scan",
    detail: "Export a code's scans as a spreadsheet for your own reports.",
  },
  {
    flap: "Share",
    what: "Show a client the numbers",
    detail: "Send a read-only stats link to someone without an account. It never reveals where the code points.",
  },
];

/**
 * Illustrative only: a week of scans for one code, to show how the dashboard
 * reads. The page labels it as an example.
 */
export const DEMO_WEEK: ReadonlyArray<{ day: string; scans: number }> = [
  { day: "Mon", scans: 38 },
  { day: "Tue", scans: 52 },
  { day: "Wed", scans: 47 },
  { day: "Thu", scans: 61 },
  { day: "Fri", scans: 124 },
  { day: "Sat", scans: 142 },
  { day: "Sun", scans: 89 },
];

/** Page codes, by the labels `qr-types.ts` gives them. */
export const PAGE_TYPES: ReadonlyArray<string> = [
  "Menu",
  "PDF",
  "Business page",
  "Profile card",
  "Event",
  "Coupon",
  "Feedback",
  "Multiple links",
  "Social media",
  "Images",
  "Video",
  "MP3",
  "Playlist",
  "App",
  "Instagram",
  "Facebook",
  "2D Barcode",
  "Website",
];

/** Static code kinds from `qr-types.ts`. Free on every plan (`pricing-content.ts`). */
export const STATIC_TYPES: ReadonlyArray<string> = [
  "WhatsApp",
  "Wi-Fi",
  "vCard",
  "Call",
  "SMS",
  "Email",
  "Text",
];

export const PAGE_ROWS: ReadonlyArray<LineRow> = [
  {
    flap: "Hosted",
    what: "Pages you build here",
    detail: "Build the page the code opens right here: a menu, a PDF, a profile card, an event. Change it as often as the destination.",
  },
  {
    flap: "Brand",
    what: "Your logo and colours",
    detail: "Put your logo in the middle and set your colours. We check the contrast before saving, so it still scans.",
  },
  {
    flap: "Print",
    what: "Artwork ready for the printer",
    detail: "Download crisp SVG for print and PNG for screens.",
  },
];

/**
 * Examples of where codes go to work. Illustrative: the pairs show the kind of
 * change a business makes, not any real client's codes.
 */
export const USES: ReadonlyArray<{ printed: string; today: string; later: string }> = [
  { printed: "Packaging and labels", today: "product page", later: "reorder link" },
  { printed: "Restaurant menus", today: "lunch menu", later: "dinner menu" },
  { printed: "Event banners", today: "programme", later: "photo gallery" },
  { printed: "Corporate gifts", today: "thank-you note", later: "new catalogue" },
  { printed: "Business cards", today: "profile card", later: "new phone number" },
  { printed: "Shop signage", today: "opening offer", later: "WhatsApp orders" },
];

/** The real sequence from sign-up to a printed code. */
export const STEPS: ReadonlyArray<{ title: string; detail: string }> = [
  {
    title: "Create an account",
    detail: "Sign up with your email address. Plans are billed in naira through Paystack.",
  },
  {
    title: "Make your code",
    detail: "Paste a link or build a page, add your logo and colours, and download the artwork.",
  },
  {
    title: "Print it, then change it whenever you like",
    detail: "Re-point it, pause it and watch the scans from your dashboard, for as long as the print exists.",
  },
];

/**
 * The objections a printing business raises before it commits, answered from
 * the billing policy (`pricing-content.ts`), `brand.ts` and the status pages.
 */
export const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "If I change the link, do I need to reprint?",
    a: "No. The printed code only ever contains your short qriateplus.com link. Where that link sends people is a setting you change from your dashboard, and every scan follows it.",
  },
  {
    q: "What happens if a payment fails?",
    a: "Your codes keep working for a 7-day grace period while you sort it out. If it stays unpaid they pause, and scanners see a calm paused page. A successful payment brings them straight back.",
  },
  {
    q: "What if I cancel?",
    a: `Your plan runs to the end of the period you paid for, then your codes pause. Nothing is deleted for ${LAPSE_RETENTION_MONTHS} months, so coming back restores every code and its scans.`,
  },
  {
    q: "How do I pay?",
    a: "In naira, through Paystack, monthly or annually. No dollar card needed.",
  },
  {
    q: "Will it still scan with my logo and colours?",
    a: "Yes. A code with a logo is drawn with the highest error correction, and colour choices are checked for contrast before they can be saved.",
  },
  {
    q: "What can a code open?",
    a: "Any website, or a page you build here: a menu, PDF, profile card, event, coupon, feedback form, video and more. Codes for WhatsApp, Wi-Fi, contacts and calls are free on every plan.",
  },
  {
    q: "Can you print the material for me too?",
    a: `Yes. ${COMPANY_NAME}, the studio behind this platform, designs and prints packaging, labels, gifts and signage, so the code and the artwork come from one place.`,
  },
];
