/**
 * The period-end backstop (DECISIONS.md, 11 November 2026): what Paystack's
 * record of an overdue subscription is allowed to change here, and that a
 * write never overrides a webhook that landed while the job was running.
 */

const calls: { text: string; params: unknown[] }[] = [];
let rowsFor: (text: string) => Record<string, unknown>[] = () => [];
jest.mock("@/lib/db", () => ({
  query: async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return rowsFor(text);
  },
}));

const fetchSubscription = jest.fn();
jest.mock("@/lib/paystack", () => ({ fetchSubscription: (c: string) => fetchSubscription(c) }));
const alertOnce = jest.fn(async (_k: string, _s: string, _t: string) => {});
jest.mock("@/lib/error-alerts", () => ({ alertOnce: (k: string, s: string, t: string) => alertOnce(k, s, t) }));
const notifyPaymentFailed = jest.fn(async () => {});
jest.mock("@/lib/billing-notify", () => ({ notifyPaymentFailed: (...a: unknown[]) => notifyPaymentFailed(...(a as [])) }));
jest.mock("@/lib/codes", () => ({ purgeDestination: async () => {} }));

import {
  decideReconciliation,
  reconcileOverdueSubscriptions,
  type OverdueSubscription,
} from "@/lib/billing-reconcile";

const NOW = new Date("2026-11-11T03:20:00Z");
const ROW: OverdueSubscription = {
  id: "5",
  userId: "11111111-1111-1111-1111-111111111111",
  currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
  subscriptionCode: "SUB_a",
  planCode: "PLN_pro",
  planName: "Pro",
  graceDays: 7,
};
const sub = (status: string, next: string | null = null, plan = "PLN_pro") => ({
  subscription_code: "SUB_a",
  email_token: "tok",
  status,
  next_payment_date: next,
  plan: { plan_code: plan },
});

describe("decideReconciliation", () => {
  it("ends a subscription Paystack has cancelled or completed", () => {
    expect(decideReconciliation(ROW, sub("cancelled"), NOW).kind).toBe("ended");
    expect(decideReconciliation(ROW, sub("completed"), NOW).kind).toBe("ended");
  });

  it("moves the period on when Paystack has charged a renewal we never heard about", () => {
    expect(decideReconciliation(ROW, sub("active", "2026-12-01T00:00:00Z"), NOW)).toEqual({
      kind: "renewed",
      periodEnd: new Date("2026-12-01T00:00:00Z"),
      notRenewing: false,
    });
    expect(decideReconciliation(ROW, sub("non-renewing", "2026-12-01T00:00:00Z"), NOW)).toMatchObject({
      kind: "renewed",
      notRenewing: true,
    });
  });

  it("starts the plan's grace period when Paystack says the charge needs attention", () => {
    expect(decideReconciliation(ROW, sub("attention"), NOW)).toEqual({
      kind: "failing",
      graceUntil: new Date("2026-11-18T03:20:00Z"),
    });
  });

  /** A printed code must not go dark on a guess. */
  it("changes nothing when Paystack's answer is not plain", () => {
    expect(decideReconciliation(ROW, sub("active", "2026-11-01T00:00:00Z"), NOW).kind).toBe("unclear");
    expect(decideReconciliation(ROW, sub("active", null), NOW).kind).toBe("unclear");
    expect(decideReconciliation(ROW, sub("something-new"), NOW).kind).toBe("unclear");
    expect(decideReconciliation(ROW, sub("cancelled", null, "PLN_other"), NOW).kind).toBe("unclear");
  });
});

describe("reconcileOverdueSubscriptions", () => {
  const overdue = {
    id: "5",
    user_id: ROW.userId,
    current_period_end: ROW.currentPeriodEnd,
    paystack_subscription_code: "SUB_a",
    plan_code: "PLN_pro",
    plan_name: "Pro",
    grace_days: 7,
  };

  beforeEach(() => {
    calls.length = 0;
    fetchSubscription.mockReset();
    alertOnce.mockClear();
    notifyPaymentFailed.mockClear();
  });

  it("looks only at active Paystack subscriptions past their period end", async () => {
    rowsFor = () => [];
    await reconcileOverdueSubscriptions(NOW);
    expect(calls[0].text).toContain("s.status = 'active'");
    expect(calls[0].text).toContain("paystack_subscription_code is not null");
    expect(calls[0].text).toContain("current_period_end < now()");
  });

  it("writes only if the row is still as it was read", async () => {
    rowsFor = (text) => (text.includes("from qr_subscriptions s") ? [overdue] : text.includes("update") ? [{ id: "5" }] : []);
    fetchSubscription.mockResolvedValue(sub("cancelled"));
    const result = await reconcileOverdueSubscriptions(NOW);
    expect(result.ended).toBe(1);
    const write = calls.find((c) => c.text.includes("update qr_subscriptions"))!;
    expect(write.text).toContain("status = 'active' and current_period_end = $2");
    expect(write.params.slice(0, 2)).toEqual(["5", ROW.currentPeriodEnd]);
  });

  it("counts nothing when a webhook changed the row first", async () => {
    rowsFor = (text) => (text.includes("from qr_subscriptions s") ? [overdue] : []);
    fetchSubscription.mockResolvedValue(sub("attention"));
    const result = await reconcileOverdueSubscriptions(NOW);
    expect(result.failing).toBe(0);
    expect(notifyPaymentFailed).not.toHaveBeenCalled();
  });

  it("tells the customer when their grace period starts", async () => {
    rowsFor = (text) => (text.includes("from qr_subscriptions s") ? [overdue] : text.includes("update") ? [{ id: "5" }] : []);
    fetchSubscription.mockResolvedValue(sub("attention"));
    expect((await reconcileOverdueSubscriptions(NOW)).failing).toBe(1);
    expect(notifyPaymentFailed).toHaveBeenCalledTimes(1);
  });

  it("lists what it could not settle for staff, and changes none of it", async () => {
    rowsFor = (text) => (text.includes("from qr_subscriptions s") ? [overdue] : []);
    fetchSubscription.mockRejectedValue(new Error("Paystack 500"));
    const result = await reconcileOverdueSubscriptions(NOW);
    expect(result.unclear).toBe(1);
    expect(calls.some((c) => c.text.includes("update qr_subscriptions"))).toBe(false);
    expect(alertOnce).toHaveBeenCalledTimes(1);
    expect(alertOnce.mock.calls[0][2]).toContain("SUB_a");
  });
});
