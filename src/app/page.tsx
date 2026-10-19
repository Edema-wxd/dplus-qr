import Link from "next/link";
import Image from "next/image";
import { PRODUCT_NAME, COMPANY_NAME, MAIN_SITE } from "@/lib/brand";

/**
 * Root of the redirect host. Clients sign in here (Phase 1), and
 * de-signplus.com/qr links across to this page.
 */
export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Image
          src="/brand/logo-b.svg"
          alt={COMPANY_NAME}
          width={130}
          height={32}
          className="dark:hidden"
          priority
        />
        <Image
          src="/brand/logo-w.svg"
          alt={COMPANY_NAME}
          width={130}
          height={32}
          className="hidden dark:block"
          priority
        />

        <h1 className="font-sarlotte text-4xl mt-8 leading-tight">{PRODUCT_NAME}</h1>

        <p className="mt-4 text-muted-foreground leading-relaxed">
          Dynamic QR codes you can re-point at any time. The printed code never
          changes — only where it leads.
        </p>

        <p className="mt-8 text-sm text-muted-foreground">
          Accounts open in Phase 1. For now,{" "}
          <Link href={MAIN_SITE} className="underline underline-offset-4">
            visit {COMPANY_NAME}
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
