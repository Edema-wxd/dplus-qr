import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Banknote, Check, Plus, Printer, ShieldCheck } from "lucide-react";
import {
  CODE_HOST,
  CODE_ORIGIN,
  COMPANY_NAME,
  LAPSE_RETENTION_MONTHS,
  MAIN_SITE,
  PRODUCT_NAME,
  PRODUCT_NAME_SPOKEN,
  PRICE_FROM_NGN,
  RETIRED_HOST,
  SUPPORT_EMAIL,
  priceFrom,
} from "@/lib/brand";
import {
  CHANGE_ROWS,
  COMPARISON,
  CONTRACT,
  DEMO_CODE,
  DEMO_WEEK,
  FAQ,
  PAGE_ROWS,
  PAGE_TYPES,
  SCAN_ROWS,
  STATES,
  STATIC_TYPES,
  STEPS,
  USES,
  type LineRow,
} from "@/lib/landing";
import { QrSymbol, moduleCount } from "./_landing/QrSymbol";
import { DepartureBoard } from "./_landing/DepartureBoard";
import { Flaps, type FlapTone } from "./_landing/Flaps";
import { LegalLinks } from "@/components/LegalLinks";
import { PLAN_FEATURES } from "@/lib/plan-features";

/**
 * The landing page at the root of qriateplus.com.
 *
 * The root layout marks the whole host `noindex`, because every other page on
 * it is a transient state of someone else's printed material. This is the one
 * page that wants to be found, so it opts itself back in here rather than the
 * layout opting everything in and the status pages opting back out — the safer
 * direction to fail in.
 *
 * It reads no request API, so under Cache Components it is evaluated at build
 * time and ships as static markup. The QR symbols are generated in that same
 * build, which is why they cost a visitor nothing.
 */
export const metadata: Metadata = {
  title: { absolute: `Dynamic QR Code Generator for Nigeria | ${PRODUCT_NAME}` },
  description: `Print a QR code once and change where it leads any time. Dynamic QR codes from NGN ${priceFrom()}/month, billed in naira through Paystack. A De Sign Plus product.`,
  alternates: { canonical: CODE_ORIGIN },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: CODE_ORIGIN,
    siteName: PRODUCT_NAME,
    locale: "en_NG",
    title: `${PRODUCT_NAME} — print it once, change it whenever`,
    description:
      "Dynamic QR codes for businesses that print things. The code on the packaging never changes; only where it sends people.",
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME} — print it once, change it whenever`,
    description:
      "Dynamic QR codes for businesses that print things. Billed in naira through Paystack.",
  },
};

const codeUrl = `${CODE_ORIGIN}/${DEMO_CODE}`;
const retiredUrl = `https://${RETIRED_HOST}/${DEMO_CODE}`;
const newModules = moduleCount(codeUrl);
const oldModules = moduleCount(retiredUrl);
const weekPeak = Math.max(...DEMO_WEEK.map((day) => day.scans));

const SIGN_UP = "/auth/sign-up";

/**
 * Structured data for search engines and AI assistants.
 *
 * Built from the same constants the page renders, never typed separately:
 * the FAQ markup is the visible FAQ (Google requires the two to match), the
 * feature list is the built entries of `PLAN_FEATURES`, and the price is
 * `PRICE_FROM_NGN`. No high price or offer count: this page is static, has no
 * database at build time, and per-plan figures belong to `/pricing`.
 */
const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PRODUCT_NAME,
    url: CODE_ORIGIN,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: `Dynamic QR code generator for Nigerian businesses. Print a QR code once and change where it leads at any time. Billed in naira through Paystack.`,
    ...(PRICE_FROM_NGN === null
      ? {}
      : {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "NGN",
            lowPrice: String(PRICE_FROM_NGN),
            url: `${CODE_ORIGIN}/pricing`,
          },
        }),
    creator: { "@type": "Organization", name: COMPANY_NAME, url: MAIN_SITE },
    featureList: [
      "Dynamic QR codes you can re-point after printing",
      "Scan counts and charts for every code",
      ...PLAN_FEATURES.filter((f) => f.built && f.kind === "boolean").map((f) => f.label),
      "Free static codes for WhatsApp, Wi-Fi, contacts and calls",
      "Naira billing through Paystack",
    ],
    inLanguage: "en",
    areaServed: { "@type": "Country", name: "Nigeria" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  },
];

/** `<` escaped so no string in the data can close the script element. */
const structuredDataJson = JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c");

/** Every section shares one set of gutters and one maximum width. */
const frame = "mx-auto w-full max-w-[86rem] px-5 sm:px-10 lg:px-16";
const band = "py-16 sm:py-20 lg:py-28";
const h2 =
  "font-sarlotte text-[clamp(2.25rem,4.8vw,3.75rem)] leading-[1] tracking-[-0.015em] text-balance";

/**
 * The wordmark ships as two vectors rather than one with a CSS filter: the
 * letterforms invert between grounds but the swashes, the QR motif and the
 * raised plus must keep their brand colours, which no filter can do.
 */
function Wordmark({ on, width, className }: { on: "light" | "dark"; width: number; className?: string }) {
  return (
    <Image
      src={on === "light" ? "/brand/qriate-wordmark.svg" : "/brand/qriate-wordmark-light.svg"}
      alt={PRODUCT_NAME}
      width={width}
      height={Math.round((width * 320) / 778)}
      className={`h-auto ${className ?? ""}`}
      priority={on === "dark"}
    />
  );
}

/** The sign-up action that closes each benefit line, worded for that line. */
function LineCta({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "cyan" }) {
  return (
    <Link
      href={SIGN_UP}
      className={`lp-btn ${tone === "ink" ? "lp-btn-ink" : "lp-btn-cyan"} px-6 py-3.5 text-xl leading-none`}
      data-plain
    >
      {children}
    </Link>
  );
}

/** A board of benefit rows: the word on the flaps, then what it means. */
function BenefitBoard({ rows, tone, label }: { rows: ReadonlyArray<LineRow>; tone: FlapTone; label: string }) {
  return (
    <dl className="lp-board px-4 py-2 sm:px-6" aria-label={label}>
      {rows.map((row, index) => (
        <div
          key={row.flap}
          className={`grid gap-x-6 gap-y-2.5 py-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:py-5 ${
            index > 0 ? "border-t lp-board-rule" : ""
          }`}
        >
          <dt className="text-[15px] sm:pt-0.5 sm:text-base">
            <Flaps text={row.flap} cells={9} tone={tone} />
          </dt>
          <dd>
            <span className="block text-[17px] leading-snug text-(--chalk)">{row.what}</span>
            <span className="mt-1 block max-w-[52ch] text-sm leading-relaxed text-(--chalk-soft)">
              {row.detail}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

const NAV: ReadonlyArray<{ href: string; label: string; dot?: string }> = [
  { href: "#change", label: "Change it", dot: "var(--green)" },
  { href: "#scans", label: "Scans", dot: "var(--amber)" },
  { href: "#pages", label: "Pages", dot: "var(--coral)" },
  { href: "#reliability", label: "Reliability", dot: "var(--cyan)" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "Questions" },
];

export default function Home() {
  return (
    <div className="lp min-h-dvh">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataJson }}
      />
      <a
        href="#start"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-(--chalk) focus:px-4 focus:py-2 focus:text-sm focus:text-(--ink)"
      >
        Skip to creating an account
      </a>

      {/* The concourse header: a line map of the page, and the account action. */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-(--ink)/95 backdrop-blur-sm">
        <div className={`${frame} flex items-center justify-between gap-4 py-3`}>
          <Link href="/" aria-label={`${PRODUCT_NAME} home`} data-plain>
            <Wordmark on="dark" width={116} />
          </Link>
          <nav aria-label="On this page" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-(--chalk-soft) no-underline transition-colors duration-150 hover:text-(--chalk)"
                    data-plain
                  >
                    {item.dot ? (
                      <span aria-hidden className="size-2 rounded-full" style={{ background: item.dot }} />
                    ) : null}
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-1.5">
            <Link
              href="/auth/sign-in"
              className="rounded-lg px-3 py-2 text-sm text-(--chalk-soft) no-underline transition-colors duration-150 hover:text-(--chalk)"
              data-plain
            >
              Sign in
            </Link>
            <Link href={SIGN_UP} className="lp-btn lp-btn-cyan px-4 py-2.5 text-[17px] leading-none" data-plain>
              Create a code
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: the cyan wall, the offer on the left and the working board on the right. */}
        <section className="lp-wall lp-cyan">
          <div
            className={`${frame} grid grid-cols-[minmax(0,1fr)] items-center gap-12 pb-16 pt-12 sm:pb-20 lg:pb-24 lg:pt-16 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:gap-16`}
          >
            <div>
              <h1 className="font-sarlotte text-[clamp(3rem,6.6vw,5.75rem)] leading-[0.93] tracking-[-0.02em] text-balance">
                Print it once.
                <br />
                Change it whenever.
              </h1>
              <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-(--wall-soft)">
                A QR code that keeps up when your plans change. Send it to a new
                link, pause it, track every scan or turn it into a menu, all after
                it is printed. The labels already on the shelf keep working.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={SIGN_UP} className="lp-btn lp-btn-ink px-7 py-4 text-2xl leading-none" data-plain>
                  Create your first code
                </Link>
                <a href="#pricing" className="lp-btn lp-btn-line px-5 py-4 text-lg leading-none" data-plain>
                  See pricing
                </a>
              </div>
              <ul className="mt-10 grid max-w-xl gap-3 text-[15px] sm:grid-cols-3 sm:gap-5">
                {[
                  {
                    icon: Banknote,
                    text:
                      PRICE_FROM_NGN === null
                        ? "Billed in naira through Paystack"
                        : `From ₦${priceFrom()} a month, in naira`,
                  },
                  { icon: Printer, text: `Made by ${COMPANY_NAME}, the printer` },
                  { icon: ShieldCheck, text: "Built so printed codes keep working" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-2.5 border-t border-(--ink)/25 pt-3 leading-snug">
                    <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={1.75} />
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            <DepartureBoard>
              {/*
                The hero symbol encodes the code the caption beside it prints,
                not the bare origin, so a visitor who scans the page's central
                claim is redirected by it rather than returned to this page.
                The redirect path answers this code from a constant.
              */}
              <QrSymbol
                value={codeUrl}
                px={312}
                title={`${PRODUCT_NAME_SPOKEN} — scan to open ${CODE_HOST}/${DEMO_CODE}`}
                className="block h-auto w-[clamp(96px,24vw,176px)]"
              />
            </DepartureBoard>
          </div>
        </section>

        {/* Why dynamic: the ordinary code against this one, as a board of yes and no. */}
        <section id="why" className={band}>
          <div className={`${frame} grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16`}>
            <div>
              <h2 className={`${h2} max-w-[16ch]`}>An ordinary QR code is a promise you can&apos;t take back.</h2>
              <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-(--chalk-soft)">
                Its link is baked into the pattern. Move your website, end a
                promotion or spot a typo, and the whole print run is wrong. A
                dynamic code puts a short link in the pattern instead, and you
                decide where that link goes.
              </p>
              <div className="mt-8">
                <LineCta tone="cyan">Create your first code</LineCta>
              </div>
            </div>

            <div className="lp-board overflow-hidden px-4 py-2 sm:px-6">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">What an ordinary QR code can do, compared with {PRODUCT_NAME}</caption>
                <thead>
                  <tr className="text-xs text-(--chalk-muted)">
                    <th scope="col" className="py-3 pr-3 font-normal">
                      After it is printed, can you…
                    </th>
                    <th scope="col" className="px-2 py-3 text-center font-normal">
                      Ordinary
                    </th>
                    <th scope="col" className="py-3 pl-2 text-center font-normal">
                      {PRODUCT_NAME}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row.can} className="border-t lp-board-rule">
                      <th scope="row" className="py-3.5 pr-3 text-[15px] font-normal leading-snug text-(--chalk) sm:text-base">
                        {row.can}
                      </th>
                      {[row.plain, row.ours].map((yes, index) => (
                        <td key={index} className="px-2 py-3.5 text-center text-[13px] sm:text-[15px]">
                          <Flaps text={yes ? "YES" : "NO "} tone={yes ? "live" : "off"} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Green line: change it. */}
        <section id="change" className={`lp-wall lp-green ${band}`}>
          <div className={`${frame} grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16`}>
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className={`${h2} max-w-[14ch]`}>Change it any time, from your phone.</h2>
              <p className="mt-6 max-w-[42ch] text-lg leading-relaxed text-(--wall-soft)">
                One dashboard for every code you have printed. A change reaches
                every scan within a minute, and the code on the print stays
                exactly as it is.
              </p>
              <div className="mt-8">
                <LineCta>Start with one code</LineCta>
              </div>
            </div>
            <BenefitBoard rows={CHANGE_ROWS} tone="live" label="What you can change" />
          </div>
        </section>

        {/* Amber line: scans. */}
        <section id="scans" className={`lp-wall lp-amber ${band}`}>
          <div className={frame}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-end lg:gap-16">
              <div>
                <h2 className={`${h2} max-w-[15ch]`}>Know which print is actually working.</h2>
                <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-(--wall-soft)">
                  Every scan is counted, so you can tell the flyer that brought
                  customers from the one that did not, and put your budget behind
                  what works.
                </p>
                <div className="mt-8">
                  <LineCta>See your own scans</LineCta>
                </div>
              </div>

              <figure className="lp-board m-0 px-4 py-4 sm:px-6 sm:py-5">
                <figcaption className="flex items-baseline justify-between gap-4 pb-3 text-xs text-(--chalk-muted)">
                  <span>Scans this week, one code</span>
                  <span>Example</span>
                </figcaption>
                <ol className="text-[13px] sm:text-[15px]">
                  {DEMO_WEEK.map((day) => (
                    <li
                      key={day.day}
                      className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 border-t lp-board-rule py-2 sm:gap-4"
                    >
                      <Flaps text={day.day} tone="dim" />
                      <Flaps text={String(day.scans).padStart(3, "0")} tone={day.scans === weekPeak ? "new" : "plain"} />
                      <span aria-hidden className="h-2.5 rounded-full bg-white/8">
                        <span
                          className="block h-full rounded-full bg-(--amber)"
                          style={{ width: `${Math.round((day.scans / weekPeak) * 100)}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
              </figure>
            </div>

            <dl className="mt-16 grid gap-x-8 sm:grid-cols-2 lg:mt-20 lg:grid-cols-5">
              {SCAN_ROWS.map((row) => (
                <div key={row.flap} className="border-t-2 border-(--ink) py-5">
                  <dt className="font-sarlotte text-2xl leading-tight">{row.what}</dt>
                  <dd className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-(--wall-soft)">{row.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Coral line: what a code can open. */}
        <section id="pages" className={`lp-wall lp-coral ${band}`}>
          <div className={frame}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
              <div>
                <h2 className={`${h2} max-w-[14ch]`}>More than a link. No website needed.</h2>
                <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-(--wall-soft)">
                  A code can open a page you build right here, and you can change
                  that page as often as you like. Menus, price lists, contact
                  cards and event details stay current without a single reprint.
                </p>
                <div className="mt-8">
                  <LineCta>Build your first page</LineCta>
                </div>
              </div>

              <div className="lp-board px-4 py-5 sm:px-6 sm:py-6">
                <p className="pb-4 text-xs text-(--chalk-muted)">A code can open</p>
                <ul className="flex flex-wrap gap-x-3 gap-y-3 text-[13px] sm:text-[15px]" aria-label="Page types">
                  {PAGE_TYPES.map((type) => (
                    <li key={type}>
                      <Flaps text={type.toUpperCase()} />
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t lp-board-rule pt-4 text-sm leading-relaxed text-(--chalk-soft)">
                  Free on every plan: codes for {STATIC_TYPES.slice(0, -1).join(", ")} and{" "}
                  {STATIC_TYPES[STATIC_TYPES.length - 1]}. Hosted pages come with the plans
                  that include them.
                </p>
              </div>
            </div>

            <dl className="mt-16 grid gap-x-10 md:grid-cols-3 lg:mt-20">
              {PAGE_ROWS.map((row) => (
                <div key={row.flap} className="border-t-2 border-(--ink) py-5">
                  <dt className="font-sarlotte text-2xl leading-tight">{row.what}</dt>
                  <dd className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-(--wall-soft)">{row.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Where codes go to work: printed on, opens today, opens later. */}
        <section className={`lp-wall ${band}`} style={{ "--wall": "#e7e8ea" } as React.CSSProperties}>
          <div className={frame}>
            <h2 className={`${h2} max-w-[20ch]`}>One code, many lives.</h2>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-(--wall-soft)">
              The thing you print lasts for years. What it needs to show changes
              every season. Here is the kind of change a business makes.
            </p>

            <div className="lp-board mt-10 px-4 py-2 sm:px-6">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Examples of what a printed code can open now and later</caption>
                <thead>
                  <tr className="text-xs text-(--chalk-muted) max-sm:hidden">
                    <th scope="col" className="py-3 pr-4 font-normal max-sm:hidden">Printed on</th>
                    <th scope="col" className="py-3 pr-4 font-normal">Opens today</th>
                    <th scope="col" className="py-3 font-normal">Opens later</th>
                  </tr>
                </thead>
                <tbody>
                  {USES.map((use) => (
                    <tr key={use.printed} className="border-t lp-board-rule max-sm:grid max-sm:gap-1.5 max-sm:py-3.5">
                      <th scope="row" className="py-3.5 pr-4 text-base font-normal text-(--chalk) max-sm:py-0 max-sm:pb-1">
                        {use.printed}
                      </th>
                      <td className="py-3.5 pr-4 text-[11px] max-sm:py-0 sm:text-sm">
                        <span className="mr-2 text-xs text-(--chalk-muted) sm:hidden">Today</span>
                        <Flaps text={use.today.toUpperCase()} tone="dim" />
                      </td>
                      <td className="py-3.5 text-[11px] max-sm:py-0 sm:text-sm">
                        <span className="mr-2 text-xs text-(--chalk-muted) sm:hidden">Later</span>
                        <Flaps text={use.later.toUpperCase()} tone="live" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-(--wall-soft)">Examples, not real customers&apos; codes.</p>
          </div>
        </section>

        {/* Reliability, on ink: the contract, the short-host proof, and the calm states. */}
        <section id="reliability" className={band}>
          <div className={frame}>
            <h2 className={`${h2} max-w-[18ch]`}>Built to outlast the print.</h2>
            <p className="mt-6 max-w-[54ch] text-lg leading-relaxed text-(--chalk-soft)">
              One rule runs this platform: when a feature would make a scan less
              reliable, reliability wins. These are the consequences, stated
              plainly, because a printed code is a promise you can&apos;t take back.
            </p>

            <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
              <dl>
                {CONTRACT.map((item, index) => (
                  <div
                    key={item.claim}
                    className={`grid gap-x-8 gap-y-1.5 py-5 sm:grid-cols-[15rem_minmax(0,1fr)] ${
                      index > 0 ? "border-t border-white/12" : "border-t-2 border-(--cyan)"
                    }`}
                  >
                    <dt className="text-[17px] leading-snug">{item.claim}</dt>
                    <dd className="max-w-[56ch] text-sm leading-relaxed text-(--chalk-soft)">{item.detail}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <h3 className="font-sarlotte text-[1.75rem] leading-tight">A shorter link is an easier scan.</h3>
                <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-(--chalk-soft)">
                  We put every code on {CODE_HOST} for one measurable reason:{" "}
                  {codeUrl.length} characters instead of {retiredUrl.length}. Fewer
                  characters means fewer, larger squares, so the code still scans
                  when it is printed small on packaging.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-5">
                  {[
                    { label: "What we print", url: `${CODE_HOST}/${DEMO_CODE}`, value: codeUrl, modules: newModules, strong: true },
                    { label: "A longer link", url: `${RETIRED_HOST}/${DEMO_CODE}`, value: retiredUrl, modules: oldModules, strong: false },
                  ].map((item) => (
                    <figure key={item.url} className="m-0">
                      <div className="rounded-lg bg-white p-2">
                        <QrSymbol
                          value={item.value}
                          px={160}
                          title={`Specimen code for ${item.url}`}
                          className="block h-auto w-full"
                        />
                      </div>
                      <figcaption className="mt-3">
                        <span
                          className={`lp-num block font-sarlotte text-[2rem] leading-none ${
                            item.strong ? "text-(--cyan)" : "text-(--chalk-muted)"
                          }`}
                        >
                          {item.modules}×{item.modules}
                        </span>
                        <span className="mt-1 block text-[13px] text-(--chalk-soft)">squares, {item.label.toLowerCase()}</span>
                        <span className="mt-1 block break-all text-xs text-(--chalk-muted)">{item.url}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-20">
              <h3 className="font-sarlotte text-[1.75rem] leading-tight">
                And when something is wrong, your customer is never blamed.
              </h3>
              <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-(--chalk-soft)">
                Whatever has happened behind a code, the person scanning it meets a
                calm page with your business&apos;s name and a way forward, never a
                browser error.
              </p>
              <dl className="mt-8 grid gap-x-10 md:grid-cols-3">
                {STATES.map((state) => (
                  <div key={state.label} className="border-t border-white/12 py-5">
                    <dt className="text-[15px]">
                      <Flaps
                        text={state.label.toUpperCase()}
                        tone={state.accent === "pending" ? "new" : state.accent === "struck" ? "off" : "cyan"}
                      />
                    </dt>
                    <dd className="mt-3 max-w-[40ch] text-sm leading-relaxed text-(--chalk-soft)">{state.copy}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* How it starts: a real sequence, so it is numbered. */}
        <section className={`lp-wall ${band}`} style={{ "--wall": "#e7e8ea" } as React.CSSProperties}>
          <div className={frame}>
            <h2 className={`${h2} max-w-[20ch]`}>From sign-up to print in an afternoon.</h2>
            <ol className="mt-12 grid gap-x-10 gap-y-2 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="border-t-2 border-(--ink) py-6">
                  <span className="lp-board inline-block rounded-md p-1.5 text-2xl">
                    <Flaps text={String(index + 1)} tone="cyan" />
                  </span>
                  <h3 className="mt-5 font-sarlotte text-2xl leading-tight">{step.title}</h3>
                  <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-(--wall-soft)">{step.detail}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 max-w-[60ch] text-[15px] leading-relaxed text-(--wall-soft)">
              Need the labels, packaging or signage too?{" "}
              <a href={MAIN_SITE} className="text-(--ink) underline">
                {COMPANY_NAME}
              </a>{" "}
              designs and prints them, so the code and the artwork come from one place.
            </p>
          </div>
        </section>

        {/* Questions, on ink. */}
        <section id="faq" className={band}>
          <div className={`${frame} grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16`}>
            <div>
              <h2 className={`${h2} max-w-[12ch]`}>Questions, answered.</h2>
              <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-(--chalk-soft)">
                Anything else, ask us at{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-(--chalk) underline">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
            <div className="border-b border-white/12">
              {FAQ.map((item) => (
                <details key={item.q} className="lp-faq group border-t border-white/12">
                  <summary className="flex items-center justify-between gap-6 py-5 text-lg leading-snug transition-colors duration-150 hover:text-(--cyan)">
                    {item.q}
                    <Plus aria-hidden className="lp-plus size-5 shrink-0 text-(--cyan)" strokeWidth={1.75} />
                  </summary>
                  <p className="max-w-[62ch] pb-6 text-[15px] leading-relaxed text-(--chalk-soft)">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Close on the cyan wall, with the price: the last thing before the account. */}
        <section id="pricing" className="lp-wall lp-cyan py-20 sm:py-24 lg:py-32">
          <div id="start" className={`${frame} grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16`}>
            <div>
              <h2 className="font-sarlotte text-[clamp(2.6rem,6vw,5rem)] leading-[0.95] tracking-[-0.02em] text-balance max-w-[16ch]">
                Your next print run can change its mind.
              </h2>
              <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-(--wall-soft)">
                Create an account, make your first code, and send it wherever you
                need, today and in four years when everything else has moved.
              </p>
            </div>

            <div className="lp-board p-5 sm:p-7">
              {PRICE_FROM_NGN === null ? (
                <p className="font-sarlotte text-[2rem] leading-none">Pricing confirmed before launch</p>
              ) : (
                <>
                  <p className="text-sm text-(--chalk-soft)">Plans from</p>
                  <p className="mt-3 flex items-end gap-3">
                    <span className="text-[clamp(1.75rem,5vw,2.5rem)]">
                      <Flaps text={`₦${priceFrom()}`} tone="cyan" />
                    </span>
                    <span className="pb-1 text-sm text-(--chalk-soft)">a month</span>
                  </p>
                </>
              )}
              <ul className="mt-6 space-y-2.5 text-[15px] leading-snug">
                {[
                  "Billed in naira through Paystack, monthly or annually",
                  "A failed payment gets a 7-day grace period",
                  `Cancel and your codes pause, kept safe for ${LAPSE_RETENTION_MONTHS} months`,
                  "Static codes are free on every plan",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-(--green)" strokeWidth={2.25} />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href={SIGN_UP}
                className="lp-btn lp-btn-cyan mt-7 w-full px-6 py-4 text-2xl leading-none"
                data-plain
              >
                Create your first code
              </Link>
              <div className="mt-4 flex items-center justify-between gap-4 text-sm">
                <Link href="/pricing" className="text-(--chalk)">
                  Compare plans
                </Link>
                <Link href="/auth/sign-in" className="text-(--chalk-soft)">
                  I already have an account
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${frame} flex flex-wrap items-center justify-between gap-6 py-10`}>
        <p className="max-w-[52ch] text-xs leading-relaxed text-(--chalk-muted)">
          A{" "}
          <a href={MAIN_SITE} className="text-(--chalk) underline">
            {COMPANY_NAME}
          </a>{" "}
          product, from the studio that prints the thing your code lives on.
        </p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link href="/pricing" className="text-xs text-(--chalk-muted) underline transition-colors duration-150 hover:text-(--chalk)">
            Pricing
          </Link>
          <LegalLinks tone="field" />
          <Wordmark on="dark" width={104} className="opacity-85" />
        </div>
      </footer>
    </div>
  );
}

