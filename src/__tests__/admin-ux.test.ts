import { CUSTOMER_STATES, CUSTOMER_STATE_LABELS, customerFiltersSchema } from "@/lib/admin-billing";
import { reportFiltersSchema } from "@/lib/reports";

describe("customerFiltersSchema", () => {
  it("defaults to everyone, first page", () => {
    expect(customerFiltersSchema.parse({})).toEqual({ q: "", state: undefined, plan: undefined, page: 1 });
  });

  it("reads a state, a plan tier and a page", () => {
    expect(customerFiltersSchema.parse({ q: " ada ", state: "overdue", plan: "pro", page: "3" })).toEqual({
      q: "ada",
      state: "overdue",
      plan: "pro",
      page: 3,
    });
  });

  it("treats a bad value as 'any' rather than failing", () => {
    const parsed = customerFiltersSchema.parse({ state: "rich", plan: "Pro Plan!", page: "-2" });
    expect(parsed.state).toBeUndefined();
    expect(parsed.plan).toBeUndefined();
    expect(parsed.page).toBe(1);
  });

  it("keeps the old archived=1 link working", () => {
    expect(customerFiltersSchema.parse({ archived: "1" }).state).toBe("archived");
    expect(customerFiltersSchema.parse({ archived: "1", state: "suspended" }).state).toBe("suspended");
  });

  it("takes the first of a repeated parameter", () => {
    expect(customerFiltersSchema.parse({ state: ["paying", "free"] }).state).toBe("paying");
  });

  it("labels every state", () => {
    for (const state of CUSTOMER_STATES) expect(CUSTOMER_STATE_LABELS[state]).toBeTruthy();
  });
});

describe("reportFiltersSchema", () => {
  it("opens on the open queue", () => {
    expect(reportFiltersSchema.parse({})).toEqual({ view: "open", page: 1 });
  });

  it("reads the closed view and falls back on nonsense", () => {
    expect(reportFiltersSchema.parse({ view: "closed", page: "2" })).toEqual({ view: "closed", page: 2 });
    expect(reportFiltersSchema.parse({ view: "spam" }).view).toBe("open");
  });
});
