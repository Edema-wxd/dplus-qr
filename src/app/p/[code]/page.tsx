import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PRODUCT_NAME } from "@/lib/brand";
import { normaliseCode } from "@/lib/short-code";
import { loadPublicPage, type PublicPage } from "@/lib/public-page";
import type { PageContent } from "@/lib/page-content";
import { LegalLinks } from "@/components/LegalLinks";
import { pageBrand } from "@/lib/qr-style";
import { BrandLogo, PageView } from "./views";

// A scanned page is somebody's menu or business card, not something for a
// search engine to index under this host.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Wholly per-request: the content is the owner's, read fresh on every view so
// an edit reaches the next scanner at once.
export const instant = false;

/**
 * The hosted page a page-type code leads to.
 *
 * A scan arrives here from the redirect path, which has already recorded it,
 * so this page records nothing. It is still a public URL anyone can open, so
 * `loadPublicPage` re-applies the redirect path's own decision and a paused or
 * blocked code is sent to the same status page a scan would meet.
 */
export default async function HostedPage({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code: raw } = await params;
  const code = normaliseCode(raw);
  if (!code) redirect("/not-found-code");

  // Read outside any try/catch around `redirect`, which works by throwing.
  let page: PublicPage;
  try {
    page = await loadPublicPage(code);
  } catch (error) {
    console.error("[page] load failed", error);
    page = { state: "broken" };
  }

  if (page.state === "paused") redirect(`/paused?code=${code}`);
  if (page.state === "blocked") redirect(`/blocked?code=${code}`);
  if (page.state === "not_found") redirect("/not-found-code");
  if (page.state !== "page") redirect("/unavailable");

  // An app code sends a phone straight to its own store. Everyone else -- a
  // computer, an unknown agent -- sees both buttons.
  if (page.kind === "app") {
    const app = page.content as PageContent<"app">;
    const agent = (await headers()).get("user-agent") ?? "";
    if (app.ios && /iPhone|iPad|iPod/i.test(agent)) redirect(app.ios);
    if (app.android && /Android/i.test(agent)) redirect(app.android);
  }

  // The page wears the colours and logo its owner chose for the code itself:
  // the scanner has just pointed a camera at that artwork, so the page they
  // land on should look like it came from the same business.
  const brand = pageBrand(page.style);

  return (
    <main
      className="brand-scope min-h-dvh bg-background px-4 py-8 text-foreground sm:py-12"
      data-branded={brand ? "" : undefined}
      style={
        brand
          ? ({ "--brand": brand.fill, "--brand-ink": brand.ink } as React.CSSProperties)
          : undefined
      }
    >
      <div className="mx-auto w-full max-w-md">
        {page.logoUrl ? <BrandLogo url={page.logoUrl} name={page.ownerName} /> : null}
        <PageView kind={page.kind} content={page.content} code={code} />

        <footer className="mt-12 space-y-4 border-t border-border pt-6 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Shared by {page.ownerName}</span>
            <Link
              href={`/report?code=${encodeURIComponent(code)}`}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Report this page
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            <Link href="/" className="inline-flex items-center" aria-label={PRODUCT_NAME}>
              <Image
                src="/brand/qriate-wordmark.svg"
                alt={PRODUCT_NAME}
                width={84}
                height={35}
                className="h-auto w-[84px] dark:hidden"
              />
              <Image
                src="/brand/qriate-wordmark-light.svg"
                alt={PRODUCT_NAME}
                width={84}
                height={35}
                className="hidden h-auto w-[84px] dark:block"
              />
            </Link>
            <LegalLinks tone="muted" />
          </div>
        </footer>
      </div>
    </main>
  );
}
