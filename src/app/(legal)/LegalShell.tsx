import Image from "next/image";
import Link from "next/link";
import {
  COMPANY_NAME,
  MAIN_SITE,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
} from "@/lib/brand";
import { LEGAL_PAGES, type LegalBlock, type LegalDocument } from "@/lib/legal";

/**
 * The frame shared by the three legal documents.
 *
 * One surface for all of them, because they cross-reference each other
 * constantly and a reader moving between them should not feel they have
 * changed site. It takes the landing page's paper material rather than the
 * system colour scheme: these pages are read start to finish, often printed,
 * and a document that inverts with the operating system is harder to cite
 * than one that always looks the same.
 *
 * Nothing here reads a request API, so under Cache Components all three pages
 * are evaluated at build time and ship as static markup.
 */
export function LegalShell({ doc }: { doc: LegalDocument }) {
  return (
    <div className="legal min-h-dvh">
      <a
        href="#document"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--paper-ink)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--paper)]"
      >
        Skip to the document
      </a>

      <header className="border-b border-[var(--paper-rule)] px-6 py-4 sm:px-10">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <Link href="/" className="inline-flex items-center" aria-label={PRODUCT_NAME}>
            <Image
              src="/brand/qriate-wordmark.svg"
              alt={PRODUCT_NAME}
              width={104}
              height={43}
              className="h-auto w-[96px]"
            />
          </Link>

          {/* The other two documents, always one tap away. */}
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {LEGAL_PAGES.map((page) =>
              page.slug === doc.slug ? (
                <span key={page.slug} aria-current="page" className="text-[var(--paper-ink)]">
                  {page.label}
                </span>
              ) : (
                <Link
                  key={page.slug}
                  href={page.href}
                  className="text-[var(--paper-soft)] underline underline-offset-4 transition-colors duration-150 hover:text-[var(--paper-ink)]"
                >
                  {page.label}
                </Link>
              )
            )}
          </nav>
        </div>
      </header>

      <main id="document" className="mx-auto max-w-3xl px-6 py-12 sm:px-10 sm:py-16">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--paper-soft)]">
          {PRODUCT_NAME} · {COMPANY_NAME}
        </p>
        <h1 className="mt-3 font-sarlotte text-[clamp(2.2rem,6vw,3.2rem)] leading-[1.02] tracking-[-0.015em] text-balance">
          {doc.title}
        </h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-[var(--paper-soft)]">
          {doc.standfirst}
        </p>
        <p className="mt-6 border-t border-[var(--paper-rule)] pt-3 text-sm text-[var(--paper-soft)]">
          In effect from {doc.effective}
        </p>

        {/*
          A contents list rather than a sidebar: these documents are cited in
          support replies by section, and an anchor list is the one navigation
          that survives being read on a phone and printed on paper.
        */}
        <nav aria-label="Contents" className="mt-10">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-[var(--paper-soft)]">
            Contents
          </h2>
          <ol className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            {doc.sections.map((section, index) => (
              <li key={section.id} className="flex gap-2.5">
                <span className="legal-num shrink-0 text-[var(--paper-soft)]">
                  {index + 1}.
                </span>
                <a
                  href={`#${section.id}`}
                  className="underline decoration-[var(--paper-rule)] underline-offset-4 transition-colors duration-150 hover:decoration-[var(--paper-ink)]"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {doc.sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            className="mt-12 scroll-mt-8 border-t border-[var(--paper-rule)] pt-7"
          >
            <h2 className="flex gap-3 font-sarlotte text-[1.65rem] leading-tight tracking-[-0.01em]">
              <span className="legal-num pt-0.5 text-[1.1rem] text-[var(--paper-soft)]">
                {index + 1}
              </span>
              {section.heading}
            </h2>
            <div className="mt-4 space-y-4">
              {section.blocks.map((block, blockIndex) => (
                <Block key={blockIndex} block={block} />
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-14 border-t border-[var(--paper-rule)] pt-7 text-sm leading-relaxed text-[var(--paper-soft)]">
          <p>
            {doc.title} for {PRODUCT_NAME}, a{" "}
            <Link
              href={MAIN_SITE}
              className="underline underline-offset-4 hover:text-[var(--paper-ink)]"
            >
              {COMPANY_NAME}
            </Link>{" "}
            product. Anything here that is unclear, or looks wrong:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="underline underline-offset-4 hover:text-[var(--paper-ink)]"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
          <nav aria-label="Legal" className="mt-5 flex flex-wrap gap-x-5 gap-y-1">
            {LEGAL_PAGES.map((page) => (
              <Link
                key={page.slug}
                href={page.href}
                className="underline underline-offset-4 hover:text-[var(--paper-ink)]"
              >
                {page.label}
              </Link>
            ))}
            <Link href="/" className="underline underline-offset-4 hover:text-[var(--paper-ink)]">
              Home
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "p") {
    return <p className="max-w-[68ch] leading-relaxed">{block.text}</p>;
  }

  if (block.kind === "list") {
    return (
      <ul className="max-w-[68ch] space-y-2.5">
        {block.items.map((item) => (
          <li key={item} className="flex gap-3 leading-relaxed">
            <span
              aria-hidden
              className="mt-[0.65em] h-1 w-2.5 shrink-0 rounded-full bg-[var(--paper-rule)]"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <dl className="max-w-[68ch]">
      {block.rows.map((row) => (
        <div key={row.term} className="border-b border-[var(--paper-rule)]/60 py-3.5 last:border-b-0">
          <dt className="font-medium">{row.term}</dt>
          <dd className="mt-1 leading-relaxed text-[var(--paper-soft)]">{row.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
