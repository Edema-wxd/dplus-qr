/** @jest-environment node */

/**
 * What the webhook answers Paystack (DECISIONS.md, 11 November 2026). Paystack
 * re-delivers anything that is not a 200, so the status code decides whether
 * an event that failed here comes back.
 */

const afterQueue: (() => unknown)[] = [];
jest.mock("next/server", () => ({ after: (fn: () => unknown) => afterQueue.push(fn) }));
jest.mock("@/lib/env", () => ({ env: () => ({ PAYSTACK_SECRET_KEY: "sk_test_x" }) }));
jest.mock("@/lib/paystack", () => ({ verifySignature: (_b: string, s: string | null) => s === "good" }));

const reportError = jest.fn(async () => {});
jest.mock("@/lib/error-alerts", () => ({ reportError: (...a: unknown[]) => reportError(...(a as [])) }));

const applyPaystackEvent = jest.fn();
jest.mock("@/lib/billing", () => ({ applyPaystackEvent: (b: string) => applyPaystackEvent(b) }));

import { POST } from "@/app/api/paystack/webhook/route";

const deliver = (signature = "good") =>
  POST(
    new Request("https://qriateplus.com/api/paystack/webhook", {
      method: "POST",
      headers: { "x-paystack-signature": signature },
      body: '{"event":"charge.success","data":{"id":1}}',
    })
  );

beforeEach(() => {
  afterQueue.length = 0;
  applyPaystackEvent.mockReset();
  reportError.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

it("refuses a bad signature without applying anything", async () => {
  expect((await deliver("bad")).status).toBe(401);
  expect(applyPaystackEvent).not.toHaveBeenCalled();
});

it("applies the event before answering 200, and leaves the side effects for after", async () => {
  const followUp = jest.fn(async () => {});
  applyPaystackEvent.mockResolvedValue({ kind: "applied", eventKey: "k", change: "extend", followUp });
  const response = await deliver();
  expect(response.status).toBe(200);
  expect(followUp).not.toHaveBeenCalled();
  expect(afterQueue).toEqual([followUp]);
});

it("answers 500 when applying throws, so Paystack delivers it again", async () => {
  applyPaystackEvent.mockRejectedValue(new Error("Connection terminated"));
  const response = await deliver();
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await Promise.all(afterQueue.map((fn) => fn()));
  expect(reportError).toHaveBeenCalledTimes(1);
});

it("answers 503 while another attempt holds the event", async () => {
  applyPaystackEvent.mockResolvedValue({ kind: "busy", eventKey: "k" });
  expect((await deliver()).status).toBe(503);
});

it("answers 200 to an event that needs a person, and to one already applied", async () => {
  applyPaystackEvent.mockResolvedValue({ kind: "deferred", eventKey: "k", why: "no matching account", followUp: async () => {} });
  expect((await deliver()).status).toBe(200);
  expect(afterQueue).toHaveLength(1);
  applyPaystackEvent.mockResolvedValue({ kind: "duplicate", eventKey: "k" });
  expect((await deliver()).status).toBe(200);
});
