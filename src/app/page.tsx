import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  CODE_HOST,
  CODE_ORIGIN,
  COMPANY_NAME,
  MAIN_SITE,
  PRODUCT_NAME,
  PRODUCT_NAME_SPOKEN,
  PRICE_FROM_NGN,
  RETIRED_HOST,
  priceFrom,
} from "@/lib/brand";
import { CONTRACT, DEMO_CODE, FIXED, STATES, YOURS } from "@/lib/landing";
import { QrSymbol, moduleCount } from "./_landing/QrSymbol";
import { CodeDemo } from "./_landing/CodeDemo";
import { LegalLinks } from "@/components/LegalLinks";

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
  title: {
    absolute: `${PRODUCT_NAME} — dynamic QR codes you can re-point at any time`,
  },
  description:
    "Print a QR code once and change where it leads whenever you need to. Naira billing through Paystack. A De Sign Plus product.",
  alternates: { canonical: CODE_ORIGIN },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: CODE_ORIGIN,
    siteName: PRODUCT_NAME,
    locale: "en_NG",
    title: `${PRODUCT_NAME} — print it once, re-point it forever`,
    description:
      "Dynamic QR codes for businesses that print things. The symbol on the packaging never changes; only where it leads.",
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME} — print it once, re-point it forever`,
    description:
      "Dynamic QR codes for businesses that print things. Billed in naira through Paystack.",
  },
};

const codeUrl = `${CODE_ORIGIN}/${DEMO_CODE}`;
const newModules = moduleCount(codeUrl);
const oldModules = moduleCount(`https://${RETIRED_HOST}/${DEMO_CODE}`);

/**
 * The wordmark ships as two vectors rather than one with a CSS filter: the
 * letterforms invert between grounds but the swashes, the QR motif and the
 * raised plus must keep their brand colours, which no filter can do.
 */
function Wordmark({
  on,
  width,
  className,
}: {
  on: "paper" | "field";
  width: number;
  className?: string;
}) {
  return (
    <Image
      src={on === "paper" ? "/brand/qriate-wordmark.svg" : "/brand/qriate-wordmark-light.svg"}
      alt={PRODUCT_NAME}
      width={width}
      height={Math.round((width * 320) / 778)}
      className={`h-auto ${className ?? ""}`}
    />
  );
}

export default function Home() {
  return (
    <div className="lp min-h-dvh">
      <a
        href="#start"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--field-ink)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--field)]"
      >
        Skip to creating an account
      </a>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[var(--field-rule)] bg-[var(--field)]/92 px-7 py-3.5 backdrop-blur-sm sm:px-10 lg:hidden">
        <Wordmark on="field" width={112} />
        <div className="flex items-center gap-1">
          <Link
            href="/pricing"
            className="rounded-lg px-3 py-2 text-sm text-[var(--field-soft)] no-underline transition-colors duration-150 hover:text-[var(--field-ink)]"
            data-plain
          >
            Pricing
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-[var(--field-ink)] px-3.5 py-2 text-sm text-[var(--field)] no-underline"
            data-plain
          >
            Create an account
          </Link>
        </div>
      </header>

      <main>
        {/* The first viewport: paper specimen against ink field, on a 2:3 seam. */}
        <section className="flex flex-col lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[auto_1fr]">
          <CodeDemo
            heading={
              <>
                <h1 className="font-sarlotte text-[clamp(2.75rem,7.5vw,4.9rem)] leading-[0.95] tracking-[-0.02em] text-balance">
                  Print it once.
                  <br />
                  <span className="text-[var(--pin)]">Re-point it forever.</span>
                </h1>
                <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-[var(--field-soft)]">
                  A QR code normally locks your link the moment it goes to press.
                  This one doesn&apos;t. The campaign ends, the menu changes, the
                  whole site moves, and the labels already on the shelf keep
                  working.
                </p>
              </>
            }
          >
            {/*
              The hero symbol encodes the code the caption beneath it prints,
              not the bare origin. It said `qriateplus.com/Ab3kQ9x` while
              encoding `qriateplus.com`, so a visitor who scanned the page's
              central claim was returned to the page instead of being redirected
              by it. The redirect path answers this code from a constant, so the
              scan demonstrates the product rather than the home page.
            */}
            <QrSymbol
              value={codeUrl}
              px={312}
              title={`${PRODUCT_NAME_SPOKEN} — scan to open ${CODE_HOST}/${DEMO_CODE}`}
              className="block h-auto w-[min(72vw,312px)]"
            />
          </CodeDemo>
        </section>

        {/* What is fixed and what is yours — the boundary is the whole offer. */}
        <section className="border-t border-[var(--field-rule)] px-7 py-16 sm:px-10 lg:px-14 lg:py-24">
          <h2 className="max-w-[20ch] font-sarlotte text-[clamp(2rem,4.2vw,3.1rem)] leading-[1.02] tracking-[-0.015em] text-balance">
            Dynamic does not mean fragile.
          </h2>
          <p className="mt-5 max-w-[52ch] leading-relaxed text-[var(--field-soft)]">
            The part you commit to paper is the part nothing can touch. The part
            you were always going to change is the only part that moves.
          </p>

          <div className="mt-12 grid gap-x-14 gap-y-12 md:grid-cols-2">
            {[
              { heading: "Fixed, permanently", rows: FIXED, accent: "var(--field-soft)" },
              { heading: "Yours to change", rows: YOURS, accent: "var(--field-ink)" },
            ].map((column) => (
              <div key={column.heading}>
                <h3
                  className="border-b border-[var(--field-rule)] pb-2.5 text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: column.accent }}
                >
                  {column.heading}
                </h3>
                <dl>
                  {column.rows.map((row) => (
                    <div
                      key={row.what}
                      className="border-b border-[var(--field-rule)]/55 py-4"
                    >
                      <dt className="text-[17px]">{row.what}</dt>
                      <dd className="mt-1 max-w-[44ch] text-sm leading-relaxed text-[var(--field-muted)]">
                        {row.why}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        {/* The arithmetic. Two real symbols, measured, not asserted. */}
        <section className="lp-paper border-t border-[var(--paper-rule)] px-7 py-16 sm:px-10 lg:px-14 lg:py-24">
          <h2 className="max-w-[26ch] font-sarlotte text-[clamp(2rem,4.2vw,3.1rem)] leading-[1.02] tracking-[-0.015em] text-balance">
            A shorter address is a sparser code.
          </h2>
          <p className="mt-5 max-w-[56ch] leading-relaxed text-[var(--paper-soft)]">
            We moved the whole platform onto {CODE_HOST} for one measurable
            reason: {codeUrl.length} characters instead of{" "}
            {`https://${RETIRED_HOST}/${DEMO_CODE}`.length}. Fewer characters
            means fewer modules, and fewer modules means each one is printed
            larger, which is what lets a code survive at thumbnail size on
            packaging.
          </p>

          <div className="mt-12 grid max-w-3xl gap-10 sm:grid-cols-2">
            {[
              {
                host: CODE_HOST,
                url: `${CODE_HOST}/${DEMO_CODE}`,
                modules: newModules,
                value: codeUrl,
                label: "What we print",
                tone: "var(--paper-ink)",
              },
              {
                host: RETIRED_HOST,
                url: `${RETIRED_HOST}/${DEMO_CODE}`,
                modules: oldModules,
                value: `https://${RETIRED_HOST}/${DEMO_CODE}`,
                label: "The subdomain it replaced",
                tone: "var(--paper-soft)",
              },
            ].map((item) => (
              <figure key={item.host} className="m-0">
                <div className="flex items-end gap-5">
                  <QrSymbol
                    value={item.value}
                    px={132}
                    title={`Specimen symbol for ${item.url}`}
                    className="block h-auto w-[132px] shrink-0"
                  />
                  <div className="pb-1">
                    <p
                      className="lp-num font-sarlotte text-[2.6rem] leading-none"
                      style={{ color: item.tone }}
                    >
                      {item.modules}
                      <span className="px-1 text-[1.9rem]">×</span>
                      {item.modules}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-[var(--paper-soft)]">
                      modules
                    </p>
                  </div>
                </div>
                <figcaption className="mt-4 border-t border-[var(--paper-rule)] pt-3">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--paper-soft)]">
                    {item.label}
                  </span>
                  <span className="lp-num mt-1.5 block font-mono text-[13px] text-[var(--paper-ink)]">
                    {item.url}
                  </span>
                  <span className="lp-num mt-0.5 block text-xs text-[var(--paper-soft)]">
                    {item.value.length} characters encoded
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>

          <p className="mt-8 max-w-[56ch] text-xs leading-relaxed text-[var(--paper-soft)]">
            Both symbols above are real and both are generated by the same
            library that produces your downloadable artwork. Quoted at error
            correction level Q, the level a printed code without a logo wants.
            Add a centred logo and both step up a size, which is the honest
            version of this comparison, and the reason the host matters more
            than it looks.
          </p>
        </section>

        {/* The reliability contract. Every line has a test behind it. */}
        <section className="border-t border-[var(--field-rule)] px-7 py-16 sm:px-10 lg:px-14 lg:py-24">
          <h2 className="max-w-[24ch] font-sarlotte text-[clamp(2rem,4.2vw,3.1rem)] leading-[1.02] tracking-[-0.015em] text-balance">
            Built so the print outlives us.
          </h2>
          <p className="mt-5 max-w-[54ch] leading-relaxed text-[var(--field-soft)]">
            One rule governs every decision in this platform: when a choice
            trades redirect reliability for a feature, reliability wins. These
            are the consequences, stated plainly, because a printed code is a
            promise you cannot take back.
          </p>

          <dl className="mt-12 max-w-4xl">
            {CONTRACT.map((item) => (
              <div
                key={item.claim}
                className="grid gap-x-8 gap-y-1.5 border-b border-[var(--field-rule)]/55 py-5 sm:grid-cols-[18rem_1fr] sm:py-6"
              >
                <dt className="text-[17px] leading-snug sm:text-lg">{item.claim}</dt>
                <dd className="max-w-[58ch] text-sm leading-relaxed text-[var(--field-muted)]">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/*
          The failure states, on paper. The subject is the scan side rather than
          the owner's side, so the material changes with the point of view and
          the two-material world holds past the first viewport.
        */}
        <section className="lp-paper border-t border-[var(--paper-rule)] px-7 py-16 sm:px-10 lg:px-14 lg:py-24">
          <h2 className="max-w-[26ch] font-sarlotte text-[clamp(2rem,4.2vw,3.1rem)] leading-[1.02] tracking-[-0.015em] text-balance">
            And when something is wrong, your customer is not blamed for it.
          </h2>
          <p className="mt-5 max-w-[54ch] leading-relaxed text-[var(--paper-soft)]">
            Someone scanned a code in good faith. Whatever has happened behind
            it, they meet a calm page carrying your business&apos;s name and a
            way forward — never a browser error, never a dead end.
          </p>

          <dl className="mt-12 max-w-4xl">
            {STATES.map((state) => (
              <div
                key={state.label}
                className="grid items-baseline gap-x-8 gap-y-2 border-b border-[var(--paper-rule)] py-5 sm:grid-cols-[3rem_13rem_1fr] sm:py-6"
              >
                <span
                  aria-hidden
                  className="hidden h-1 w-10 self-center rounded-full sm:block"
                  style={{ background: `var(--${state.accent}-ink)` }}
                />
                <dt className="flex items-center gap-3 font-sarlotte text-2xl leading-none">
                  <span
                    aria-hidden
                    className="h-1 w-8 rounded-full sm:hidden"
                    style={{ background: `var(--${state.accent}-ink)` }}
                  />
                  {state.label}
                </dt>
                <dd className="max-w-[56ch] text-sm leading-relaxed text-[var(--paper-soft)]">
                  {state.copy}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/*
          Close, on ink. The failure-states section above took paper because its
          subject is the scan side; the account is the owner's side again, so the
          material changes back and the page arrives somewhere rather than
          running out on a second light band.
        */}
        <section
          id="start"
          className="scroll-mt-20 border-t border-[var(--paper-rule)] px-7 py-20 sm:px-10 lg:px-14 lg:py-28"
        >
          <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-end">
            <div>
              <h2 className="max-w-[18ch] font-sarlotte text-[clamp(2.4rem,5.4vw,4rem)] leading-[0.98] tracking-[-0.02em] text-balance">
                Take the code. Keep the print.
              </h2>
              <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-[var(--field-muted)]">
                Create an account, make your first code, and send it wherever you
                need, today and in four years when everything else has moved.
              </p>
            </div>

            <div>
              {PRICE_FROM_NGN === null ? (
                <p className="border-t border-[var(--field-ink)] pt-4 font-sarlotte text-[2.1rem] leading-none">
                  Pricing confirmed
                  <br />
                  before launch
                </p>
              ) : (
                <p className="lp-num border-t border-[var(--field-ink)] pt-4 font-sarlotte text-[2.1rem] leading-none">
                  Plans from ₦{priceFrom()}
                  <span className="pl-1.5 font-sans text-base tracking-normal text-[var(--field-muted)]">
                    /month
                  </span>
                </p>
              )}
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--field-muted)]">
                Billed in naira through Paystack, monthly or annually. Cancel and
                your codes pause. They are never deleted out from under your
                printed material.
              </p>
              <Link
                href="/pricing"
                className="mt-2 inline-block text-sm text-[var(--field-ink)]"
              >
                Compare plans
              </Link>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/auth/sign-up"
                  className="rounded-lg bg-[var(--field-ink)] px-5 py-3 font-sarlotte text-xl text-[var(--field)] no-underline transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.97]"
                  data-plain
                >
                  Create an account
                </Link>
                <Link
                  href="/auth/sign-in"
                  className="rounded-lg border border-[var(--field-rule)] px-5 py-3 text-sm text-[var(--field-ink)] no-underline transition-colors duration-150 hover:border-[var(--field-ink)]"
                  data-plain
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-6 px-7 py-10 sm:px-10 lg:px-14">
        <div className="flex items-center gap-2.5 text-xs text-[var(--field-muted)]">
          <span>A</span>
          <Link
            href={MAIN_SITE}
            className="text-[var(--field-ink)] underline underline-offset-4 opacity-90 transition-opacity duration-150 hover:opacity-100"
          >
            {COMPANY_NAME}
          </Link>
          <span>product: the studio that prints the thing your code lives on.</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link
            href="/pricing"
            className="text-xs text-[var(--field-muted)] underline underline-offset-4 transition-colors duration-150 hover:text-[var(--field-ink)]"
          >
            Pricing
          </Link>
          <LegalLinks tone="field" />
          <Wordmark on="field" width={104} className="opacity-85" />
        </div>
      </footer>
    </div>
  );
}
