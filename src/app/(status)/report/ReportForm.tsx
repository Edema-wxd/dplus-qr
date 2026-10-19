"use client";

import { useActionState } from "react";
import { submitReport, type ReportState } from "./actions";

const initial: ReportState = { status: "idle" };

export function ReportForm({ code }: { code: string }) {
  const [state, action, pending] = useActionState(submitReport, initial);

  if (state.status === "sent") {
    return (
      <p className="rounded-lg bg-muted p-4 text-sm text-foreground">
        Thank you. We have your report and will look at this code.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4 text-foreground">
      <div>
        <label htmlFor="code" className="block text-sm mb-1">
          Code
        </label>
        <input
          id="code"
          name="code"
          defaultValue={code}
          required
          className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm"
        />
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm mb-1">
          What happened?
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={4}
          required
          minLength={10}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="reporterEmail" className="block text-sm mb-1">
          Your email <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="reporterEmail"
          name="reporterEmail"
          type="email"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-dsp-red">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-foreground px-4 py-2 text-sm text-background disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
