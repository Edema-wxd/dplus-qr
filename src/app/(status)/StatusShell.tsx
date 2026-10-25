import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { LegalLinks } from "@/components/LegalLinks";

/**
 * Shared frame for every status page. Deliberately calm: the person reading it
 * scanned a code in good faith and is not at fault, so the tone explains and
 * offers a way forward rather than reporting an error.
 *
 * Everything here is static, so it prerenders into a shell and reaches a phone
 * on a weak connection immediately. Anything that depends on the request --
 * the code reference, the owner's name -- is passed in as `detail` and streamed
 * by the caller inside a <Suspense> boundary.
 */
export function StatusShell({
  accent,
  heading,
  children,
  detail,
}: {
  accent: "yellow" | "red" | "blue";
  heading: string;
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  const accentClass = {
    yellow: "bg-dsp-yellow",
    red: "bg-dsp-red",
    blue: "bg-dsp-blue",
  }[accent];

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className={`h-1.5 w-16 rounded-full ${accentClass}`} aria-hidden />

        <h1 className="font-sarlotte text-3xl mt-6 leading-tight">{heading}</h1>

        <div className="mt-4 space-y-4 text-muted-foreground leading-relaxed">
          {children}
        </div>

        {detail ? <div className="mt-6">{detail}</div> : null}

        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 pt-6 border-t border-border">
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
          {/*
            A scanner who has landed here is being asked to trust an unfamiliar
            host, so the documents that say what this host does with their scan
            are reachable from the page itself, not only from the landing page.
          */}
          <LegalLinks tone="muted" />
        </div>
      </div>
    </main>
  );
}

/** The code reference plus the report link, shown once the code is known. */
export function CodeFooter({ code }: { code: string | undefined }) {
  if (!code) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>
        Code reference: <span className="font-mono">{code}</span>
      </span>
      <Link
        href={`/report?code=${encodeURIComponent(code)}`}
        className="underline underline-offset-4 hover:text-foreground"
      >
        Report this link
      </Link>
    </div>
  );
}

/** Reserves the footer's height so the shell does not jump when it streams in. */
export function DetailFallback() {
  return <div className="h-4" aria-hidden />;
}
