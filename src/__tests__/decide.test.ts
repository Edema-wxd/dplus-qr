import { decide, type Destination } from "@/lib/codes";

function destination(overrides: Partial<Destination> = {}): Destination {
  return {
    qrId: 1,
    shortCode: "Ab3kQ9x",
    status: "active",
    destinationUrl: "https://example.com",
    ownerName: "Test Business",
    subscriptionOk: true,
    ...overrides,
  };
}

describe("decide", () => {
  it("redirects an active code whose owner is in good standing", () => {
    expect(decide(destination())).toEqual({
      kind: "redirect",
      url: "https://example.com",
    });
  });

  it("shows not-found for an unknown code", () => {
    expect(decide(null)).toEqual({ kind: "not_found" });
  });

  it("shows the paused page when the owner paused the code", () => {
    expect(decide(destination({ status: "paused" }))).toEqual({
      kind: "paused",
      ownerName: "Test Business",
    });
  });

  it("shows the paused page when the subscription has lapsed past grace", () => {
    // Crucially this is the paused page, not a redirect and not an ad: a
    // lapsed account must never send a scan somewhere unrelated.
    expect(decide(destination({ subscriptionOk: false }))).toEqual({
      kind: "paused",
      ownerName: "Test Business",
    });
  });

  it("shows the blocked page for a blocked code even if billing is fine", () => {
    expect(
      decide(destination({ status: "blocked", subscriptionOk: true }))
    ).toEqual({ kind: "blocked" });
  });

  it("prefers blocked over lapsed, so a kill switch is never masked", () => {
    expect(
      decide(destination({ status: "blocked", subscriptionOk: false }))
    ).toEqual({ kind: "blocked" });
  });

  it("shows the paused page when the owner's account is suspended", () => {
    // Migration 002 defines suspension as stopping codes from serving, and for
    // a long time the redirect lookup did not read the column at all -- so a
    // suspended account kept serving every scan. This is that gap closed.
    expect(decide(destination({ ownerSuspended: true }))).toEqual({
      kind: "paused",
      ownerName: "Test Business",
    });
  });

  it("suspends regardless of good billing", () => {
    expect(
      decide(destination({ ownerSuspended: true, subscriptionOk: true }))
    ).toEqual({ kind: "paused", ownerName: "Test Business" });
  });

  it("prefers blocked over suspended, so a kill switch is never masked", () => {
    expect(
      decide(destination({ status: "blocked", ownerSuspended: true }))
    ).toEqual({ kind: "blocked" });
  });

  /**
   * Entries cached before `ownerSuspended` existed deserialise without it.
   * Absent must keep serving: pausing a live code on a missing field would
   * take working printed codes down on deploy.
   */
  it("treats an absent suspension flag as not suspended", () => {
    const stale = destination();
    delete (stale as { ownerSuspended?: boolean }).ownerSuspended;
    expect(decide(stale)).toEqual({ kind: "redirect", url: "https://example.com" });
  });

  it("never returns a redirect without a url", () => {
    const result = decide(destination());
    if (result.kind === "redirect") {
      expect(result.url).toBeTruthy();
    }
  });
});
