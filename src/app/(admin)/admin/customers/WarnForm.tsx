"use client";

import { useActionState, useState } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { issueWarningAction, resolveWarningAction } from "../warning-actions";
import type { AdminFormState } from "../actions";
import { ActionNote, confirmFirst, dangerButtonClass } from "../ActionNote";

const LEVELS = [
  { value: "notice", label: "Notice", hint: "For information. No action is threatened." },
  { value: "warning", label: "Warning", hint: "Something must change. No date is set." },
  { value: "final", label: "Final warning", hint: "A date to put it right by. Staff decide what happens after." },
] as const;

/**
 * Send a warning to an account, emailed from support@ and shown on the
 * owner's dashboard. On a code's page the code is fixed; on an account's page
 * staff may pick one of its codes or leave it about the account as a whole.
 */
export function WarnForm({
  userId,
  codes = [],
  fixedCode,
}: {
  userId: string;
  codes?: { id: number; label: string }[];
  fixedCode?: { id: number; label: string };
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(issueWarningAction, {});
  const [level, setLevel] = useState<(typeof LEVELS)[number]["value"]>("warning");

  return (
    <form action={action} className="max-w-2xl space-y-3">
      <input type="hidden" name="userId" value={userId} />
      {fixedCode ? <input type="hidden" name="qrId" value={fixedCode.id} /> : null}

      <fieldset>
        <legend className="mb-1.5 text-xs text-[var(--paper-soft)]">Level</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
                level === option.value
                  ? "border-[var(--paper-ink)] text-[var(--paper-ink)]"
                  : "border-[var(--paper-rule)] text-[var(--paper-soft)]"
              }`}
            >
              <input
                type="radio"
                name="level"
                value={option.value}
                checked={level === option.value}
                onChange={() => setLevel(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-[var(--paper-soft)]">{LEVELS.find((o) => o.value === level)!.hint}</p>
      </fieldset>

      {level === "final" ? (
        <div>
          <label htmlFor="warn-days" className="mb-1 block text-xs text-[var(--paper-soft)]">
            They have
          </label>
          <select id="warn-days" name="respondDays" defaultValue="7" className={`${inputClass} max-w-[12rem]`}>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
          </select>
        </div>
      ) : null}

      {fixedCode ? (
        <p className="text-xs text-[var(--paper-soft)]">
          About <span className="font-mono text-[var(--paper-ink)]">{fixedCode.label}</span>
        </p>
      ) : codes.length > 0 ? (
        <div>
          <label htmlFor="warn-code" className="mb-1 block text-xs text-[var(--paper-soft)]">
            About
          </label>
          <select id="warn-code" name="qrId" defaultValue="" className={inputClass}>
            <option value="">The account as a whole</option>
            {codes.map((code) => (
              <option key={code.id} value={code.id}>{code.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="warn-message" className="mb-1 block text-xs text-[var(--paper-soft)]">
          Message. The owner reads this exactly as written, by email and on their dashboard.
        </label>
        <textarea
          id="warn-message"
          name="message"
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          placeholder="e.g. Your code points to a page asking for bank login details. Change the destination or remove the page."
          className={inputClass}
        />
      </div>

      <button type="submit" disabled={pending} className={level === "final" ? dangerButtonClass : primaryButtonClass}>
        {pending ? "Sending…" : `Send ${LEVELS.find((o) => o.value === level)!.label.toLowerCase()}`}
      </button>
      <ActionNote state={state} />
    </form>
  );
}

/**
 * Close an open warning. Suspending is offered only on a final warning, and
 * asks first when its date has not yet come.
 */
export function WarningActions({ warningId, final, due }: { warningId: number; final: boolean; due: boolean }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(resolveWarningAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="warningId" value={warningId} />
      <div className="flex flex-wrap gap-2">
        {final ? (
          <button
            type="submit"
            name="op"
            value="suspend"
            disabled={pending}
            onClick={confirmFirst(
              due
                ? "Suspend this account? Every code shows the paused page until staff lift it."
                : "This final warning's date has not come yet. Suspend the account now anyway?"
            )}
            className={dangerButtonClass}
          >
            Suspend account
          </button>
        ) : null}
        <button type="submit" name="op" value="complied" disabled={pending} className={secondaryButtonClass}>
          They put it right
        </button>
        <button type="submit" name="op" value="withdrawn" disabled={pending} className={secondaryButtonClass}>
          Withdraw
        </button>
      </div>
      <ActionNote state={state} />
    </form>
  );
}
