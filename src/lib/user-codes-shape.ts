/**
 * The shape of a code row, with no imports.
 *
 * Split from `user-codes.ts`, which imports `pg`, so the dashboard's live
 * table -- a Client Component -- can map rows without pulling a database
 * driver into the browser bundle.
 */

/** A code as its owner sees it, with the scan counts the list needs. */
export type OwnedCode = {
  id: string;
  shortCode: string;
  name: string;
  destinationUrl: string;
  status: "active" | "paused" | "blocked";
  blockedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  scansToday: number;
  scans7d: number;
  scans30d: number;
};

/** The owner may move a code between these two. `blocked` is an admin verdict. */
export type OwnerStatus = "active" | "paused";

/**
 * A code row exactly as Postgres returns it.
 *
 * Exported because the dashboard reads it twice in the same shape: once
 * through `pg` for the server render, and then live through Neon Realtime.
 * Both decode `bigint` and `count(*)` as strings and `timestamptz` as `Date`,
 * so the initial rows and the live rows are interchangeable -- which is what
 * lets the page render server rows without a loading state and swap in live
 * ones without a flicker.
 */
export type CodeRow = {
  id: string;
  short_code: string;
  name: string;
  destination_url: string;
  status: OwnedCode["status"];
  blocked_reason: string | null;
  created_at: Date;
  updated_at: Date;
  scans_today: string;
  scans_7d: string;
  scans_30d: string;
};

export function toOwnedCode(row: CodeRow): OwnedCode {
  return {
    id: String(row.id),
    shortCode: row.short_code,
    name: row.name,
    destinationUrl: row.destination_url,
    status: row.status,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scansToday: Number(row.scans_today),
    scans7d: Number(row.scans_7d),
    scans30d: Number(row.scans_30d),
  };
}
