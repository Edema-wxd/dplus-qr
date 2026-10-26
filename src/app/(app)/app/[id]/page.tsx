import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { CODE_HOST, codeUrl } from "@/lib/brand";
import { canExportCsv, getEntitlement } from "@/lib/entitlement";
import {
  codeAnalytics,
  destinationHistory,
  getCode,
  parseCodeId,
  ANALYTICS_WINDOWS,
} from "@/lib/user-codes";
import { QrSymbol } from "@/app/_landing/QrSymbol";
import { DashShell, secondaryButtonClass } from "../DashShell";
import { StatusPill } from "../StatusPill";
import { DestinationForm, RenameForm, StatusForm } from "./CodeControls";
import { AnalyticsPanel } from "./Analytics";
import { StyleForm, StyleScope } from "./StyleControls";
import { CopyLink } from "../CopyLink";
import { LogoForm } from "./LogoForm";
import { listLogos } from "@/lib/logos";
import { uploadsEnabled } from "@/lib/uploads";

export const metadata: Metadata = { title: "Code" };
export const instant = false;

export default async function CodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;

  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  // Parsed before it reaches a query: the id column is a bigint, so a
  // non-numeric path segment is a database error rather than an empty result.
  const id = parseCodeId(raw);
  if (!id) notFound();

  // The id is still a guess until the database agrees it belongs to this
  // session: every query below filters by user_id, and a miss is a 404 rather
  // than a "not yours", which would confirm the row exists.
  const code = await getCode(user.id, id);
  if (!code) notFound();

  const [history, entitlement, library, windows] = await Promise.all([
    destinationHistory(user.id, id),
    getEntitlement(user.id),
    listLogos(user.id),
    Promise.all(
      ANALYTICS_WINDOWS.map(async (days) => ({
        days,
        data: await codeAnalytics(user.id, id, days),
      }))
    ),
  ]);

  const exportable = canExportCsv(entitlement);
  const url = codeUrl(code.shortCode);

  // The code's own logo is offered even after it leaves the library, so the
  // picker never shows a code as having no logo when it has one.
  const logos = library.map(({ id, url, name }) => ({ id, url, name }));
  if (code.logo && !logos.some((logo) => logo.id === code.logo?.id)) {
    logos.unshift({ id: code.logo.id, url: code.logo.url, name: "Current logo" });
  }

  return (
    <DashShell
      heading={code.name}
      back={{ href: "/app", label: "All codes" }}
      meta={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="dash-num font-mono">
            {CODE_HOST}/{code.shortCode}
          </span>
          <CopyLink url={url} />
          <StatusPill status={code.status} />
        </span>
      }
    >
      {code.status === "blocked" ? (
        <p
          role="alert"
          className="mb-8 rounded-lg border border-[var(--struck-ink)]/40 bg-white px-4 py-3 text-sm leading-relaxed"
        >
          <strong className="font-medium">This code is blocked.</strong>{" "}
          {code.blockedReason ??
            "Its destination was found to be unsafe."}{" "}
          Scans meet a page explaining that, and only support can restore it.
        </p>
      ) : null}

      {/*
        The scope wraps both columns: it holds the colours being previewed, so
        the specimen on the left recolours as the form on the right changes.
      */}
      <StyleScope
        initial={code.style}
        className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-14"
      >
        {/* The specimen, built exactly as the landing page builds it. */}
        <div>
          <div className="rounded-lg border border-[var(--paper-rule)] bg-white p-6">
            <QrSymbol
              value={url}
              px={248}
              title={`QR code for ${code.name}`}
              logoUrl={code.logo?.url}
              className="mx-auto block h-auto w-full max-w-[248px]"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/app/${code.id}/qr?format=svg`}
              download
              className={secondaryButtonClass}
            >
              SVG
            </a>
            <a
              href={`/app/${code.id}/qr?format=png&size=1024`}
              download
              className={secondaryButtonClass}
            >
              PNG 1024
            </a>
            <a
              href={`/app/${code.id}/qr?format=png&size=2048`}
              download
              className={secondaryButtonClass}
            >
              PNG 2048
            </a>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--paper-soft)]">
            SVG for print — it stays sharp at any size. The symbol encodes{" "}
            <span className="font-mono">{url}</span>, never the destination,
            which is what lets you re-point it later.
          </p>
        </div>

        <div className="space-y-10">
          <DestinationForm
            id={code.id}
            current={code.destinationUrl}
            disabled={code.status === "blocked"}
          />
          <RenameForm id={code.id} current={code.name} />
          <StyleForm id={code.id} saved={code.style} />
          <LogoForm
            id={code.id}
            current={code.logo?.id ?? null}
            logos={logos}
            uploads={uploadsEnabled()}
          />
          {code.status === "blocked" ? null : (
            <StatusForm id={code.id} status={code.status} />
          )}
        </div>
      </StyleScope>

      <hr className="my-12 border-[var(--paper-rule)]" />

      <AnalyticsPanel windows={windows} />

      <div className="mt-6">
        {exportable.ok ? (
          <a
            href={`/app/${code.id}/export?days=30`}
            download
            className={secondaryButtonClass}
          >
            Export 30 days as CSV
          </a>
        ) : (
          /*
            Named rather than hidden. A plan limit the customer cannot see is
            the kind of thing that gets reported as a missing feature, and the
            route refuses the download anyway -- so this says which plans
            include it and links to the page that changes plans.
          */
          <p className="max-w-[52ch] text-sm leading-relaxed text-[var(--paper-soft)]">
            {exportable.reason}{" "}
            <Link href="/billing" className="underline underline-offset-4">
              See plans
            </Link>
            .
          </p>
        )}
      </div>

      {history.length > 0 ? (
        <>
          <hr className="my-12 border-[var(--paper-rule)]" />
          <section aria-labelledby="history-heading">
            <h2
              id="history-heading"
              className="font-sarlotte text-2xl leading-none"
            >
              Where it has pointed
            </h2>
            <p className="mt-2 text-sm text-[var(--paper-soft)]">
              Every change, kept for as long as the code exists.
            </p>
            <ol className="mt-5">
              {history.map((entry) => (
                <li
                  key={`${entry.changedAt.toISOString()}-${entry.newUrl}`}
                  className="grid gap-x-5 gap-y-1 border-b border-[var(--paper-rule)] py-3 sm:grid-cols-[9rem_1fr]"
                >
                  <time
                    dateTime={entry.changedAt.toISOString()}
                    className="dash-num text-xs text-[var(--paper-soft)]"
                  >
                    {entry.changedAt.toLocaleDateString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                  <div className="min-w-0 text-sm">
                    <span className="block truncate font-mono text-xs">
                      {entry.newUrl}
                    </span>
                    {entry.oldUrl ? (
                      <span className="block truncate font-mono text-xs text-[var(--paper-soft)] line-through">
                        {entry.oldUrl}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </DashShell>
  );
}
