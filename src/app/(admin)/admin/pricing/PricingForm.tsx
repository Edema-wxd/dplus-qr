"use client";

import { useActionState, useState } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { POLICY_KEYS, POLICY_LABELS, type PricingContent } from "@/lib/pricing-content";
import { savePricingAction } from "../pricing-actions";
import type { AdminFormState } from "../actions";
import { ActionNote } from "../ActionNote";

const label = "mb-1 block text-xs text-[var(--paper-soft)]";
const area = `${inputClass} min-h-[5.5rem] leading-relaxed`;

/**
 * Every editable word on the pricing page, in the order the page shows it.
 *
 * The billing points are flagged as shared: they are also the Terms' clauses,
 * so the form says so beside them rather than leaving staff to discover it.
 * The FAQ list is edited in place (add, remove, reorder) and posted as one
 * JSON field, validated on the server like everything else.
 */
export function PricingForm({
  content,
  tiers,
}: {
  content: PricingContent;
  /** Tiers that can be featured or given a tagline: key and name. */
  tiers: { key: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePricingAction, {});
  const [faqs, setFaqs] = useState(content.faqs);

  const move = (from: number, to: number) =>
    setFaqs((list) => {
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });

  return (
    <form action={action} className="max-w-3xl space-y-10">
      <input type="hidden" name="faqs" value={JSON.stringify(faqs)} />

      <fieldset className="space-y-4">
        <legend className="mb-3 font-sarlotte text-xl">Top of the page</legend>
        <div>
          <label htmlFor="pricing-headline" className={label}>Headline</label>
          <input id="pricing-headline" name="headline" defaultValue={content.headline} required maxLength={80} className={inputClass} />
        </div>
        <div>
          <label htmlFor="pricing-intro" className={label}>Introduction</label>
          <textarea id="pricing-intro" name="intro" defaultValue={content.intro} required maxLength={600} className={area} />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 font-sarlotte text-xl">Plan cards</legend>
        <p className="text-sm leading-relaxed text-[var(--paper-soft)]">
          Prices, limits and features come from each plan (Admin, Plans). These
          are the words around them, shown on the pricing page and the in-app
          billing page alike.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pricing-featured" className={label}>Plan to highlight</label>
            <select id="pricing-featured" name="featuredTier" defaultValue={content.featuredTier} className={inputClass}>
              <option value="">None</option>
              {tiers.map((tier) => (
                <option key={tier.key} value={tier.key}>{tier.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pricing-featured-label" className={label}>Highlight badge</label>
            <input id="pricing-featured-label" name="featuredLabel" defaultValue={content.featuredLabel} required maxLength={30} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="pricing-cta" className={label}>Button on each card (pricing page)</label>
            <input id="pricing-cta" name="ctaLabel" defaultValue={content.ctaLabel} required maxLength={40} className={inputClass} />
          </div>
        </div>
        {tiers.map((tier) => (
          <div key={tier.key}>
            <label htmlFor={`pricing-tagline-${tier.key}`} className={label}>
              Line under &ldquo;{tier.name}&rdquo; (optional)
            </label>
            <input
              id={`pricing-tagline-${tier.key}`}
              name={`tagline:${tier.key}`}
              defaultValue={content.taglines[tier.key] ?? ""}
              maxLength={140}
              className={inputClass}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-3 font-sarlotte text-xl">Billing points</legend>
        <p className="rounded-lg border border-[var(--pending-ink)]/50 bg-white px-4 py-3 text-sm leading-relaxed">
          <strong className="font-medium">These are also your Terms.</strong> Each
          point below is the matching clause of the Terms of service, word for
          word, so saving changes both pages. Have a lawyer read any change to
          refunds, renewal or failed payments, and keep the grace period in step
          with the plans&apos; grace days.
        </p>
        <div>
          <label htmlFor="pricing-billing-heading" className={label}>Section heading (pricing page)</label>
          <input id="pricing-billing-heading" name="billingHeading" defaultValue={content.billingHeading} required maxLength={80} className={inputClass} />
        </div>
        {POLICY_KEYS.map((key) => (
          <div key={key} className="space-y-2 rounded-lg border border-[var(--paper-rule)] bg-white p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-[var(--paper-soft)]">{POLICY_LABELS[key]}</p>
            <div>
              <label htmlFor={`policy-${key}-term`} className={label}>Title (pricing page)</label>
              <input id={`policy-${key}-term`} name={`policy:${key}:term`} defaultValue={content.policy[key].term} required maxLength={120} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`policy-${key}-detail`} className={label}>Text (pricing page and Terms)</label>
              <textarea id={`policy-${key}-detail`} name={`policy:${key}:detail`} defaultValue={content.policy[key].detail} required maxLength={1200} className={area} />
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 font-sarlotte text-xl">More questions</legend>
        <p className="text-sm leading-relaxed text-[var(--paper-soft)]">
          Shown after the billing points, on the pricing page only. Up to 12.
        </p>
        {faqs.map((faq, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-[var(--paper-rule)] bg-white p-4">
            <div>
              <label htmlFor={`faq-${i}-q`} className={label}>Question</label>
              <input
                id={`faq-${i}-q`}
                value={faq.question}
                maxLength={160}
                onChange={(e) => setFaqs((list) => list.map((f, j) => (j === i ? { ...f, question: e.target.value } : f)))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`faq-${i}-a`} className={label}>Answer</label>
              <textarea
                id={`faq-${i}-a`}
                value={faq.answer}
                maxLength={1200}
                onChange={(e) => setFaqs((list) => list.map((f, j) => (j === i ? { ...f, answer: e.target.value } : f)))}
                className={area}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className={secondaryButtonClass}>
                Move up
              </button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === faqs.length - 1} className={secondaryButtonClass}>
                Move down
              </button>
              <button type="button" onClick={() => setFaqs((list) => list.filter((_, j) => j !== i))} className={secondaryButtonClass}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFaqs((list) => [...list, { question: "", answer: "" }])}
          disabled={faqs.length >= 12}
          className={secondaryButtonClass}
        >
          Add a question
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--paper-rule)] pt-6">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        <a href="/pricing" target="_blank" rel="noopener" className="text-sm underline underline-offset-4">
          View pricing page
        </a>
        <a href="/terms#cancelling" target="_blank" rel="noopener" className="text-sm underline underline-offset-4">
          View Terms
        </a>
      </div>
      <ActionNote state={state} />
    </form>
  );
}
