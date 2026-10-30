import { deletionDue, promisedDeletion, retentionStep, WARNING_DAYS } from "@/lib/retention";
import { LAPSE_RETENTION_MONTHS } from "@/lib/brand";

const DAY = 86_400_000;
const lapsed = new Date("2026-01-15T12:00:00Z");
const due = deletionDue(lapsed);
const at = (offsetDays: number) => new Date(due.getTime() + offsetDays * DAY);

describe("deletionDue", () => {
  it("is the promised number of months after the lapse", () => {
    expect(LAPSE_RETENTION_MONTHS).toBe(6);
    expect(due.toISOString()).toBe("2026-07-15T12:00:00.000Z");
  });
});

describe("retentionStep", () => {
  it("waits until the warning window opens", () => {
    expect(retentionStep({ lapsedSince: lapsed, warnedAt: null, now: at(-WARNING_DAYS - 1) })).toBe("wait");
  });

  it("warns once the window opens", () => {
    expect(retentionStep({ lapsedSince: lapsed, warnedAt: null, now: at(-WARNING_DAYS) })).toBe("warn");
  });

  it("never erases an account that has not been warned, however late", () => {
    expect(retentionStep({ lapsedSince: lapsed, warnedAt: null, now: at(400) })).toBe("warn");
  });

  it("waits after a warning until the due date", () => {
    expect(retentionStep({ lapsedSince: lapsed, warnedAt: at(-WARNING_DAYS), now: at(-1) })).toBe("wait");
  });

  it("erases on the due date when the warning is a full period old", () => {
    expect(retentionStep({ lapsedSince: lapsed, warnedAt: at(-WARNING_DAYS), now: at(0) })).toBe("erase");
  });

  it("gives a late warning its full period before erasing", () => {
    // Warned only 10 days before the due date (the sweep was off until then):
    // erasure waits until 30 days after the warning.
    const warnedAt = at(-10);
    expect(retentionStep({ lapsedSince: lapsed, warnedAt, now: at(5) })).toBe("wait");
    expect(retentionStep({ lapsedSince: lapsed, warnedAt, now: at(20) })).toBe("erase");
  });

  it("ignores a warning from an earlier lapse, and warns again", () => {
    // They came back after being warned, then lapsed again later.
    const relapsed = new Date("2026-03-01T00:00:00Z");
    const oldWarning = new Date("2026-02-01T00:00:00Z");
    const now = new Date(deletionDue(relapsed).getTime() - DAY);
    expect(retentionStep({ lapsedSince: relapsed, warnedAt: oldWarning, now })).toBe("warn");
  });
});

describe("promisedDeletion", () => {
  it("promises the due date when the warning is early enough", () => {
    expect(promisedDeletion(lapsed, at(-WARNING_DAYS - 5))).toEqual(due);
  });

  it("never promises less than the full warning period", () => {
    const now = at(100);
    expect(promisedDeletion(lapsed, now)).toEqual(new Date(now.getTime() + WARNING_DAYS * DAY));
  });
});
