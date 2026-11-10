import { z } from "zod";

/**
 * Editable page content, starting with the pricing page: the schema, the
 * defaults and the merge. Pure, so the admin form (a client component) and
 * `legal.ts` can import it without pulling the database driver into a
 * browser bundle; the reads and writes are in `site-content.ts`.
 *
 * Staff edit it at `/admin/pricing`; it is stored as one JSON document in
 * `site_content` (migration 023) and validated here on the way in and on the
 * way out, so a bad row can never reach a public page: anything that does not
 * parse falls back to the defaults below, field by field.
 *
 * **The four billing points are shared with the Terms.** The pricing page's
 * "How billing works" and the matching clauses of `/terms` both render from
 * `policy`, so editing one edits the other and the two cannot disagree. Their
 * defaults are the Terms' own wording.
 *
 * Plain text only, every field length-capped. React escapes it, and nothing
 * here is ever rendered as HTML, so the admin cannot be used to put markup
 * or script on a public page.
 */

export const POLICY_KEYS = ["billing", "refunds", "missed_payment", "static_codes"] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

/** Where each billing point appears, said in the admin beside its fields. */
export const POLICY_LABELS: Record<PolicyKey, string> = {
  billing: "Billing and renewal (Terms: Plans and payment)",
  refunds: "Refunds (Terms: Cancelling, and refunds)",
  missed_payment: "Failed payments (Terms: When a payment fails)",
  static_codes: "Static codes (Terms: Plans and payment)",
};

const line = (max: number) => z.string().trim().min(1, "This cannot be empty.").max(max, `Keep it under ${max} characters.`);
const optional = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);

const policyItem = z.object({ term: line(120), detail: line(1200) });

export const pricingContentSchema = z.object({
  headline: line(80),
  intro: line(600),
  /** The tier key (`pro` for pro-monthly and pro-annual) shown as most popular, or "" for none. */
  featuredTier: z.string().trim().max(48).regex(/^[a-z0-9-]*$/, "Use a plan's slug without -monthly or -annual."),
  featuredLabel: line(30),
  /** One line under a tier's name, by tier key. */
  taglines: z.record(z.string().regex(/^[a-z0-9-]{1,48}$/), optional(140)),
  ctaLabel: line(40),
  billingHeading: line(80),
  policy: z.object({
    billing: policyItem,
    refunds: policyItem,
    missed_payment: policyItem,
    static_codes: policyItem,
  }),
  /** Further questions, pricing page only. */
  faqs: z.array(z.object({ question: line(160), answer: line(1200) })).max(12),
});

export type PricingContent = z.infer<typeof pricingContentSchema>;

/**
 * Grace days in the default failed-payment wording. The plan rows hold the
 * real value (`grace_days`, migration 013); if a plan's grace period changes,
 * edit this point in the admin, which updates the Terms with it.
 */
const GRACE_DAYS = 7;

export const DEFAULT_PRICING_CONTENT: PricingContent = {
  headline: "Plans and pricing",
  intro:
    "Every plan re-points any code at any time, for as long as the printed thing exists. Plans differ in how many codes you hold, how long scan history is kept, and what you can export.",
  featuredTier: "pro",
  featuredLabel: "Most popular",
  taglines: {},
  ctaLabel: "Create an account",
  billingHeading: "How billing works",
  policy: {
    billing: {
      term: "Billed in naira through Paystack",
      detail:
        "Plans are billed in naira through Paystack, monthly or annually, and charged in advance. A subscription renews automatically on the same cycle until you cancel it.",
    },
    refunds: {
      term: "Charged in advance, not refundable",
      detail:
        "Payments are not refundable, including for a period you only partly used. Because cancelling always runs to the end of the paid period, you never pay for time you cannot use.",
    },
    missed_payment: {
      term: "A missed payment pauses, it does not delete",
      detail: `A failed renewal does not stop your codes that day. We email you and your codes keep working for a grace period of ${GRACE_DAYS} days while you sort the payment out. If the grace period ends unpaid, your codes pause and scans meet the paused page. A successful payment restores them.`,
    },
    static_codes: {
      term: "Static codes are free on every plan",
      detail:
        "A static code encodes its content directly, so it needs no slot and never stops working. Only dynamic codes count towards a plan's limit.",
    },
  },
  faqs: [],
};

/**
 * Read what is stored, over the defaults. Each top-level field is checked on
 * its own, so one bad field falls back alone and the rest of an edit survives;
 * a database that cannot be reached falls back to the defaults entirely. A
 * public page never fails because of this.
 */
export function mergePricingContent(stored: unknown): PricingContent {
  const base = DEFAULT_PRICING_CONTENT;
  if (!stored || typeof stored !== "object") return base;
  const raw = stored as Record<string, unknown>;
  const shape = pricingContentSchema.shape;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(shape) as (keyof PricingContent)[]) {
    if (!(key in raw)) continue;
    const parsed = shape[key].safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  return out as PricingContent;
}
