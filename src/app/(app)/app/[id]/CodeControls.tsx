"use client";

import { useActionState } from "react";
import {
  changeDestinationAction,
  renameCodeAction,
  setStatusAction,
  type CodeState,
} from "../actions";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { useSuccessToast } from "@/components/notify";

/** Re-point the code. The one control the whole product exists for. */
export function DestinationForm({
  id,
  current,
  disabled,
}: {
  id: string;
  current: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    changeDestinationAction,
    {} as CodeState
  );
  useSuccessToast(state, "destination", (s) =>
    s.saved
      ? {
          title: "Destination saved",
          description: "Scans follow the new destination within a minute.",
        }
      : null
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor="destination" className="mb-1 block text-sm">
        Points to
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="destination"
          name="destinationUrl"
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={disabled}
          defaultValue={current}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending || disabled}
          className={`${primaryButtonClass} sm:shrink-0`}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-[var(--paper-soft)]">
          The printed code never changes. Only this does.
        </p>
      )}
    </form>
  );
}

export function RenameForm({ id, current }: { id: string; current: string }) {
  const [state, action, pending] = useActionState(
    renameCodeAction,
    {} as CodeState
  );
  useSuccessToast(state, "rename", (s) => (s.saved ? { title: "Name saved" } : null));

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor="code-name" className="mb-1 block text-sm">
        Name
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="code-name"
          name="name"
          required
          maxLength={80}
          defaultValue={current}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending}
          className={`${secondaryButtonClass} sm:shrink-0`}
        >
          {pending ? "Saving…" : "Rename"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Pause or resume.
 *
 * Pausing is reversible and does not touch what is printed, so it asks for no
 * confirmation — but the copy says plainly what a scanner will meet, because
 * that consequence happens out in the world where the owner cannot see it.
 */
export function StatusForm({
  id,
  status,
}: {
  id: string;
  status: "active" | "paused";
}) {
  const [state, action, pending] = useActionState(
    setStatusAction,
    {} as CodeState
  );
  const next = status === "active" ? "paused" : "active";
  // The page re-renders with the new status in the same answer as the state,
  // so `status` here is already the one just saved.
  useSuccessToast(state, "status", (s) =>
    !s.saved
      ? null
      : status === "paused"
        ? {
            title: "Code paused",
            description: "Scanners now see a calm page naming your business.",
          }
        : {
            title: "Code is live again",
            description: "Scans follow the destination again, usually within a minute.",
          }
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending
          ? "Saving…"
          : status === "active"
            ? "Pause this code"
            : "Make it live again"}
      </button>
      <p className="mt-2 max-w-[44ch] text-xs leading-relaxed text-[var(--paper-soft)]">
        {status === "active"
          ? "Anyone who scans it will meet a calm page naming your business, not an error."
          : "Scans will follow the destination again, usually within a minute."}
      </p>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
