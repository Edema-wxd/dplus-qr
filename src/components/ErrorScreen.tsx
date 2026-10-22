import { BrandFooter } from "./BrandFooter";

/**
 * Shared frame for every error screen, shaped like `StatusShell` so a failure
 * looks like the rest of the host rather than like a crash.
 *
 * Presentational only, and it imports nothing server-only, so the client
 * component that every `error.tsx` has to be can render it directly.
 *
 * `reference` is the error digest Next.js generates. Showing it is the one
 * genuinely useful thing an error page can offer: it is the key that matches
 * this failure to a line in the server logs when someone writes in about it.
 */
export function ErrorScreen({
  accent = "red",
  heading,
  children,
  action,
  reference,
}: {
  accent?: "yellow" | "red" | "blue";
  heading: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  reference?: string;
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

        {action ? <div className="mt-8 flex flex-wrap items-center gap-3">{action}</div> : null}

        {reference ? (
          <p className="mt-6 text-xs text-muted-foreground">
            Reference: <span className="font-mono break-all">{reference}</span>
          </p>
        ) : null}

        <div className="mt-10 pt-6 border-t border-border">
          <BrandFooter />
        </div>
      </div>
    </main>
  );
}

export const retryButtonClass =
  "rounded-lg bg-foreground px-4 py-2 text-sm text-background";
export const secondaryButtonClass =
  "rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted";

/**
 * Pulls the digest out of whatever was thrown.
 *
 * Next.js forwards an `Error` with a `digest` for a failure in a Server
 * Component, but a value thrown in a Client Component arrives exactly as it
 * was thrown and may not be an Error at all, so nothing here assumes a shape.
 * The message itself is never shown: in production it is generic, and in
 * development it can carry details that do not belong on a page.
 */
export function errorReference(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.length > 0 ? digest : undefined;
}
