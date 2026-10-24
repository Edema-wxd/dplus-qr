/**
 * Create the Paystack plans that `qr_plans` describes, and store the codes
 * they come back with.
 *
 *   npm run plans:sync -- --dry-run     # report only, touches nothing
 *   npm run plans:sync
 *
 * Exists because `paystack_plan_code` is the one column migration 013 cannot
 * fill: the code is minted by Paystack. Copying six of them by hand into SQL
 * is exactly the job that produces a Pro subscription charging Starter money,
 * and the mistake would be invisible until someone's card was charged.
 *
 * Idempotent in both directions. A plan that already has a code is left alone;
 * a plan whose name, amount and interval already exist in Paystack is adopted
 * rather than duplicated, so a half-finished run can simply be run again.
 *
 * `tsx` compiles to CJS, so no top-level await -- hence main().
 */
import { Client } from "pg";

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  amount_kobo: string;
  interval: string;
  paystack_plan_code: string | null;
};

type PaystackPlan = {
  id: number;
  name: string;
  plan_code: string;
  amount: number;
  interval: string;
};

const API = "https://api.paystack.co";

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    console.error(
      "PAYSTACK_SECRET_KEY is not set. Scripts read .env.local via `tsx --env-file`;\n" +
        "a missing file is a silent empty environment, so check it exists."
    );
    process.exit(1);
  }
  return key;
}

async function paystack<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${secret()}`,
      "content-type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const payload = (await response.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: T }
    | null;

  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message ?? `Paystack ${path} failed: ${response.status}`);
  }
  return payload.data as T;
}

/**
 * A Paystack plan is "the same" as ours when the name, the amount and the
 * interval all match. Name alone is not enough: Starter exists twice, monthly
 * and annual, and adopting the wrong one would bill a year as a month.
 */
function matches(remote: PaystackPlan, local: PlanRow): boolean {
  return (
    remote.name.trim().toLowerCase() === planTitle(local).toLowerCase() &&
    remote.amount === Number(local.amount_kobo) &&
    remote.interval === local.interval
  );
}

/** What the customer sees on their Paystack receipt. */
function planTitle(local: PlanRow): string {
  const period = local.interval === "annually" ? "Annual" : "Monthly";
  return `QRiate+ ${local.name} ${period}`;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL. Run `neon env pull`, or check .env.local exists.");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const { rows: locals } = await client.query<PlanRow>(
      `select id, slug, name, amount_kobo, interval, paystack_plan_code
         from qr_plans
        where is_active and amount_kobo > 0
        order by sort_order`
    );

    if (locals.length === 0) {
      console.log("No paid plans in qr_plans. Nothing to sync.");
      return;
    }

    const remote = await paystack<PaystackPlan[]>("/plan?perPage=100");
    console.log(`${locals.length} paid plan(s) locally, ${remote.length} in Paystack.\n`);

    for (const local of locals) {
      const label = local.slug.padEnd(18);

      if (local.paystack_plan_code) {
        console.log(`  ${label} already linked (${local.paystack_plan_code})`);
        continue;
      }

      const existing = remote.find((candidate) => matches(candidate, local));

      if (existing) {
        console.log(`  ${label} adopting existing Paystack plan ${existing.plan_code}`);
        if (!dryRun) {
          await client.query("update qr_plans set paystack_plan_code = $2 where id = $1", [
            local.id,
            existing.plan_code,
          ]);
        }
        continue;
      }

      if (dryRun) {
        console.log(
          `  ${label} would create "${planTitle(local)}" ` +
            `(${Number(local.amount_kobo) / 100} NGN, ${local.interval})`
        );
        continue;
      }

      const created = await paystack<PaystackPlan>("/plan", {
        method: "POST",
        body: {
          name: planTitle(local),
          amount: Number(local.amount_kobo),
          interval: local.interval,
          currency: "NGN",
        },
      });

      await client.query("update qr_plans set paystack_plan_code = $2 where id = $1", [
        local.id,
        created.plan_code,
      ]);
      console.log(`  ${label} created ${created.plan_code}`);
    }

    console.log(
      dryRun
        ? "\nDry run: nothing was created or written."
        : "\nDone. Paid plans are now purchasable."
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
