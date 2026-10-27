import type { Metadata } from "next";
import Link from "next/link";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { CODE_HOST } from "@/lib/brand";
import { DYNAMIC_TYPES, dynamicType, isDynamicKind } from "@/lib/qr-types";
import { codeFiltersSchema, listStaffCodes, type CodeFilters } from "@/lib/moderation";
import { StatusPill } from "@/app/(app)/app/StatusPill";
import { audit, requireStaff } from "../guard";
import { AdminShell, Tag, day, tableClass, tdClass, thClass } from "../AdminShell";
import { Destination } from "./Destination";

export const metadata: Metadata = { title: "Codes · Admin" };
export const instant = false;

/** The list's URL with some filters changed, for the pager. */
function listHref(filters: CodeFilters, change: Partial<CodeFilters>): string {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.kind) params.set("kind", next.kind);
  if (next.flag) params.set("flag", next.flag);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/codes?${query}` : "/admin/codes";
}

/**
 * Every code on the platform: who owns it, where it points, whether it is
 * serving, how much it is scanned and whether anyone has reported it.
 */
export default async function AdminCodes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff();
  const filters = codeFiltersSchema.parse(await searchParams);

  // A search can match an owner's email, so the term is audited as one.
  audit(staff, {
    action: filters.q ? "search" : "view",
    targetType: "page",
    targetId: "/admin/codes",
    detail: filters.q ? { q: filters.q } : {},
  });

  const { rows, hasMore } = await listStaffCodes(filters);
  const filtered = Boolean(filters.q || filters.status || filters.kind || filters.flag);

  return (
    <AdminShell
      heading="Codes"
      current="/admin/codes"
      meta={
        filters.status === "archived"
          ? "Archived codes, newest first."
          : "Every code in circulation, newest first. Archived codes are under their own filter."
      }
    >
      <form method="get" action="/admin/codes" role="search" className="mb-5 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]">
        <label htmlFor="codes-q" className="sr-only">Search</label>
        <input
          id="codes-q"
          name="q"
          type="search"
          defaultValue={filters.q}
          maxLength={100}
          placeholder="Short code, name, destination or owner email"
          className={inputClass}
        />
        <label htmlFor="codes-status" className="sr-only">Status</label>
        <select id="codes-status" name="status" defaultValue={filters.status ?? ""} className={inputClass}>
          <option value="">Any status</option>
          <option value="active">Live</option>
          <option value="paused">Paused</option>
          <option value="blocked">Blocked</option>
          <option value="archived">Archived</option>
        </select>
        <label htmlFor="codes-kind" className="sr-only">Type</label>
        <select id="codes-kind" name="kind" defaultValue={filters.kind ?? ""} className={inputClass}>
          <option value="">Any type</option>
          {DYNAMIC_TYPES.map((type) => (
            <option key={type.kind} value={type.kind}>{type.label}</option>
          ))}
        </select>
        <label htmlFor="codes-flag" className="sr-only">Watch</label>
        <select id="codes-flag" name="flag" defaultValue={filters.flag ?? ""} className={inputClass}>
          <option value="">Anything</option>
          <option value="reported">Open abuse reports</option>
          <option value="changed">Destination changed in 24h</option>
        </select>
        <button type="submit" className={secondaryButtonClass}>Filter</button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--paper-soft)]">
          {filtered ? "No codes match." : "No codes yet."}{" "}
          {filtered ? <Link href="/admin/codes">Clear the filters</Link> : null}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
          <table className={`${tableClass} min-w-[64rem]`}>
            <thead className="border-b border-[var(--paper-rule)]">
              <tr>
                <th scope="col" className={thClass}>Code</th>
                <th scope="col" className={thClass}>Points to</th>
                <th scope="col" className={thClass}>Owner</th>
                <th scope="col" className={thClass}>Status</th>
                <th scope="col" className={`${thClass} text-right`}>Scans, 7d</th>
                <th scope="col" className={thClass}>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((code) => (
                <tr key={code.id} className="dash-row border-b border-[var(--paper-rule)] last:border-b-0">
                  <td className={tdClass}>
                    <Link href={`/admin/codes/${code.id}`} className="block no-underline">
                      <span className="block font-medium text-[var(--paper-ink)]">{code.name}</span>
                      <span className="block font-mono text-xs text-[var(--paper-soft)]">
                        {CODE_HOST}/{code.shortCode}
                      </span>
                      <span className="block text-xs text-[var(--paper-soft)]">
                        {isDynamicKind(code.kind) ? dynamicType(code.kind).label : code.kind}
                      </span>
                    </Link>
                  </td>
                  <td className={`${tdClass} max-w-[22rem]`}>
                    <Destination url={code.destinationUrl} shortCode={code.shortCode} kind={code.kind} compact />
                  </td>
                  <td className={tdClass}>
                    <Link href={`/admin/customers/${code.owner.id}`} className="block no-underline">
                      <span className="block text-[var(--paper-ink)]">
                        {code.owner.erased ? "Erased account" : code.owner.email}
                      </span>
                      {code.owner.suspended && !code.owner.erased ? <Tag tone="struck">Suspended</Tag> : null}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <StatusPill status={code.status} />
                      {code.archived ? <Tag>Archived</Tag> : null}
                      {code.openReports > 0 ? (
                        <Tag tone="struck">
                          {code.openReports} {code.openReports === 1 ? "report" : "reports"}
                        </Tag>
                      ) : null}
                      {code.changedRecently ? (
                        <Tag>Changed in 24h</Tag>
                      ) : null}
                    </span>
                  </td>
                  <td className={`${tdClass} dash-num text-right`}>{code.scans7d.toLocaleString("en-NG")}</td>
                  <td className={`${tdClass} dash-num whitespace-nowrap`}>{day(code.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filters.page > 1 || hasMore ? (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-between text-sm">
          {filters.page > 1 ? (
            <Link href={listHref(filters, { page: filters.page - 1 })}>Newer</Link>
          ) : <span />}
          <span className="text-[var(--paper-soft)]">Page {filters.page}</span>
          {hasMore ? <Link href={listHref(filters, { page: filters.page + 1 })}>Older</Link> : <span />}
        </nav>
      ) : null}
    </AdminShell>
  );
}
