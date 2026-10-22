import Link from "next/link";
import { QrMark } from "@/components/QrMark";
import { BrandFooter } from "@/components/BrandFooter";
import { CODE_HOST } from "@/lib/brand";

/**
 * A URL on this host that is neither a page nor a code.
 *
 * Single-segment paths never reach here -- `[code]/route.ts` matches them and
 * sends an unknown code to `/not-found-code`, which is written for someone
 * holding printed material. This page is for the other case: a mistyped or
 * stale link into the app, so it points at the places a person actually meant
 * to be, and mentions the code shape in case they were typing one by hand.
 */
export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <QrMark size="lg" animated={false} className="text-muted-foreground" />

        <h1 className="font-sarlotte text-3xl mt-6 leading-tight">
          This page does not exist
        </h1>

        <div className="mt-4 space-y-4 text-muted-foreground leading-relaxed">
          <p>
            The address you followed is not a page on {CODE_HOST}. It may have
            changed, or the link may have been cut short.
          </p>
          <p>
            If you were typing a code from printed material, it is seven
            characters straight after the slash — nothing else in between.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-foreground px-4 py-2 text-sm text-background"
          >
            Go to the home page
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-10 pt-6 border-t border-border">
          <BrandFooter />
        </div>
      </div>
    </main>
  );
}
