import Image from "next/image";
import Link from "next/link";
import { COMPANY_NAME, MAIN_SITE } from "@/lib/brand";

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

        <div className="mt-10 pt-6 border-t border-border">
          <Link href={MAIN_SITE} className="inline-flex items-center">
            <Image
              src="/brand/logo-b.svg"
              alt={COMPANY_NAME}
              width={110}
              height={28}
              className="dark:hidden"
            />
            <Image
              src="/brand/logo-w.svg"
              alt={COMPANY_NAME}
              width={110}
              height={28}
              className="hidden dark:block"
            />
          </Link>
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
