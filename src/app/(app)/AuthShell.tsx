import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";

/** Frame for the signed-out auth pages and the account page. */
export function AuthShell({
  heading,
  children,
  footer,
  aside,
}: {
  heading: string;
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
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
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

          <h1 className="font-sarlotte text-3xl mt-8 leading-tight">{heading}</h1>

          <div className="mt-6">{children}</div>

          {footer ? (
            <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export const fieldClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm";
export const buttonClass =
  "w-full rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-60";
