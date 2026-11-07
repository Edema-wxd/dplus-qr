import { canInvite, hasTeam, planSeats, seatRefusal, seatState, seatsHeldSql } from "@/lib/seats";
import { scopeFor } from "@/lib/account-scope";
import { planRefusal } from "@/lib/checkout";
import { advertisedFeatures, PLAN_FEATURES } from "@/lib/plan-features";
import { featuresFromForm } from "@/lib/plan-admin";
import { featureOffer } from "@/lib/upgrade-offers";
import type { Plan } from "@/lib/plans";

function plan(o: Partial<Plan> = {}): Plan {
  return {
    id: 1,
    slug: "business-monthly",
    name: "Business",
    paystackPlanCode: "PLN_b",
    amountKobo: 2_500_000,
    interval: "monthly",
    maxCodes: 250,
    historyDays: 730,
    graceDays: 7,
    features: { team_seats: 5 },
    isActive: true,
    sortOrder: 30,
    ...o,
  };
}

const owner = scopeFor("acct", "acct", "owner");
const business = { planName: "Business", active: true, seats: 5, seatsUsed: 1 };

describe("planSeats", () => {
  it("reads a count of people, the owner included, and anything else as no team", () => {
    expect(planSeats({ team_seats: 5 })).toBe(5);
    expect(planSeats({ team_seats: 2 })).toBe(2);
    expect(planSeats({})).toBe(1);
    expect(planSeats(null)).toBe(1);
    // What migration 013 stored before 028 made it a count.
    expect(planSeats({ team_seats: true as unknown as number })).toBe(1);
    expect(planSeats({ team_seats: 1 })).toBe(1);
    expect(planSeats({ team_seats: 2.5 })).toBe(1);
    expect(hasTeam({ team_seats: 5 })).toBe(true);
    expect(hasTeam({})).toBe(false);
  });

  it("counts the owner, live members and pending unexpired invites", () => {
    const sql = seatsHeldSql(2);
    expect(sql).toMatch(/^\(1\s*\+/);
    expect(sql).toContain("m.account_id = $2::uuid and m.removed_at is null");
    expect(sql).toContain("i.accepted_at is null");
    expect(sql).toContain("i.revoked_at is null and i.expires_at > now()");
  });
});

describe("seatRefusal and the downgrade paths", () => {
  it("allows a team that fits, and refuses one that does not, saying how many to remove", () => {
    expect(seatRefusal("Business", { team_seats: 5 }, 5)).toBeNull();
    expect(seatRefusal("Business", { team_seats: 5 }, 7)).toBe(
      "Your team has 7 people, counting you and pending invites, and the Business plan covers 5 people. Remove 2 people first."
    );
    expect(seatRefusal("Pro", {}, 1)).toBeNull();
    expect(seatRefusal("Pro", {}, 2)).toMatch(/1 person besides you, and the Pro plan has no team/);
  });

  it("refuses checkout onto a plan smaller than the team, after the code check", () => {
    const pro = plan({ slug: "pro-monthly", name: "Pro", maxCodes: 50, features: {} });
    expect(planRefusal(pro, 10, 1)).toBeNull();
    expect(planRefusal(pro, 10, 3)?.reason).toMatch(/2 people besides you/);
    expect(planRefusal(pro, 60, 3)?.reason).toMatch(/60 codes/);
    expect(planRefusal(plan(), 10, 5)).toBeNull();
    // Callers that predate seats pass no count: the owner alone.
    expect(planRefusal(pro, 10)).toBeNull();
  });
});

describe("seatState", () => {
  const at = (d: string) => new Date(`2026-11-0${d}T00:00:00Z`);
  const members = [
    { userId: "c", joinedAt: at("3") },
    { userId: "a", joinedAt: at("1") },
    { userId: "b", joinedAt: at("2") },
  ];

  it("keeps the earliest-joined members up to the seats, the owner taking one", () => {
    expect(seatState(members, 5)).toEqual({ active: ["a", "b", "c"], locked: [] });
    expect(seatState(members, 3)).toEqual({ active: ["a", "b"], locked: ["c"] });
    expect(seatState(members, 1)).toEqual({ active: [], locked: ["a", "b", "c"] });
    expect(seatState(members, 0)).toEqual({ active: [], locked: ["a", "b", "c"] });
  });

  it("breaks a tie in join time the same way every time", () => {
    const tied = [
      { userId: "y", joinedAt: at("1") },
      { userId: "x", joinedAt: at("1") },
    ];
    expect(seatState(tied, 2).active).toEqual(["x"]);
  });
});

describe("canInvite", () => {
  it("lets the owner invite while a seat is free", () => {
    expect(canInvite(business, owner)).toEqual({ ok: true });
    expect(canInvite({ ...business, seatsUsed: 4 }, owner)).toEqual({ ok: true });
  });

  it("refuses when the seats are taken, the plan has no team or is not active", () => {
    expect(canInvite({ ...business, seatsUsed: 5 }, owner)).toMatchObject({ ok: false, reason: expect.stringMatching(/All 5 seats/) });
    expect(canInvite({ ...business, planName: "Pro", seats: 1 }, owner)).toMatchObject({ reason: "Team seats are not part of the Pro plan." });
    expect(canInvite({ ...business, active: false }, owner)).toMatchObject({ ok: false });
    expect(canInvite(null, owner)).toMatchObject({ ok: false });
  });

  it("is the owner's alone", () => {
    for (const role of ["editor", "viewer", "admin"] as const) {
      expect(canInvite(business, scopeFor("acct", "someone", role))).toMatchObject({
        ok: false,
        reason: "Only the account owner can invite people.",
      });
    }
  });
});

describe("team_seats in the plan catalogue", () => {
  const def = PLAN_FEATURES.find((d) => d.key === "team_seats")!;

  it("is a number staff set from the admin, and the form keeps it", () => {
    expect(def.kind).toBe("number");
    const form = new FormData();
    form.set("feature:team_seats", "5");
    expect(featuresFromForm(form, {}).team_seats).toBe(5);
    form.set("feature:team_seats", "1");
    expect(featuresFromForm(form, { team_seats: 5 }).team_seats).toBeUndefined();
    form.set("feature:team_seats", "");
    expect(featuresFromForm(form, { team_seats: 5 }).team_seats).toBeUndefined();
  });

  it("is not advertised until it is built, and then says how many people", () => {
    expect(def.built).toBe(false);
    expect(advertisedFeatures({ team_seats: 5 }).join(" ")).not.toMatch(/people|seat/i);
    expect(def.kind === "number" && def.advertise?.(5)).toBe("Up to 5 people, with their own sign-in");
  });

  it("is offered from the cheapest plan with a team, read from the rows", () => {
    const plans = [
      plan({ id: 2, slug: "pro-monthly", name: "Pro", amountKobo: 1_000_000, sortOrder: 20, features: { team_seats: true as unknown as number } }),
      plan({ id: 3 }),
    ];
    const offer = featureOffer("team_seats", { planName: "Pro", planSlug: "pro-monthly", maxCodes: 50, historyDays: 365, codesUsed: 0, features: {}, active: true, seats: 1, seatsUsed: 1 }, plans);
    expect(offer.unlock?.name).toBe("Business");
    expect(offer.why).toBe("Team seats are not part of your Pro plan.");
  });
});
