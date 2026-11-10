import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { resolveAccess, resolveScope } from "@/lib/resolve-scope";
import { roleAllows } from "@/lib/account-scope";
import { ReadOnlyNote } from "../TeamNotices";
import { CODE_HOST, codeUrl } from "@/lib/brand";
import {
  canExportCsv,
  canSeeInsights,
  canShareStats,
  canUploadVideo,
  chartDaysAllowed,
  chartWindows,
  getEntitlement,
} from "@/lib/entitlement";
import { getLiveShare } from "@/lib/stat-shares";
import { env } from "@/lib/env";
import {
  codeAnalytics,
  codeFeedback,
  destinationHistory,
  getCode,
  parseCodeId,
} from "@/lib/user-codes";
import { LONGEST_DAILY_WINDOW } from "@/lib/chart-buckets";
import { cachedMatrix } from "@/app/_landing/QrSymbol";
import { DashShell } from "../DashShell";
import { secondaryButtonClass } from "@/components/controls";
import { StatusPill } from "../StatusPill";
import { DestinationForm, RenameForm, StatusForm } from "./CodeControls";
import { AnalyticsPanel } from "./Analytics";
import { LockIcon, LockedButton } from "../UpgradePrompt";
import { listPublicPlans } from "@/lib/plans";
import { featureOffer, historyOffer, type UpgradeOffer } from "@/lib/upgrade-offers";
import { LiveRefresh } from "./LiveRefresh";
import { SharePanel } from "./SharePanel";
import { LiveSymbol, StyleForm, StyleScope } from "./StyleControls";
import { CopyLink } from "../CopyLink";
import { LogoForm } from "./LogoForm";
import { PRESET_PREFIX } from "@/lib/preset-logos";
import { listLogos } from "@/lib/logos";
import { uploadsEnabled } from "@/lib/uploads";
import { dynamicType, isPageKind, pagePath } from "@/lib/qr-types";
import { ContentForm } from "./ContentForm";

export const metadata: Metadata = { title: "Code" };
export const instant = false;

export default async function CodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;

  // Before the session read, as on every dashboard page. Without it Next
  // prerenders this page's shell, and when the session read has to ask Neon
  // Auth (its five-minute cache has run out) that fetch starts inside the
  // prerender and is cut off when it ends: "During prerendering, fetch()
  // rejects when the prerender is complete" in production.
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");
  // Which account this page shows, and as whom. Its own unless the person
  // is working in a team they belong to; every read below proves access.
  const scope = await resolveScope();
  if (!scope) redirect("/auth/sign-in");
  const canWrite = roleAllows(scope.role, "write");
  const access = canWrite ? null : await resolveAccess();

  // Parsed before it reaches a query: the id column is a bigint, so a
  // non-numeric path segment is a database error rather than an empty result.
  const id = parseCodeId(raw);
  if (!id) notFound();

  // The id is still a guess until the database agrees it belongs to this
  // session: every query below filters by user_id, and a miss is a 404 rather
  // than a "not yours", which would confirm the row exists.
  const code = await getCode(scope, id);
  if (!code) notFound();

  const page = isPageKind(code.kind) ? code.kind : null;

  // Read first: what the plan includes decides which analytics are queried
  // at all. A window or panel the plan does not cover is never computed, so
  // the page cannot leak it.
  const entitlement = await getEntitlement(scope.accountId);
  const insights = canSeeInsights(entitlement);
  const historyDays = chartDaysAllowed(entitlement);
  const offered = chartWindows(entitlement);

  const [history, library, windows, feedback, share, plans] = await Promise.all([
    page ? Promise.resolve([]) : destinationHistory(scope, id),
    listLogos(scope),
    // Daily windows are computed here. Longer ones the plan covers arrive
    // with no data and are fetched from ./analytics when picked, so the live
    // refresh below never re-runs a two-year query every 30 seconds.
    Promise.all(
      offered.map(async ({ days, locked }) => ({
        days,
        locked,
        data:
          !locked && days <= LONGEST_DAILY_WINDOW
            ? await codeAnalytics(scope, id, days, { detail: insights })
            : null,
      }))
    ),
    code.kind === "feedback" ? codeFeedback(scope, id) : Promise.resolve(null),
    getLiveShare(scope, id),
    listPublicPlans(),
  ]);
  const sharing = canShareStats(entitlement);

  const exportable = canExportCsv(entitlement);

  // What each locked control explains when clicked. The plan that unlocks it
  // is read from the plan rows, so the copy follows plan edits in the admin.
  const offers = {
    insights: featureOffer("insights", entitlement, plans),
    csv: featureOffer("csv_export", entitlement, plans),
    share: featureOffer("share_stats", entitlement, plans),
    video: featureOffer("video_uploads", entitlement, plans),
    history: Object.fromEntries(
      offered
        .filter(({ locked }) => locked)
        .map(({ days }) => [days, historyOffer(days, entitlement, plans)])
    ),
  };
  const url = codeUrl(code.shortCode);
  // Encoded here, once: the live preview draws from this matrix in the
  // browser, which runs no QR encoder of its own.
  const matrix = cachedMatrix(url, code.logo || code.presetLogo ? "H" : "Q");

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
          <span>{dynamicType(code.kind).label}</span>
          {page && code.status === "active" ? (
            <a
              href={pagePath(code.shortCode)}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4"
            >
              View page
            </a>
          ) : null}
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
        The scope wraps both columns: it holds the design being previewed, so
        the specimen on the left redraws as the form on the right changes.
      */}
      <StyleScope
        initial={code.style}
        className="grid gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-14"
      >
        {/*
          The specimen, drawn exactly as the download is. Sticky on wide
          screens, so it stays in view while the design form is scrolled.
        */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <LiveSymbol
            matrix={matrix}
            logoUrl={code.logo?.url}
            presetLogo={code.presetLogo}
            title={`QR code for ${code.name}`}
          />

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

        {!canWrite ? (
          <div className="space-y-6">
            <div>
              <p className="mb-1 text-sm">{page ? "Shows" : "Points to"}</p>
              <p className="break-all rounded-md border border-[var(--paper-rule)] bg-white px-3 py-2 font-mono text-sm">
                {page ? `${dynamicType(code.kind).label} page` : code.destinationUrl}
              </p>
            </div>
            <ReadOnlyNote ownerName={access?.team?.ownerName ?? null} />
          </div>
        ) : (
        <div className="space-y-10">
          {page ? (
            <ContentForm
              id={code.id}
              kind={page}
              initial={(code.content ?? {}) as Record<string, unknown>}
              uploads={uploadsEnabled()}
              videoUploads={canUploadVideo(entitlement)}
              videoOffer={offers.video}
              disabled={code.status === "blocked"}
            />
          ) : (
            <DestinationForm
              id={code.id}
              current={code.destinationUrl}
              disabled={code.status === "blocked"}
            />
          )}
          <RenameForm id={code.id} current={code.name} />
          <section aria-labelledby="design-heading">
            <h2 id="design-heading" className="mb-4 font-sarlotte text-2xl leading-none">
              Design
            </h2>
            <StyleForm id={code.id} saved={code.style} matrix={matrix} />
          </section>
          <LogoForm
            id={code.id}
            current={code.presetLogo ? `${PRESET_PREFIX}${code.presetLogo}` : (code.logo?.id ?? null)}
            logos={logos}
            uploads={uploadsEnabled()}
          />
          {/*
            Said here, beside the controls, because otherwise saving a colour
            for the artwork silently changes a public page as well.
          */}
          {page ? (
            <p className="max-w-[48ch] text-xs leading-relaxed text-[var(--paper-soft)]">
              The colour and logo above also style this code&apos;s page: its
              buttons take the code colour and the logo sits at the top. On
              black and white with no logo, the page keeps the standard look.
            </p>
          ) : null}
          {code.status === "blocked" ? null : (
            <StatusForm id={code.id} status={code.status} />
          )}
        </div>
        )}
      </StyleScope>

      {feedback ? (
        <>
          <hr className="my-12 border-[var(--paper-rule)]" />
          <FeedbackPanel
            feedback={feedback}
            exportHref={exportable.ok ? `/app/${code.id}/export/feedback` : null}
            offer={offers.csv}
          />
        </>
      ) : null}

      <hr className="my-12 border-[var(--paper-rule)]" />

      <AnalyticsPanel
        windows={windows}
        insights={insights}
        historyDays={historyDays}
        createdAt={code.createdAt.toISOString()}
        fetchBase={`/app/${code.id}/analytics`}
        exportBase={exportable.ok ? `/app/${code.id}/export` : null}
        upgrade={{ insights: offers.insights, history: offers.history }}
      />
      {/* Scans arrive while the owner watches; see LiveRefresh. */}
      <LiveRefresh />

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
            Named rather than hidden, and clickable: a plan limit the customer
            cannot see gets reported as a missing feature, and a dead button
            gets reported as a bug. The route refuses the download anyway.
          */
          <LockedButton offer={offers.csv} className={`${secondaryButtonClass} gap-1.5 border-dashed`}>
            <LockIcon />
            Export 30 days as CSV
          </LockedButton>
        )}
      </div>

      {/* Publishing a stats link changes the account, so it is not a viewer's. */}
      {canWrite ? (
        <>
          <hr className="my-12 border-[var(--paper-rule)]" />
          <SharePanel
            id={code.id}
            origin={env().QR_BASE_URL}
            initialToken={share?.token ?? null}
            allowed={sharing}
            offer={sharing ? undefined : offers.share}
          />
        </>
      ) : null}

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

/** What customers said through a feedback code, newest first. */
function FeedbackPanel({
  feedback,
  exportHref,
  offer,
}: {
  feedback: NonNullable<Awaited<ReturnType<typeof codeFeedback>>>;
  /** The CSV route, when the plan includes export; otherwise the button explains. */
  exportHref: string | null;
  offer: UpgradeOffer;
}) {
  const label = "Export answers as CSV";
  return (
    <section aria-labelledby="feedback-heading">
      <h2 id="feedback-heading" className="font-sarlotte text-2xl leading-none">
        Feedback
      </h2>
      <p className="dash-num mt-2 text-sm text-[var(--paper-soft)]">
        {feedback.count === 0
          ? "No answers yet. They appear here as customers leave them."
          : `${feedback.count.toLocaleString("en-NG")} ${
              feedback.count === 1 ? "answer" : "answers"
            }, averaging ${feedback.average?.toFixed(1)} out of 5.`}
      </p>
      {feedback.entries.length > 0 ? (
        <ol className="mt-5">
          {feedback.entries.map((entry, i) => (
            <li
              key={`${entry.createdAt.toISOString()}-${i}`}
              className="grid gap-x-5 gap-y-1 border-b border-[var(--paper-rule)] py-3 sm:grid-cols-[9rem_6rem_1fr]"
            >
              <time
                dateTime={entry.createdAt.toISOString()}
                className="dash-num text-xs text-[var(--paper-soft)]"
              >
                {entry.createdAt.toLocaleDateString("en-NG", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </time>
              <span className="text-sm" aria-label={`${entry.rating} out of 5`}>
                {"★".repeat(entry.rating)}
                <span className="text-[var(--paper-rule)]">{"★".repeat(5 - entry.rating)}</span>
              </span>
              <p className="min-w-0 whitespace-pre-line text-sm">
                {entry.comment ?? <span className="text-[var(--paper-soft)]">No comment</span>}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
      {feedback.count > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          {exportHref ? (
            <a href={exportHref} download className={secondaryButtonClass}>
              {label}
            </a>
          ) : (
            <LockedButton offer={offer} className={`${secondaryButtonClass} gap-1.5 border-dashed`}>
              <LockIcon />
              {label}
            </LockedButton>
          )}
          {feedback.count > feedback.entries.length ? (
            <p className="text-xs text-[var(--paper-soft)]">
              The latest {feedback.entries.length.toLocaleString("en-NG")} are shown here; the
              export has every answer.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
