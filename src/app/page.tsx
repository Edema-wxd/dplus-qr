import Link from "next/link";
import Image from "next/image";
import { PRODUCT_NAME, COMPANY_NAME, MAIN_SITE } from "@/lib/brand";

/**
 * Root of qriateplus.com. Clients sign in here, and de-signplus.com/qr links
 * across.
 *
 * QRiate+ leads and De Sign Plus reads as the parent brand, which is the right
 * way round on this domain. Swap the text wordmark for the logo file once it
 * is in public/brand/.
 */
export default function Home() {
  // Derived from the constant rather than retyped, so renaming the product
  // stays a one-line change in brand.ts.
  const stem = PRODUCT_NAME.replace(/\+$/, "");
  const raised = PRODUCT_NAME.endsWith("+") ? "+" : "";

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="font-sarlotte text-5xl leading-none">
          {stem}
          <span className="text-dsp-green align-super text-3xl">{raised}</span>
        </h1>

        <p className="mt-6 text-muted-foreground leading-relaxed">
          Dynamic QR codes you can re-point at any time. The printed code never
          changes — only where it leads.
        </p>

        <div className="mt-10 flex items-center gap-3">
          <Link
            href="/auth/sign-up"
            className="rounded-lg bg-foreground px-4 py-2 text-sm text-background"
          >
            Create an account
          </Link>
          <Link
            href="/auth/sign-in"
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
          <span>A</span>
          <Link href={MAIN_SITE} className="inline-flex items-center">
            <Image
              src="/brand/logo-b.svg"
              alt={COMPANY_NAME}
              width={86}
              height={22}
              className="dark:hidden"
            />
            <Image
              src="/brand/logo-w.svg"
              alt={COMPANY_NAME}
              width={86}
              height={22}
              className="hidden dark:block"
            />
          </Link>
          <span>product</span>
        </div>
      </div>
    </main>
  );
}
