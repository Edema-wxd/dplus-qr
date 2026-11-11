/**
 * `applyPaystackEvent` against a scripted database: which statements run for
 * an upgrade, a forged activation and a late event from a replaced
 * subscription (DECISIONS.md, 10 November 2026). The SQL itself is exercised
 * against a real schema separately; here, what each delivery is allowed to do.
 */

type Rows = Record<string, unknown>[];
type Handler = { match: string; rows: (params: unknown[]) => Rows };

const calls: { text: string; params: unknown[]; inTransaction: boolean }[] = [];
let handlers: Handler[] = [];
let inTransaction = false;

function respond(text: string, params: unknown[] = []): Rows {
  calls.push({ text, params, inTransaction });
  const handler = handlers.find((h) => text.includes(h.match));
  return handler ? handler.rows(params) : [];
}

jest.mock("@/lib/db", () => ({
  query: async (text: string, params?: unknown[]) => respond(text, params),
  queryOne: async (text: string, params?: unknown[]) => respond(text, params)[0] ?? null,
  withTransaction: async <T,>(fn: (run: (t: string, p?: unknown[]) => Promise<Rows>) => Promise<T>) => {
    inTransaction = true;
    try {
      return await fn(async (t, p) => respond(t, p));
    } finally {
      inTransaction = false;
    }
  },
}));

const PRO = {
  id: 2,
  slug: "pro",
  name: "Pro",
  paystackPlanCode: "PLN_pro",
  amountKobo: 1_000_000,
  interval: "monthly",
  maxCodes: 50,
  historyDays: 365,
  graceDays: 7,
  features: {},
  isActive: true,
  sortOrder: 20,
};
jest.mock("@/lib/plans", () => ({
  getPlanByPaystackCode: async (code: string) => (code === "PLN_pro" ? PRO : null),
}));

const disableSubscription = jest.fn(async (_code: string, _token: string): Promise<unknown> => ({}));
jest.mock("@/lib/paystack", () => ({
  disableSubscription: (code: string, token: string) => disableSubscription(code, token),
}));

const alertOnce = jest.fn(async (_key: string, _subject: string, _text: string) => {});
jest.mock("@/lib/error-alerts", () => ({
  alertOnce: (key: string, subject: string, text: string) => alertOnce(key, subject, text),
}));

const notified: string[] = [];
jest.mock("@/lib/billing-notify", () => ({
  notifyPaymentSucceeded: async () => notified.push("succeeded"),
  notifyPaymentFailed: async () => notified.push("failed"),
  notifyCancelled: async () => notified.push("cancelled"),
}));

jest.mock("@/lib/codes", () => ({ purgeDestination: async () => {} }));

import { applyPaystackEvent } from "@/lib/billing";

const VICTIM = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

/** The statements every delivery reaches: the log row, and the account by email. */
function baseHandlers(): Handler[] {
  return [
    { match: "insert into qr_payment_events", rows: () => [{ id: "e1" }] },
    { match: "lower(email) = lower($1)", rows: () => [{ id: VICTIM }] },
  ];
}

function create(code = "SUB_new"): string {
  return JSON.stringify({
    event: "subscription.create",
    data: {
      id: 101,
      subscription_code: code,
      email_token: "tok_new",
      plan: { plan_code: "PLN_pro" },
      customer: { email: "victim@example.com", customer_code: "CUS_1" },
    },
  });
}

function ran(fragment: string) {
  return calls.filter((c) => c.text.includes(fragment));
}

beforeEach(() => {
  calls.length = 0;
  notified.length = 0;
  handlers = baseHandlers();
  disableSubscription.mockClear();
  alertOnce.mockClear();
});

describe("activating a subscription", () => {
  it("defers one nobody started here, without touching the account's plan", async () => {
    // Paid with the victim's email through Paystack Inline: no checkout intent.
    const outcome = await applyPaystackEvent(create());

    expect(outcome.kind).toBe("deferred");
    expect(ran("update qr_subscriptions")).toHaveLength(0);
    expect(ran("insert into qr_subscriptions")).toHaveLength(0);
    expect(disableSubscription).not.toHaveBeenCalled();
    expect(notified).toEqual([]);
  });

  it("defers one whose subscription already belongs to another account", async () => {
    handlers.unshift({
      match: "select user_id from qr_subscriptions where paystack_subscription_code",
      rows: () => [{ user_id: OTHER }],
    });
    const outcome = await applyPaystackEvent(create());
    expect(outcome.kind).toBe("deferred");
    expect(ran("insert into qr_subscriptions")).toHaveLength(0);
  });

  it("activates one the account started, uses up the checkout, and stops the plan it replaced", async () => {
    handlers.unshift(
      { match: "from qr_checkout_intents", rows: () => [{ id: "77" }] },
      { match: "update qr_checkout_intents", rows: () => [{ id: "77" }] },
      {
        match: "set status = 'cancelled', updated_at = now()",
        rows: () => [
          { paystack_subscription_code: "SUB_old", paystack_email_token: "tok_old", cancel_at_period_end: false },
          // The free plan, or a staff-assigned one: nothing at Paystack to stop.
          { paystack_subscription_code: null, paystack_email_token: null, cancel_at_period_end: false },
        ],
      }
    );

    const outcome = await applyPaystackEvent(create());

    expect(outcome).toMatchObject({ kind: "applied", change: "activate" });
    const [consume] = ran("update qr_checkout_intents");
    expect(consume.inTransaction).toBe(true);
    expect(consume.params).toEqual(["77", "SUB_new"]);
    expect(disableSubscription).toHaveBeenCalledTimes(1);
    expect(disableSubscription).toHaveBeenCalledWith("SUB_old", "tok_old");
    expect(notified).toEqual(["succeeded"]);
  });

  it("does not stop a replaced subscription the customer had already cancelled", async () => {
    handlers.unshift(
      { match: "from qr_checkout_intents", rows: () => [{ id: "77" }] },
      { match: "update qr_checkout_intents", rows: () => [{ id: "77" }] },
      {
        match: "set status = 'cancelled', updated_at = now()",
        rows: () => [
          { paystack_subscription_code: "SUB_old", paystack_email_token: "tok_old", cancel_at_period_end: true },
        ],
      }
    );
    await applyPaystackEvent(create());
    expect(disableSubscription).not.toHaveBeenCalled();
  });

  it("tells staff when the old subscription cannot be stopped, and keeps the new plan", async () => {
    handlers.unshift(
      { match: "from qr_checkout_intents", rows: () => [{ id: "77" }] },
      { match: "update qr_checkout_intents", rows: () => [{ id: "77" }] },
      {
        match: "set status = 'cancelled', updated_at = now()",
        rows: () => [
          { paystack_subscription_code: "SUB_old", paystack_email_token: "tok_old", cancel_at_period_end: false },
        ],
      }
    );
    disableSubscription.mockRejectedValueOnce(new Error("Paystack is down"));
    const quiet = jest.spyOn(console, "error").mockImplementation(() => {});

    const outcome = await applyPaystackEvent(create());

    expect(outcome.kind).toBe("applied");
    expect(alertOnce).toHaveBeenCalledTimes(1);
    expect(alertOnce.mock.calls[0][2]).toContain("SUB_old");
    quiet.mockRestore();
  });

  it("re-applies Paystack re-sending a subscription this account already holds", async () => {
    handlers.unshift({
      match: "select user_id from qr_subscriptions where paystack_subscription_code",
      rows: () => [{ user_id: VICTIM }],
    });
    const outcome = await applyPaystackEvent(create());
    expect(outcome.kind).toBe("applied");
    expect(ran("update qr_checkout_intents")).toHaveLength(0);
  });
});

describe("events about a subscription", () => {
  it("applies a cancellation only to the subscription it names", async () => {
    handlers.unshift({ match: "set status     = 'cancelled'", rows: () => [{ id: "1" }] });
    await applyPaystackEvent(
      JSON.stringify({ event: "subscription.disable", data: { id: 9, subscription_code: "SUB_old", customer: { email: "v@e" } } })
    );
    const [write] = ran("set status     = 'cancelled'");
    expect(write.text).toContain("paystack_subscription_code = $2");
    expect(write.params).toEqual([VICTIM, "SUB_old"]);
  });

  it("changes nothing and tells nobody when that subscription is no longer live", async () => {
    // The old Starter subscription disabled after an upgrade: no live row has it.
    const outcome = await applyPaystackEvent(
      JSON.stringify({ event: "subscription.disable", data: { id: 9, subscription_code: "SUB_old", customer: { email: "v@e" } } })
    );
    expect(outcome.kind).toBe("ignored");
    expect(ran("update qr_users")).toHaveLength(0);
    expect(notified).toEqual([]);
    const [processed] = ran("processed_at = now(), error = $2");
    expect(processed.params[1]).toContain("no live subscription");
  });

  it("matches a failed invoice on the subscription nested in it", async () => {
    await applyPaystackEvent(
      JSON.stringify({
        event: "invoice.payment_failed",
        data: { id: 12, subscription: { subscription_code: "SUB_new" }, customer: { email: "v@e" } },
      })
    );
    const [write] = ran("set status      = 'past_due'");
    expect(write.text).toContain("paystack_subscription_code = $3");
    expect(write.params[2]).toBe("SUB_new");
  });

  it("renews only the live row on the charge's plan", async () => {
    await applyPaystackEvent(
      JSON.stringify({
        event: "charge.success",
        data: { id: 13, status: "success", plan: "PLN_pro", customer: { email: "v@e" } },
      })
    );
    const [write] = ran("current_period_end = coalesce($2, current_period_end)");
    expect(write.text).toContain("plan_id = $3");
    expect(write.params[2]).toBe(PRO.id);
  });
});
