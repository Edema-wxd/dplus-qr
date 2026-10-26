import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { LegalLinks } from "@/components/LegalLinks";

/** Frame for the signed-out auth pages and the account page. */
export function AuthShell({
  heading,
  lede,
  children,
  footer,
  aside,
}: {
  heading: string;
  /** One line under the heading. Phones get this in place of the aside. */
  lede?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Shown beside the form on wide screens, dropped on phones. */
  aside?: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh flex items-stretch">
      {aside ? (
        <div className="hidden lg:flex flex-1 m-4 rounded-2xl bg-coal-grey items-center justify-center p-10">
          {aside}
        </div>
      ) : null}
      <div className="flex-1 flex flex-col items-center justify-start sm:justify-center px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex items-center" aria-label={PRODUCT_NAME}>
            <Image
              src="/brand/qriate-wordmark.svg"
              alt={PRODUCT_NAME}
              width={104}
              height={43}
              className="h-auto w-[104px] dark:hidden"
            />
            <Image
              src="/brand/qriate-wordmark-light.svg"
              alt={PRODUCT_NAME}
              width={104}
              height={43}
              className="hidden h-auto w-[104px] dark:block"
            />
          </Link>

          <h1 className="font-sarlotte text-4xl sm:text-3xl mt-10 sm:mt-8 leading-tight text-balance">
            {heading}
          </h1>
          {lede ? (
            <p className="mt-2 text-base text-muted-foreground lg:hidden">{lede}</p>
          ) : null}

          <div className="mt-8 sm:mt-6">{children}</div>

          {footer ? (
            <div className="mt-8 pt-6 border-t border-border text-base sm:text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}

          {/* Creating an account is agreeing to these, so they are on the form. */}
          <LegalLinks tone="muted" className="mt-6 sm:mt-8" />
        </div>
      </div>
    </main>
  );
}
