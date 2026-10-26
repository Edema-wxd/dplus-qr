import { query, queryOne } from "@/lib/db";

/**
 * Reading `qr_plans`. Nothing here decides what a plan allows -- migration 003
 * put that in the table so a limit change is an UPDATE, not a deploy -- so this
 * module only ever selects.
 */
export type Plan = {
  id: number;
  slug: string;
  name: string;
  paystackPlanCode: string | null;
  amountKobo: number;
  interval: "monthly" | "annually";
  maxCodes: number;
  historyDays: number;
  graceDays: number;
  /**
   * Per-plan flags from the `features` jsonb: `csv_export`, `analytics`,
   * `support`, `months_free` and so on. Typed as an open record on purpose --
   * migration 003 puts plan capability in the row so adding one is an UPDATE,
   * and a closed type here would make every new flag a deploy.
   */
  features: PlanFeatures;
  isActive: boolean;
  sortOrder: number;
};

export type PlanFeatures = {
  csv_export?: boolean;
  analytics?: "basic" | "trends";
  support?: string;
  months_free?: number;
  team_seats?: boolean;
  bulk_creation?: boolean;
  /** Owner-chosen short codes, such as `qriateplus.com/dplus`. */
  custom_codes?: boolean;
} & Record<string, unknown>;

type Row = {
  id: string;
  slug: string;
  name: string;
  paystack_plan_code: string | null;
  amount_kobo: string;
  interval: "monthly" | "annually";
  max_codes: number;
  history_days: number;
  grace_days: number;
  features: PlanFeatures | null;
  is_active: boolean;
  sort_order: number;
};

/**
 * `bigserial` and `bigint` arrive as strings from `pg`, because a 64-bit
 * integer does not fit a JS number. Both of these comfortably do, so they are
 * converted once here rather than at every call site.
 */
function toPlan(row: Row): Plan {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    paystackPlanCode: row.paystack_plan_code,
    amountKobo: Number(row.amount_kobo),
    interval: row.interval,
    maxCodes: row.max_codes,
    historyDays: row.history_days,
    graceDays: row.grace_days,
    features: row.features ?? {},
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}

const COLUMNS = `
  id, slug, name, paystack_plan_code, amount_kobo, interval,
  max_codes, history_days, grace_days, features, is_active, sort_order
`;

/** Plans a customer may choose, in display order. Excludes free and retired. */
export async function listPurchasablePlans(): Promise<Plan[]> {
  const rows = await query<Row>(
    `select ${COLUMNS} from qr_plans
     where is_active
       and amount_kobo > 0
       and paystack_plan_code is not null
     order by sort_order, amount_kobo`
  );
  return rows.map(toPlan);
}

/**
 * Paid plans for the public pricing page, whether or not Paystack has a code
 * for them yet. Prices are decided (decision 17) before checkout is wired, and
 * the page says which ones can be bought online rather than hiding the rest.
 */
export async function listPublicPlans(): Promise<Plan[]> {
  const rows = await query<Row>(
    `select ${COLUMNS} from qr_plans
     where is_active and amount_kobo > 0
     order by sort_order, amount_kobo`
  );
  return rows.map(toPlan);
}

/** Every row, retired and free included, for the staff admin. */
export async function listAllPlans(): Promise<Plan[]> {
  const rows = await query<Row>(
    `select ${COLUMNS} from qr_plans order by sort_order, amount_kobo`
  );
  return rows.map(toPlan);
}

export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  const row = await queryOne<Row>(
    `select ${COLUMNS} from qr_plans where slug = $1`,
    [slug]
  );
  return row ? toPlan(row) : null;
}

/**
 * Match an incoming webhook to a plan.
 *
 * A charge for a plan code we do not hold is not an error to swallow: it means
 * someone created a plan in the Paystack dashboard that this database has never
 * been told about, and the subscription cannot be given limits. The caller logs
 * it and leaves the event unprocessed so it can be replayed after seeding.
 */
export async function getPlanByPaystackCode(code: string): Promise<Plan | null> {
  const row = await queryOne<Row>(
    `select ${COLUMNS} from qr_plans where paystack_plan_code = $1`,
    [code]
  );
  return row ? toPlan(row) : null;
}
