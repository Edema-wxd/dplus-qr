"use server";

import { revalidatePath } from "next/cache";
import { listAllPlans } from "@/lib/plans";
import { tierKey } from "@/lib/plan-tiers";
import {
  getPricingContent,
  POLICY_KEYS,
  pricingContentSchema,
  savePricingContent,
} from "@/lib/site-content";
import { recordChange, staffForAction } from "./guard";
import type { AdminFormState } from "./actions";

/**
 * Save the pricing page's wording. Staff only, validated against the same
 * schema the public pages read through, audited with the before and after.
 *
 * Revalidates `/terms` as well as `/pricing`: the billing points are the
 * Terms' own clauses, so both pages change together.
 */
export async function savePricingAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return { error: "Only staff can do that." };

  // Tiers that exist, so a typo cannot feature a tier nobody can buy.
  const tiers = new Set(
    (await listAllPlans()).filter((p) => p.amountKobo > 0).map((p) => tierKey(p.slug))
  );

  let faqs: unknown = [];
  try {
    faqs = JSON.parse(String(form.get("faqs") ?? "[]"));
  } catch {
    return { error: "The FAQ list could not be read. Reload the page and try again." };
  }

  const taglines: Record<string, string> = {};
  for (const key of tiers) {
    const value = String(form.get(`tagline:${key}`) ?? "").trim();
    if (value) taglines[key] = value;
  }

  const policy = Object.fromEntries(
    POLICY_KEYS.map((key) => [
      key,
      { term: form.get(`policy:${key}:term`), detail: form.get(`policy:${key}:detail`) },
    ])
  );

  const parsed = pricingContentSchema
    .refine((value) => value.featuredTier === "" || tiers.has(value.featuredTier), {
      message: "Choose a plan that exists, or none.",
      path: ["featuredTier"],
    })
    .safeParse({
      headline: form.get("headline"),
      intro: form.get("intro"),
      featuredTier: form.get("featuredTier") ?? "",
      featuredLabel: form.get("featuredLabel"),
      taglines,
      ctaLabel: form.get("ctaLabel"),
      billingHeading: form.get("billingHeading"),
      policy,
      faqs,
    });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue ? `${issue.path.join(" › ") || "Form"}: ${issue.message}` : "Check the form." };
  }

  const before = await getPricingContent();
  try {
    await savePricingContent(parsed.data, staff.id);
  } catch (error) {
    console.error("[admin] pricing content save failed", error);
    return { error: "Could not save. Please try again." };
  }

  await recordChange(staff, "pricing.update", "site_content", "pricing", {
    before,
    after: parsed.data,
  });
  revalidatePath("/pricing");
  revalidatePath("/terms");
  revalidatePath("/billing");
  return { notice: "Saved. The pricing page, the billing page and the Terms show it now." };
}
