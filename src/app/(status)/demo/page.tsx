import type { Metadata } from "next";
import Link from "next/link";
import { StatusShell } from "../StatusShell";
import { CODE_HOST, PRODUCT_NAME } from "@/lib/brand";
import { DEMO_CODE } from "@/lib/demo-code";

/**
 * Where a scan of the landing page's specimen lands.
 *
 * It sits with the status pages because it is the same kind of page -- someone
 * pointed a camera at a printed symbol and this is what came back -- and it
 * reuses their frame so the tone and the furniture match. It differs in one
 * way that matters: nothing has gone wrong here. The scan worked, and the page
 * says so before it says anything else.
 *
 * Wholly static, with no request API and no lookup, so it prerenders and
 * reaches a phone on a weak connection immediately.
 */
export const metadata: Metadata = {
  title: "You scanned the specimen",
  // The landing page is the one page on this host that wants to be found; this
  // is a destination for a camera, not for a crawler.
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <StatusShell accent="blue" heading="That worked — and that is the whole point">
      <p>
        You scanned <span className="font-mono">{CODE_HOST}/{DEMO_CODE}</span>,
        the specimen on our front page. It is a real {PRODUCT_NAME} code, and it
        brought you here.
      </p>
      <p>
        Nothing about the symbol you just scanned can change again. Where it
        leads can, at any time, in seconds — which is what a code of your own
        gets you: print it once on packaging, labels or signage, then re-point
        it for the rest of its life.
      </p>
      <p>
        <Link href="/" className="underline">
          Read how it works
        </Link>{" "}
        or{" "}
        <Link href="/auth/sign-up" className="underline">
          create an account
        </Link>
        .
      </p>
    </StatusShell>
  );
}
