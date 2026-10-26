"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CODE_HOST, codeUrl } from "@/lib/brand";
import { toOwnedCode } from "@/lib/user-codes-shape";
import { QrSymbol } from "@/app/_landing/QrSymbol";
import { StatusPill } from "./StatusPill";
import { useLiveRows } from "./LiveCodes";

/**
 * The code list, from the live rows.
 *
 * `empty` is rendered when there are no codes, and is live too: a first code
 * made on a phone replaces the empty state on an open laptop.
 */
export function CodesTable({ empty }: { empty: ReactNode }) {
  const { rows } = useLiveRows();
  if (rows.length === 0) return <>{empty}</>;

  const codes = rows.map(toOwnedCode);

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--paper-rule)] bg-white">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <caption className="sr-only">
          Your QR codes, newest first, with scans today, over seven days and
          over thirty days.
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
          {codes.map((code) => (
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
                  <QrSymbol
                    value={codeUrl(code.shortCode)}
                    px={44}
                    title={`QR code for ${code.name}`}
                    className="block h-auto w-11 shrink-0"
                  />
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
                <span className="block truncate font-mono text-xs text-[var(--paper-soft)]">
                  {code.destinationUrl}
                </span>
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
