import { createHmac } from "node:crypto";
import {
  addDays,
  decideChange,
  eventKey,
  eventSchema,
  isHandled,
  nextPeriodEnd,
  planCodeOf,
} from "@/lib/billing-events";
import { verifySignature } from "@/lib/paystack";
import { resetEnvCache } from "@/lib/env";
import type { Plan } from "@/lib/plans";

const PLAN: Plan = {
  id: 2,
  slug: "pro",
  name: "Pro",
  paystackPlanCode: "PLN_pro",
  amountKobo: 400_000,
  interval: "monthly",
  maxCodes: 50,
  historyDays: 365,
  graceDays: 7,
  features: { csv_export: true, analytics: "trends" },
  isActive: true,
  sortOrder: 1,
};

const NOW = new Date("2026-06-15T10:00:00.000Z");

function parse(body: unknown) {
  const result = eventSchema.safeParse(body);
  if (!result.success) throw new Error(`fixture did not parse: ${result.error.message}`);
  return result.data;
}

describe("signature verification", () => {
  const SECRET = "sk_test_whatever";

  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    resetEnvCache();
  });

  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    resetEnvCache();
  });

  function sign(body: string): string {
    return createHmac("sha512", SECRET).update(body, "utf8").digest("hex");
  }

  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ event: "charge.success", data: { id: 1 } });
    expect(verifySignature(body, sign(body))).toBe(true);
  });

  it("rejects a missing signature", () => {
    expect(verifySignature("{}", null)).toBe(false);
  });

  it("rejects a signature of a different body", () => {
    expect(verifySignature('{"event":"a"}', sign('{"event":"b"}'))).toBe(false);
  });

  it("rejects a wrong-length signature without throwing", () => {
    // timingSafeEqual throws on mismatched lengths, so this must be caught
    // before it gets there -- a truncated header is a rejection, not a crash.
    expect(verifySignature("{}", "abc")).toBe(false);
  });

  /**
   * The reason the route reads the raw body once. Re-serialising moves key
   * order and whitespace, so the bytes differ and a genuine delivery fails.
   */
  it("fails once the body has been round-tripped through JSON", () => {
    const raw = '{"event":"charge.success",  "data":{"id":1}}';
    const signature = sign(raw);
    expect(verifySignature(raw, signature)).toBe(true);
    expect(verifySignature(JSON.stringify(JSON.parse(raw)), signature)).toBe(false);
  });
});

describe("event keys", () => {
  it("keys on the event name and the subject id", () => {
    const event = parse({ event: "charge.success", data: { id: 99 } });
    expect(eventKey(event, "{}")).toBe("charge.success:99");
  });

  it("gives two separate renewals two keys", () => {
    const june = parse({ event: "charge.success", data: { id: 1 } });
    const july = parse({ event: "charge.success", data: { id: 2 } });
    expect(eventKey(june, "{}")).not.toBe(eventKey(july, "{}"));
  });

  it("keys the same delivery identically however often it arrives", () => {
    const body = '{"event":"charge.success","data":{"id":7}}';
    expect(eventKey(parse(JSON.parse(body)), body)).toBe(
      eventKey(parse(JSON.parse(body)), body)
    );
  });

  it("falls back to hashing the body when there is no id", () => {
    const event = parse({ event: "subscription.disable", data: {} });
    const key = eventKey(event, '{"a":1}');
    expect(key).toMatch(/^subscription\.disable:body:[0-9a-f]{64}$/);
    expect(key).not.toBe(eventKey(event, '{"a":2}'));
  });
});

describe("plan codes", () => {
  it("reads the object form", () => {
    expect(planCodeOf(parse({ event: "x", data: { plan: { plan_code: "PLN_a" } } }))).toBe(
      "PLN_a"
    );
  });

  it("reads the string form", () => {
    expect(planCodeOf(parse({ event: "x", data: { plan: "PLN_b" } }))).toBe("PLN_b");
  });

  /** Paystack sends `"plan": []` on a one-off charge. Not a plan. */
  it("treats the empty-array form as no plan", () => {
    expect(planCodeOf(parse({ event: "x", data: { plan: [] } }))).toBeNull();
  });

  it("treats a missing plan as no plan", () => {
    expect(planCodeOf(parse({ event: "x", data: {} }))).toBeNull();
  });
});

describe("period arithmetic", () => {
  it("adds a month for a monthly plan", () => {
    expect(nextPeriodEnd(new Date("2026-01-10T00:00:00Z"), "monthly").toISOString()).toBe(
      "2026-02-10T00:00:00.000Z"
    );
  });

  it("adds a year for an annual plan", () => {
    expect(nextPeriodEnd(new Date("2026-01-10T00:00:00Z"), "annually").toISOString()).toBe(
      "2027-01-10T00:00:00.000Z"
    );
  });

  /** 31 January has no 31 February; rolling into March is the documented result. */
  it("rolls a month-end date forward rather than inventing a date", () => {
    const end = nextPeriodEnd(new Date("2026-01-31T00:00:00Z"), "monthly");
    expect(end.toISOString().slice(0, 7)).toBe("2026-03");
  });
});

describe("decideChange", () => {
  it("activates on subscription.create, using the given next payment date", () => {
    const change = decideChange(
      parse({
        event: "subscription.create",
        data: {
          id: 1,
          subscription_code: "SUB_x",
          email_token: "tok",
          next_payment_date: "2026-07-15T10:00:00Z",
          plan: { plan_code: "PLN_pro" },
        },
      }),
      { plan: PLAN, now: NOW }
    );

    expect(change).toEqual({
      kind: "activate",
      subscriptionCode: "SUB_x",
      emailToken: "tok",
      currentPeriodEnd: new Date("2026-07-15T10:00:00Z"),
    });
  });

  it("computes a period end when subscription.create omits one", () => {
    const change = decideChange(
      parse({
        event: "subscription.create",
        data: { id: 1, subscription_code: "SUB_x", plan: { plan_code: "PLN_pro" } },
      }),
      { plan: PLAN, now: NOW }
    );

    expect(change.kind).toBe("activate");
    if (change.kind !== "activate") throw new Error("unreachable");
    expect(change.currentPeriodEnd?.toISOString()).toBe("2026-07-15T10:00:00.000Z");
  });

  it("extends on a renewal charge", () => {
    const change = decideChange(
      parse({
        event: "charge.success",
        data: { id: 2, status: "success", paid_at: "2026-06-15T10:00:00Z", plan: "PLN_pro" },
      }),
      { plan: PLAN, now: NOW }
    );

    expect(change).toEqual({
      kind: "extend",
      currentPeriodEnd: new Date("2026-07-15T10:00:00.000Z"),
    });
  });

  /**
   * The important negative. A one-off payment must never be read as buying a
   * subscription, or someone who paid for something else gets a plan free.
   */
  it("ignores a charge with no plan", () => {
    const change = decideChange(
      parse({ event: "charge.success", data: { id: 3, status: "success" } }),
      { plan: null, now: NOW }
    );
    expect(change.kind).toBe("ignore");
  });

  it("ignores a charge.success whose status is not success", () => {
    const change = decideChange(
      parse({ event: "charge.success", data: { id: 4, status: "failed", plan: "PLN_pro" } }),
      { plan: PLAN, now: NOW }
    );
    expect(change.kind).toBe("ignore");
  });

  it("sets grace from the plan on a failed invoice", () => {
    const change = decideChange(
      parse({ event: "invoice.payment_failed", data: { id: 5, plan: "PLN_pro" } }),
      { plan: PLAN, now: NOW }
    );

    expect(change).toEqual({ kind: "past_due", graceUntil: addDays(NOW, 7) });
  });

  it("still grants grace when the plan could not be matched", () => {
    // No grace at all would cut a paying customer's codes off instantly over a
    // plan-code mismatch, which is the opposite of the one rule.
    const change = decideChange(
      parse({ event: "invoice.payment_failed", data: { id: 6 } }),
      { plan: null, now: NOW }
    );
    expect(change).toEqual({ kind: "past_due", graceUntil: addDays(NOW, 7) });
  });

  it("honours a plan's own grace length", () => {
    const change = decideChange(
      parse({ event: "invoice.payment_failed", data: { id: 7, plan: "PLN_pro" } }),
      { plan: { ...PLAN, graceDays: 14 }, now: NOW }
    );
    expect(change).toEqual({ kind: "past_due", graceUntil: addDays(NOW, 14) });
  });

  it("marks cancelling on not_renew and cancelled on disable", () => {
    expect(
      decideChange(parse({ event: "subscription.not_renew", data: { id: 8 } }), {
        plan: PLAN,
        now: NOW,
      })
    ).toEqual({ kind: "cancel_at_period_end" });

    expect(
      decideChange(parse({ event: "subscription.disable", data: { id: 9 } }), {
        plan: PLAN,
        now: NOW,
      })
    ).toEqual({ kind: "cancelled" });
  });

  it("ignores events it does not handle", () => {
    expect(isHandled("customeridentification.success")).toBe(false);
    const change = decideChange(
      parse({ event: "customeridentification.success", data: { id: 10 } }),
      { plan: PLAN, now: NOW }
    );
    expect(change.kind).toBe("ignore");
  });
});

describe("payload schema", () => {
  /**
   * Paystack adds fields without warning. Rejecting unknown ones would turn
   * their release into our billing outage, so the schema keeps them instead.
   */
  it("keeps fields it does not describe", () => {
    const parsed = parse({
      event: "charge.success",
      data: { id: 1, something_new: { nested: true } },
      top_level_novelty: 42,
    });
    expect((parsed as Record<string, unknown>).top_level_novelty).toBe(42);
    expect((parsed.data as Record<string, unknown>).something_new).toEqual({ nested: true });
  });

  it("refuses a body with no event name", () => {
    expect(eventSchema.safeParse({ data: { id: 1 } }).success).toBe(false);
  });
});
