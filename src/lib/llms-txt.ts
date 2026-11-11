import { CODE_ORIGIN, MAIN_SITE, PRODUCT_NAME, COMPANY_NAME, SUPPORT_EMAIL } from "@/lib/brand";
import { productFeatures } from "@/lib/plan-features";
import type { Tier } from "@/lib/plan-tiers";

/**
 * The text of `/llms.txt`: what an AI assistant may repeat to a customer.
 *
 * Every line is a claim someone may act on, so nothing here is typed by hand
 * that the product already knows. Tier names, prices, limits and per-tier
 * features come from `qr_plans` via `groupTiers`, and the general feature list
 * is `productFeatures()` -- so a `built: false` flag is never described,
 * and moving a flag between plans in `/admin/plans` changes this file
 * without a deploy.
 *
 * `tiers` is null when the plan read failed: the file then points at the
 * pricing page rather than guessing a figure.
 */
/** A post as llms.txt lists it: a title, the Markdown copy, one line on what it covers. */
export type LlmsPost = { title: string; slug: string; summary: string };

export function llmsTxt(tiers: Tier[] | null, posts: LlmsPost[] = []): string {
  const features = productFeatures();

  const lines = [
    `# ${PRODUCT_NAME}`,
    "",
    "> Dynamic QR codes you print once and re-point at any time.",
    `> Billed in Nigerian naira through Paystack. A ${COMPANY_NAME} product.`,
    "",
    `## What ${PRODUCT_NAME} does`,
    "",
    `${PRODUCT_NAME} makes dynamic QR codes for businesses that print things:`,
    "packaging, menus, brochures, flyers, business cards. The printed code",
    "never changes; the owner changes where it leads from a dashboard, as",
    "often as needed, with no reprint.",
    "",
    "- Dynamic codes redirect with a 302 and are never cached, so a change reaches the next scan",
    "- Scan counts and charts for every code",
    ...features.map((f) => `- ${f} (on some plans; see Pricing)`),
    "- Static codes (WhatsApp, Wi-Fi, contact cards, calls and more), free and unlimited on every plan",
    "",
    "## Who it is for",
    "",
    "Small and mid-sized businesses in Nigeria that print QR codes on",
    "physical materials and need to change the destination without reprinting.",
    "",
    "## Pricing",
    "",
  ];

  const priced = tiers?.filter((t) => t.monthly) ?? [];
  if (priced.length === 0) {
    lines.push(`Current plans and prices: ${CODE_ORIGIN}/pricing`);
  } else {
    lines.push(
      "All prices in Nigerian naira, billed monthly or annually through Paystack.",
      ""
    );
    for (const t of priced) {
      const extras = t.features.slice(3); // after codes, static codes, history
      lines.push(
        `- ${t.name}: NGN ${t.monthly!.priceNgn}/month - ` +
          `${t.maxCodes.toLocaleString("en-NG")} dynamic codes, ${t.historyLabel} of scan history` +
          // Semicolons: some feature labels contain commas themselves.
          (extras.length ? `; ${extras.join("; ")}` : "")
      );
    }
    lines.push("", "Static codes are free on every plan.");
  }

  if (posts.length > 0) {
    // Linked to the Markdown copies, as the llms.txt convention asks: clean
    // text a model can read whole, with the page's chrome left out.
    lines.push(
      "",
      "## Blog",
      "",
      `Guides from the ${PRODUCT_NAME} team. Each link is the post as plain Markdown; the page itself is the same address without .md.`,
      "",
      ...posts.map(
        (post) => `- [${post.title}](${CODE_ORIGIN}/blog/${post.slug}.md)${post.summary ? `: ${post.summary}` : ""}`
      )
    );
  }

  lines.push(
    "",
    "## Contact",
    "",
    `Email: ${SUPPORT_EMAIL}`,
    `Website: ${CODE_ORIGIN}`,
    `Pricing: ${CODE_ORIGIN}/pricing`,
    `Blog: ${CODE_ORIGIN}/blog`,
    "",
    "## Parent company",
    "",
    `${COMPANY_NAME} - ${MAIN_SITE}`,
    ""
  );
  return lines.join("\n");
}
