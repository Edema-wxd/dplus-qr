"use client";

import { useActionState, useState } from "react";
import { submitFeedback, type FeedbackState } from "./actions";

/**
 * Stars and an optional comment. The stars are radio buttons, so they work
 * from a keyboard and announce as "3 of 5" rather than as five images.
 *
 * A four or five star answer is offered the owner's public review link, if
 * they gave one. Everyone is thanked the same way first: the private answer
 * is saved whatever the rating, so nobody is steered away from saying what
 * went wrong.
 */
export function FeedbackForm({
  code,
  question,
  reviewUrl,
  thanks,
}: {
  code: string;
  question: string;
  reviewUrl: string | null;
  thanks: string;
}) {
  const [state, action, pending] = useActionState(submitFeedback, {
    status: "idle",
  } as FeedbackState);
  const [rating, setRating] = useState(0);

  if (state.status === "sent") {
    return (
      <div className="space-y-4">
        <p role="status" className="text-lg leading-relaxed">
          {thanks}
        </p>
        {reviewUrl && (state.rating ?? 0) >= 4 ? (
          <a
            href={reviewUrl}
            rel="noopener nofollow"
            className="flex w-full items-center justify-center rounded-lg bg-foreground px-4 py-3 text-[15px] font-medium text-background no-underline"
          >
            Share it in a public review
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="code" value={code} />
      <fieldset>
        <legend className="mb-3 text-lg leading-snug">{question}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="peer sr-only"
                required
              />
              <span className="sr-only">
                {value} of 5
              </span>
              <svg
                viewBox="0 0 24 24"
                width="44"
                height="44"
                aria-hidden
                className={`rounded-md peer-focus-visible:outline peer-focus-visible:outline-2 ${
                  value <= rating ? "text-dsp-yellow" : "text-border"
                }`}
              >
                <path
                  fill="currentColor"
                  d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"
                />
              </svg>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="feedback-comment" className="mb-1 block text-sm text-muted-foreground">
          Anything to add? (optional)
        </label>
        <textarea
          id="feedback-comment"
          name="comment"
          rows={4}
          maxLength={1000}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[15px]"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-dsp-red">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || rating === 0}
        className="flex w-full items-center justify-center rounded-lg bg-foreground px-4 py-3 text-[15px] font-medium text-background disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
