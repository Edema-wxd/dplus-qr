import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { getEntitlement } from "@/lib/entitlement";
import { listCodes } from "@/lib/user-codes";
import { CODE_HOST, codeUrl } from "@/lib/brand";
import { dynamicType, isPageKind } from "@/lib/qr-types";
import {
  applyListQuery,
  CODE_SORTS,
  isDefaultListQuery,
  parseListQuery,
  STATUS_FILTERS,
  type ListQuery,
} from "@/lib/code-list";
import { QrSymbol } from "@/app/_landing/QrSymbol";
import { DashShell } from "./DashShell";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { StatusPill } from "./StatusPill";
import { VerifyBanner } from "./VerifyBanner";

export const metadata: Metadata = { title: "Your codes" };

// Every byte on this page is the signed-in user's own data, so there is no
// useful static shell to stream around. Under Cache Components that makes it a
// blocking route, the same choice the account page makes.
export const instant = false;

export default async function CodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Before the session read, not after: `auth` validates its env vars on
  // first use and throws when they are absent, so without this `next build`
  // tries to prerender the page and fails on a secret it should never need.
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  // Also grants the free plan on first load, so a code created here can
  // actually serve traffic. See ensureFreeSubscription.
  await ensureProfile({ id: user.id, email: user.email, name: user.name });

  const [codes, entitlement, params] = await Promise.all([
    listCodes(user.id),
    getEntitlement(user.id),
    searchParams,
  ]);

  const listQuery = parseListQuery(params);
  const shown = applyListQuery(codes, listQuery);
  const filtered = !isDefaultListQuery(listQuery);

  const atLimit = entitlement !== null && codes.length >= entitlement.maxCodes;

  // The header action appears only when there is a table to sit above; the
  // empty state carries its own, and two identical calls to action on one
  // screen is one too many.
  const hasCodes = codes.length > 0;

  // `getEntitlement` returns null for an account with no usable subscription,
  // and `active: false` for one past its grace period. Either way the redirect
  // path's `decide()` serves the paused page for every code on the account.
  const lapsed = entitlement === null || !entitlement.active;

  return (
    <DashShell
      heading="Your codes"
      meta={
        entitlement ? (
          <span className="dash-num">
            {entitlement.planName} plan · {codes.length} of{" "}
            {entitlement.maxCodes} codes
          </span>
        ) : null
      }
      action={
        hasCodes ? <NewCodeButton /> : null
      }
    >
      {user.emailVerified ? null : <VerifyBanner email={user.email} />}

      {lapsed && hasCodes ? <LapsedNotice /> : null}

      {hasCodes ? <Totals codes={codes} /> : null}

      {hasCodes ? (
        <ListControls query={listQuery} shown={shown.length} total={codes.length} />
      ) : null}

      {codes.length === 0 ? (
        <EmptyState />
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-6 py-10 text-center text-sm text-[var(--paper-soft)]">
          No codes match.{" "}
          <Link href="/app" className="underline underline-offset-4">
            Show all codes
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              {filtered
                ? `Your QR codes matching the filters above, ${shown.length} of ${codes.length}, `
                : "Your QR codes, newest first, "}
              with scans today, over seven days and over thirty days.
            </caption>
            <thead>
              <tr className="border-b border-[var(--paper-rule)] text-left text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">
                <th scope="col" className="px-4 py-3 font-medium">
                  Code
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Points to
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Today
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  7 days
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  30 days
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((code) => (
                <tr
                  key={code.id}
                  className="dash-row border-b border-[var(--paper-rule)] last:border-b-0"
                >
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link
                      href={`/app/${code.id}`}
                      className="flex items-center gap-3 no-underline"
                    >
                      {/*
                        The signature move: the real symbol, generated from this
                        code's own short code, at every scale the product shows.
                        Not an icon standing in for a code.
                      */}
                      <span className="block shrink-0">
                        <QrSymbol
                          value={codeUrl(code.shortCode)}
                          px={44}
                          title={`QR code for ${code.name}`}
                          logoUrl={code.logo?.url}
                          style={code.style}
                          className="block h-auto w-11"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[var(--paper-ink)]">
                          {code.name}
                        </span>
                        <span className="dash-num block truncate font-mono text-xs text-[var(--paper-soft)]">
                          {CODE_HOST}/{code.shortCode}
                        </span>
                      </span>
                    </Link>
                  </th>
                  <td className="max-w-[18rem] px-4 py-3">
                    {/*
                      A page type's destination is our own `/p/...` path,
                      which says nothing to the owner. Its type does.
                    */}
                    {isPageKind(code.kind) ? (
                      <span className="block truncate text-xs text-[var(--paper-soft)]">
                        {dynamicType(code.kind).label} page
                      </span>
                    ) : (
                      <span className="block truncate font-mono text-xs text-[var(--paper-soft)]">
                        {code.destinationUrl}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={code.status} />
                  </td>
                  <Figure value={code.scansToday} />
                  <Figure value={code.scans7d} />
                  <Figure value={code.scans30d} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {atLimit && entitlement ? (
        <p id="code-limit-hint" className="mt-4 text-sm text-[var(--paper-soft)]">
          You are using all {entitlement.maxCodes} codes on the{" "}
          {entitlement.planName} plan. A code you hold keeps its short code for
          good, so pausing one does not free a slot. Static codes need no slot,
          so you can still make those.
        </p>
      ) : null}
    </DashShell>
  );
}

/**
 * Said plainly, on the page the owner checks first. A lapsed plan does not
 * break printed codes, but every one of them is showing the paused page right
 * now, and the owner cannot see that from here without being told.
 */
function LapsedNotice() {
  return (
    <p
      role="alert"
      className="mb-8 rounded-lg border border-[var(--struck-ink)]/40 bg-white px-4 py-3 text-sm leading-relaxed"
    >
      <strong className="font-medium">Your plan is not active.</strong> Every
      code below is showing a paused page that names your business, instead of
      its destination. Nothing is lost: once a plan is active again they follow
      their destinations within a minute.{" "}
      <Link href="/billing" className="underline underline-offset-4">
        Choose a plan
      </Link>
      .
    </p>
  );
}

/**
 * Account-wide figures above the table: scans across every code, and how many
 * are live. Summed from the rows the table already shows, so the two can never
 * disagree, and bots are excluded for the same reason they are in each row.
 */
function Totals({
  codes,
}: {
  codes: { status: string; scansToday: number; scans7d: number; scans30d: number }[];
}) {
  const sum = (pick: (code: (typeof codes)[number]) => number) =>
    codes.reduce((total, code) => total + pick(code), 0);

  const figures: { label: string; value: number; of?: number }[] = [
    { label: "Scans today", value: sum((c) => c.scansToday) },
    { label: "Last 7 days", value: sum((c) => c.scans7d) },
    { label: "Last 30 days", value: sum((c) => c.scans30d) },
    {
      label: "Live codes",
      value: codes.filter((c) => c.status === "active").length,
      of: codes.length,
    },
  ];

  return (
    <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] sm:grid-cols-4">
      {figures.map((figure) => (
        <div key={figure.label} className="bg-white px-4 py-3.5">
          <dt className="text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">
            {figure.label}
          </dt>
          <dd className="dash-num mt-1 text-2xl leading-none text-[var(--paper-ink)]">
            {figure.value.toLocaleString("en-NG")}
            {figure.of !== undefined ? (
              <span className="text-sm text-[var(--paper-soft)]">
                {" "}
                of {figure.of.toLocaleString("en-NG")}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Right-aligned and tabular, so the three columns compare down the page. */
function Figure({ value }: { value: number }) {
  return (
    <td
      className={`dash-num px-4 py-3 text-right ${
        value === 0 ? "text-[var(--paper-soft)]" : "text-[var(--paper-ink)]"
      }`}
    >
      {value.toLocaleString("en-NG")}
    </td>
  );
}

/**
 * Search, status and sort, as a plain GET form: the view lives in the URL, so
 * it survives a reload and works before any JavaScript has loaded.
 */
function ListControls({
  query,
  shown,
  total,
}: {
  query: ListQuery;
  shown: number;
  total: number;
}) {
  const filtered = !isDefaultListQuery(query);
  const select = `${inputClass} sm:w-auto`;

  return (
    <form
      method="get"
      action="/app"
      role="search"
      aria-label="Filter codes"
      className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <div className="min-w-0 sm:flex-1">
        <label htmlFor="codes-q" className="mb-1 block text-xs text-[var(--paper-soft)]">
          Search
        </label>
        <input
          id="codes-q"
          name="q"
          type="search"
          defaultValue={query.q}
          maxLength={100}
          placeholder="Name, short code or link"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="codes-status" className="mb-1 block text-xs text-[var(--paper-soft)]">
          Status
        </label>
        <select id="codes-status" name="status" defaultValue={query.status} className={select}>
          {Object.entries(STATUS_FILTERS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="codes-sort" className="mb-1 block text-xs text-[var(--paper-soft)]">
          Sort
        </label>
        <select id="codes-sort" name="sort" defaultValue={query.sort} className={select}>
          {Object.entries(CODE_SORTS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" className={secondaryButtonClass}>
          Apply
        </button>
        {filtered ? (
          <Link href="/app" className="px-2 text-sm text-[var(--paper-soft)] underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </div>
      {filtered ? (
        <p aria-live="polite" className="dash-num text-xs text-[var(--paper-soft)] sm:basis-full">
          Showing {shown.toLocaleString("en-NG")} of {total.toLocaleString("en-NG")} codes
        </p>
      ) : null}
    </form>
  );
}

/**
 * A link, not a disclosure: choosing among twenty-odd code types needs a page
 * of its own. It stays enabled at the plan limit, because static codes need
 * no slot; the type picker says which kinds are unavailable and why.
 */
function NewCodeButton() {
  return (
    <Link href="/app/new" className={`${primaryButtonClass} no-underline`}>
      New code
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-6 py-14 text-center">
      <p className="mx-auto max-w-[42ch] text-[15px] leading-relaxed text-[var(--paper-soft)]">
        No codes yet. Make one, print it, and you can change where it leads for
        as long as the printed thing exists.
      </p>
      <div className="mt-6 flex justify-center">
        <NewCodeButton />
      </div>
    </div>
  );
}
