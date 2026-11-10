import { query, queryOne } from "@/lib/db";
import {
  DEFAULT_PRICING_CONTENT,
  mergePricingContent,
  type PricingContent,
} from "@/lib/pricing-content";

/**
 * Reading and saving the editable page content (`site_content`, migration
 * 023). Server-only; the schema, defaults and merge are in
 * `pricing-content.ts`, which browser code can import.
 */
export * from "@/lib/pricing-content";

const KEY = "pricing";

export async function getPricingContent(): Promise<PricingContent> {
  try {
    const row = await queryOne<{ value: unknown }>(`select value from site_content where key = $1`, [KEY]);
    return mergePricingContent(row?.value);
  } catch (error) {
    console.error("[content] could not read pricing content; using defaults", error);
    return DEFAULT_PRICING_CONTENT;
  }
}

export async function savePricingContent(content: PricingContent, staffId: string): Promise<void> {
  await query(
    `insert into site_content (key, value, updated_at, updated_by)
     values ($1, $2::jsonb, now(), $3)
     on conflict (key) do update
       set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [KEY, JSON.stringify(content), staffId]
  );
}
