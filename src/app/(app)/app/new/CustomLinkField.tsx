"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CODE_HOST } from "@/lib/brand";
import { CUSTOM_MAX_LENGTH } from "@/lib/short-code";
import { checkCustomCodeAction, type CustomCodeHint } from "../actions";
import { inputClass } from "../DashShell";

/**
 * Choose the code's link (`qriateplus.com/dplus`) instead of a generated one.
 *
 * Optional, and fixed once the code is made: what gets printed can never
 * change, so the hint says so before the owner commits. Availability is
 * checked as they type, a pause after the last key, but only as advice; the
 * save is what claims the link.
 *
 * On a plan without custom links the field is shown disabled with the reason,
 * rather than hidden, so the feature can be found.
 */
export function CustomLinkField({
  allowed,
  reason,
}: {
  allowed: boolean;
  /** Why not, when `allowed` is false. */
  reason?: string;
}) {
  const [value, setValue] = useState("");
  // Each answer is kept with the value it was for, so a slow reply for an
  // earlier value can never be shown against a newer one.
  const [hint, setHint] = useState<{ for: string; answer: CustomCodeHint | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    const typed = next.trim();
    if (!allowed || typed === "") return;
    timer.current = setTimeout(async () => {
      let answer: CustomCodeHint | null = null;
      try {
        answer = await checkCustomCodeAction(typed);
      } catch {
        answer = null;
      }
      setHint({ for: typed, answer });
    }, 400);
  }

  const typed = value.trim();
  const current = hint && hint.for === typed ? hint.answer : null;
  const checking = allowed && typed !== "" && hint?.for !== typed;
  const shown = value.trim().toLowerCase();

  return (
    <div>
      <label htmlFor="new-code-custom" className="mb-1 block text-sm">
        Custom link <span className="text-[var(--paper-soft)]">(optional)</span>
      </label>
      <div className="flex items-stretch overflow-hidden rounded-md border border-[var(--paper-rule)] bg-white focus-within:border-[var(--pin-ink)]">
        <span className="dash-num flex items-center bg-[var(--paper)] px-3 font-mono text-xs text-[var(--paper-soft)]">
          {CODE_HOST}/
        </span>
        <input
          id="new-code-custom"
          name="customCode"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={CUSTOM_MAX_LENGTH}
          disabled={!allowed}
          value={value}
          onChange={(event) => change(event.target.value)}
          placeholder={allowed ? "your-name" : ""}
          aria-describedby="new-code-custom-hint"
          className={`${inputClass} rounded-none border-0 font-mono focus:border-0`}
        />
      </div>

      <p id="new-code-custom-hint" aria-live="polite" className="mt-1 text-xs leading-relaxed">
        {!allowed ? (
          <span className="text-[var(--paper-soft)]">
            {reason ?? "Custom links come with Pro and Business."}{" "}
            <Link href="/billing" className="underline underline-offset-4">
              See plans
            </Link>
          </span>
        ) : shown === "" ? (
          <span className="text-[var(--paper-soft)]">
            Leave empty for a short random link. A custom link cannot be changed after the
            code is made, because it is what gets printed.
          </span>
        ) : checking ? (
          <span className="text-[var(--paper-soft)]">Checking {CODE_HOST}/{shown}…</span>
        ) : current?.state === "available" ? (
          <span className="text-[var(--live-ink)]">
            {CODE_HOST}/{current.code} is available. It cannot be changed once the code is made.
          </span>
        ) : current ? (
          <span className="text-[var(--struck-ink)]">{current.reason}</span>
        ) : null}
      </p>
    </div>
  );
}
