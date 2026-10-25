import Link from "next/link";
import { LEGAL_PAGES } from "@/lib/legal";

/**
 * The three legal documents, linked from every surface a visitor can reach.
 *
 * One component rather than three links copied into four shells: the set grows
 * (a cookie notice, a DPA) and a footer that has fallen behind is the kind of
 * omission a payment provider's review notices before we do.
 *
 * `tone` exists because the shells do not agree on a ground -- the landing
 * footer and the dashboard header are ink, the status pages are paper -- and
 * these links must stay legible on both.
 */
export function LegalLinks({
  tone = "paper",
  className = "",
}: {
  tone?: "paper" | "field" | "muted";
  className?: string;
}) {
  const colour = {
    paper: "text-[var(--paper-soft)] hover:text-[var(--paper-ink)]",
    field: "text-[var(--field-muted)] hover:text-[var(--field-ink)]",
    muted: "text-muted-foreground hover:text-foreground",
  }[tone];

  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${className}`}
    >
      {LEGAL_PAGES.map((page) => (
        <Link
          key={page.slug}
          href={page.href}
          className={`underline underline-offset-4 transition-colors duration-150 ${colour}`}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
