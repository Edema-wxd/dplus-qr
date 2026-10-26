"use client";

import { CODE_HOST } from "@/lib/brand";
import { toOwnedCode, type OwnedCode } from "@/lib/user-codes-shape";
import { StatusPill } from "../StatusPill";
import { LiveIndicator, useLiveRow } from "../LiveCodes";
import { DestinationForm, RenameForm, StatusForm } from "./CodeControls";

/**
 * The parts of a code's page that follow the live row.
 *
 * Each falls back to the row the server rendered with, which the page passes
 * as `fallback`. The live row can only go missing if the code stops matching
 * the query, and codes are never deleted, so that is belt and braces.
 */
function useCode(fallback: OwnedCode): OwnedCode {
  const { row } = useLiveRow();
  return row ? toOwnedCode(row) : fallback;
}

export function LiveName({ fallback }: { fallback: OwnedCode }) {
  return <>{useCode(fallback).name}</>;
}

export function LiveCodeMeta({ fallback }: { fallback: OwnedCode }) {
  const code = useCode(fallback);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="dash-num font-mono">
        {CODE_HOST}/{code.shortCode}
      </span>
      <StatusPill status={code.status} />
      <LiveIndicator />
    </span>
  );
}

/** Appears the moment support blocks the code, without a reload. */
export function LiveBlockedNotice({ fallback }: { fallback: OwnedCode }) {
  const code = useCode(fallback);
  if (code.status !== "blocked") return null;
  return (
    <p
      role="alert"
      className="mb-8 rounded-lg border border-[var(--struck-ink)]/40 bg-white px-4 py-3 text-sm leading-relaxed"
    >
      <strong className="font-medium">This code is blocked.</strong>{" "}
      {code.blockedReason ?? "Its destination was found to be unsafe."} Scans
      meet a page explaining that, and only support can restore it.
    </p>
  );
}

/**
 * The edit forms, given live values.
 *
 * The text fields are uncontrolled, so a change made elsewhere does not
 * overwrite what the owner is typing; it sets what a reset returns to. The
 * status button follows the live status, so after a pause on another device
 * it offers "Make it live again" rather than submitting a second pause.
 */
export function LiveControls({ fallback }: { fallback: OwnedCode }) {
  const code = useCode(fallback);
  return (
    <div className="space-y-10">
      <DestinationForm
        id={code.id}
        current={code.destinationUrl}
        disabled={code.status === "blocked"}
      />
      <RenameForm id={code.id} current={code.name} />
      {code.status === "blocked" ? null : (
        <StatusForm id={code.id} status={code.status} />
      )}
    </div>
  );
}
