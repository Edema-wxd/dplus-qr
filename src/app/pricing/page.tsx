import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  CODE_ORIGIN,
  COMPANY_NAME,
  MAIN_SITE,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  priceFrom,
} from "@/lib/brand";
import { listPublicPlans } from "@/lib/plans";
import { groupTiers, type Tier } from "@/lib/plan-tiers";
import { LegalLinks } from "@/components/LegalLinks";
import { getPricingContent } from "@/lib/site-content";
import { POLICY_KEYS, type PricingContent } from "@/lib/pricing-content";
import { PricingTiers } from "./PricingTiers";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${PRODUCT_NAME} plans from ₦${priceFrom()} a month, billed in naira through Paystack, monthly or annually.`,
  alternates: { canonical: `${CODE_ORIGIN}/pricing` },
  // The root layout marks the host noindex; this page wants to be found, for
  // the same reason the landing page does.
  robots: { index: true, follow: true },
};

/**
 * The public pricing page.
 *
 * The tiers are read from `qr_plans`, the rows checkout charges, so this page
 * cannot advertise a price the billing page would not take. That makes the
 * table per-request: the shell is static and the table streams in behind
 * Suspense, which also keeps `next build` from needing a database.
 *
 * On the paper surface of the legal pages, because it is read the same way --
 * carefully, by someone deciding whether to pay -- and links to them.
 *
 * Its wording is edited at `/admin/pricing` (`src/lib/site-content.ts`) and
 * read per request. The billing points are the same text as the matching
 * Terms clauses, so the two pages cannot disagree.
 */
export const instant = false;

export default async function PricingPage() {
  await connection();
  const content = await getPricingContent();

  return (
    <div className="legal min-h-dvh">
      <header className="border-b border-[var(--paper-rule)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <Link href="/" className="inline-flex items-center" aria-label={PRODUCT_NAME}>
            <Image
              src="/brand/qriate-wordmark.svg"
              alt={PRODUCT_NAME}
              width={104}
              height={43}
              className="h-auto w-[96px]"
            />
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <Link href="/" className="text-[var(--paper-soft)] underline underline-offset-4 hover:text-[var(--paper-ink)]">
              Home
            </Link>
            <span aria-current="page" className="text-[var(--paper-ink)]">
              Pricing
            </span>
            <Link href="/auth/sign-in" className="text-[var(--paper-soft)] underline underline-offset-4 hover:text-[var(--paper-ink)]">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--paper-soft)]">
          {PRODUCT_NAME} · {COMPANY_NAME}
        </p>
        <h1 className="mt-3 font-sarlotte text-[clamp(2.2rem,6vw,3.2rem)] leading-[1.02] tracking-[-0.015em] text-balance">
          {content.headline}
        </h1>
        <p className="mt-4 max-w-[56ch] whitespace-pre-line text-[17px] leading-relaxed text-[var(--paper-soft)]">
          {content.intro}
        </p>

        <div className="mt-10">
          <Suspense fallback={<TableLoading />}>
            <Tiers content={content} />
          </Suspense>
        </div>

        <section aria-labelledby="terms-heading" className="mt-14 border-t border-[var(--paper-rule)] pt-7">
          <h2 id="terms-heading" className="font-sarlotte text-[1.65rem] leading-tight tracking-[-0.01em]">
            {content.billingHeading}
          </h2>
          <dl className="mt-4 max-w-[68ch]">
            {[
              ...POLICY_KEYS.map((key) => content.policy[key]),
              ...content.faqs.map((faq) => ({ term: faq.question, detail: faq.answer })),
            ].map((row, i) => (
              <div key={`${i}-${row.term}`} className="border-b border-[var(--paper-rule)]/60 py-3.5 last:border-b-0">
                <dt className="font-medium">{row.term}</dt>
                <dd className="mt-1 whitespace-pre-line leading-relaxed text-[var(--paper-soft)]">{row.detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-[var(--paper-soft)]">
            The full position is in the{" "}
            <Link href="/terms" className="underline underline-offset-4 hover:text-[var(--paper-ink)]">
              terms
            </Link>
            . Questions before you buy:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4 hover:text-[var(--paper-ink)]">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--paper-rule)] pt-7 text-sm text-[var(--paper-soft)]">
          <p>
            A{" "}
            <Link href={MAIN_SITE} className="underline underline-offset-4 hover:text-[var(--paper-ink)]">
              {COMPANY_NAME}
            </Link>{" "}
            product.
          </p>
          <LegalLinks tone="paper" />
        </footer>
      </main>
    </div>
  );
}

async function Tiers({ content }: { content: PricingContent }) {
  await connection();
  let tiers: Tier[];
  try {
    tiers = groupTiers(await listPublicPlans());
  } catch (error) {
    // A public page must not fail because the database blinked. It says where
    // prices start, which is fixed in brand.ts, and how to ask.
    console.error("[pricing] could not read plans", error);
    tiers = [];
  }
  if (tiers.length === 0) return <TableFallback />;
  return <PricingTiers tiers={tiers} content={content} />;
}

/** Three empty cards, the table's own footprint, so the page does not jump. */
function TableLoading() {
  return (
    <div aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-80 rounded-lg border border-[var(--paper-rule)] bg-white" />
      ))}
    </div>
  );
}

function TableFallback() {
  return (
    <div className="rounded-lg border border-[var(--paper-rule)] bg-white px-6 py-10 text-center">
      <p className="font-sarlotte text-2xl">Plans from ₦{priceFrom()} a month</p>
      <p className="mt-2 text-sm text-[var(--paper-soft)]">
        <Link href="/auth/sign-up" className="underline underline-offset-4">
          Create an account
        </Link>{" "}
        to see every plan, or email{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-4">
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
