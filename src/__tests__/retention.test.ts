import { deletionDue, promisedDeletion, retentionStep, scheduleEntry, WARNING_DAYS } from "@/lib/retention";
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

describe("scheduleEntry", () => {
  const entry = (warnedAt: Date | null, now: Date) => scheduleEntry({ lapsedSince: lapsed, warnedAt, now });

  it("lists an account before its window as coming up, with both dates", () => {
    const result = entry(null, at(-WARNING_DAYS - 5));
    expect(result.group).toBe("upcoming");
    expect(result.warnOn).toEqual(at(-WARNING_DAYS));
    expect(result.deleteOn).toEqual(due);
  });

  it("shows a warning due with the date the email will promise", () => {
    const now = at(-5);
    const result = entry(null, now);
    expect(result.group).toBe("warn");
    expect(result.deleteOn).toEqual(promisedDeletion(lapsed, now));
    expect(result.deleteOn).toEqual(new Date(now.getTime() + WARNING_DAYS * DAY));
  });

  it("books erasure for a warned account no sooner than a full period after the warning", () => {
    const result = entry(at(-10), at(-1));
    expect(result.group).toBe("warned");
    expect(result.warnOn).toBeNull();
    expect(result.deleteOn).toEqual(at(WARNING_DAYS - 10));
  });

  it("marks a warned account past both dates as due to erase", () => {
    expect(entry(at(-WARNING_DAYS), at(0)).group).toBe("erase");
  });

  it("treats a warning from an earlier lapse as no warning", () => {
    const stale = new Date(lapsed.getTime() - 90 * DAY);
    expect(entry(stale, at(-WARNING_DAYS - 5)).group).toBe("upcoming");
    expect(entry(stale, at(1)).group).toBe("warn");
  });

  it("agrees with retentionStep on every day around the due date", () => {
    for (let offset = -60; offset <= 60; offset += 1) {
      for (const warnedAt of [null, at(-WARNING_DAYS), at(-10)]) {
        const now = at(offset);
        if (warnedAt && warnedAt > now) continue;
        const step = retentionStep({ lapsedSince: lapsed, warnedAt, now });
        const group = entry(warnedAt, now).group;
        expect(step === "wait" ? ["warned", "upcoming"] : [step]).toContain(group);
      }
    }
  });
});
