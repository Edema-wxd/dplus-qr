import Image from "next/image";
import Link from "next/link";
import { LegalLinks } from "@/components/LegalLinks";
import { COMPANY_NAME, MAIN_SITE, PRODUCT_NAME } from "@/lib/brand";
import { FEED_URL } from "@/lib/blog-seo";

/** The blog shares the landing page's gutters and maximum width. */
export const frame = "mx-auto w-full max-w-[86rem] px-5 sm:px-10 lg:px-16";

function Wordmark({ width, className, priority }: { width: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/qriate-wordmark-light.svg"
      alt={PRODUCT_NAME}
      width={width}
      height={Math.round((width * 320) / 778)}
      className={`h-auto ${className ?? ""}`}
      priority={priority}
    />
  );
}

const navLink =
  "rounded-lg px-3 py-2 text-sm no-underline transition-colors duration-150 hover:text-(--chalk)";

/**
 * The concourse header, as on the landing page, with the blog marked as the
 * current place. Sticky, with the same scroll scrim, so a long post keeps its
 * way home in reach.
 */
export function BlogHeader({ current }: { current: "index" | "post" }) {
  return (
    <header className="post-chrome sticky top-0 z-40 border-b border-white/10 bg-(--ink)/95 backdrop-blur-sm">
      <div className={`${frame} flex items-center justify-between gap-4 py-3`}>
        <Link href="/" aria-label={`${PRODUCT_NAME} home`} data-plain>
          <Wordmark width={116} priority />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1.5">
          <Link
            href="/blog"
            aria-current={current === "index" ? "page" : undefined}
            className={`${navLink} ${current === "index" ? "text-(--chalk)" : "text-(--chalk-soft)"}`}
            data-plain
          >
            Blog
          </Link>
          <Link href="/pricing" className={`${navLink} hidden text-(--chalk-soft) sm:inline-flex`} data-plain>
            Pricing
          </Link>
          <Link href="/auth/sign-in" className={`${navLink} hidden text-(--chalk-soft) sm:inline-flex`} data-plain>
            Sign in
          </Link>
          <Link href="/auth/sign-up" className="lp-btn lp-btn-cyan ml-1 px-4 py-2.5 text-[17px] leading-none" data-plain>
            Create a code
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function BlogFooter() {
  return (
    <footer className={`post-chrome ${frame} flex flex-wrap items-center justify-between gap-6 py-10`}>
      <p className="max-w-[52ch] text-xs leading-relaxed text-(--chalk-muted)">
        A{" "}
        <a href={MAIN_SITE} className="text-(--chalk) underline">
          {COMPANY_NAME}
        </a>{" "}
        product, from the studio that prints the thing your code lives on.
      </p>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <nav aria-label="Blog and pricing" className="flex items-center gap-x-4 text-xs">
          <Link href="/blog" className="text-(--chalk-muted) underline transition-colors duration-150 hover:text-(--chalk)">
            Blog
          </Link>
          <a href={FEED_URL} className="text-(--chalk-muted) underline transition-colors duration-150 hover:text-(--chalk)">
            RSS feed
          </a>
          <Link href="/pricing" className="text-(--chalk-muted) underline transition-colors duration-150 hover:text-(--chalk)">
            Pricing
          </Link>
        </nav>
        <LegalLinks tone="field" />
        <Wordmark width={104} className="opacity-85" />
      </div>
    </footer>
  );
}
