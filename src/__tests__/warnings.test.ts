import { issueSchema, warningEmail, formatRespondBy } from "@/lib/warnings";
import { isSpike, reportStatusSchema, SPIKE_FACTOR, SPIKE_MIN_SCANS } from "@/lib/monitoring";
import { INBOX_DOMAIN, SENDING_DOMAIN, SUPPORT_EMAIL } from "@/lib/brand";

const message = "Your code points to a page asking for bank login details.";

describe("issueSchema", () => {
  it("takes a notice or warning with no date", () => {
    const parsed = issueSchema.parse({ level: "warning", message });
    expect(parsed).toEqual({ level: "warning", message, respondDays: undefined, qrId: undefined });
  });

  it("requires a date on a final warning", () => {
    const result = issueSchema.safeParse({ level: "final", message });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/date/);
  });

  it("takes a final warning with one of the fixed periods", () => {
    expect(issueSchema.parse({ level: "final", message, respondDays: "7" }).respondDays).toBe(7);
    expect(issueSchema.safeParse({ level: "final", message, respondDays: "5" }).success).toBe(false);
  });

  it("drops a date posted with anything but a final warning", () => {
    expect(issueSchema.parse({ level: "notice", message, respondDays: "7" }).respondDays).toBeUndefined();
  });

  it("refuses a message too short to tell the owner anything", () => {
    expect(issueSchema.safeParse({ level: "notice", message: "fix it" }).success).toBe(false);
  });

  it("refuses a level it does not know, such as an automatic suspension", () => {
    expect(issueSchema.safeParse({ level: "suspend", message }).success).toBe(false);
  });

  it("reads the code it is about", () => {
    expect(issueSchema.parse({ level: "warning", message, qrId: "42" }).qrId).toBe(42);
  });
});

describe("warningEmail", () => {
  const respondBy = new Date("2026-11-03T12:00:00Z");

  it("names the date in the subject and body of a final warning, and says staff decide", () => {
    const mail = warningEmail({ level: "final", message, name: "Ada", respondBy, shortCode: null });
    expect(mail.subject).toContain(formatRespondBy(respondBy));
    expect(mail.text).toContain(formatRespondBy(respondBy));
    expect(mail.text).toMatch(/may suspend/);
    expect(mail.text).not.toMatch(/will be suspended/);
  });

  it("threatens nothing in a notice", () => {
    const mail = warningEmail({ level: "notice", message, name: "Ada", respondBy: null, shortCode: null });
    expect(mail.subject).toMatch(/notice/i);
    expect(mail.text).not.toMatch(/suspend/);
  });

  it("carries the staff message and the code it concerns", () => {
    const mail = warningEmail({ level: "warning", message, name: "Ada", respondBy: null, shortCode: "Ab3kQ9x" });
    expect(mail.text).toContain(message);
    expect(mail.text).toContain("/Ab3kQ9x");
  });

  it("asks for replies on the apex, never the send-only domain", () => {
    const mail = warningEmail({ level: "warning", message, name: "Ada", respondBy: null, shortCode: null });
    expect(mail.text).toContain(SUPPORT_EMAIL);
    expect(SUPPORT_EMAIL.endsWith(`@${INBOX_DOMAIN}`)).toBe(true);
    expect(mail.text).not.toContain(SENDING_DOMAIN);
  });

  it("greets someone with no name on file", () => {
    expect(warningEmail({ level: "notice", message, name: "", respondBy: null, shortCode: null }).text).toMatch(
      /^Hi there,/
    );
  });
});

describe("isSpike", () => {
  it("needs both the floor and the multiple", () => {
    expect(isSpike(SPIKE_MIN_SCANS, 0)).toBe(true);
    expect(isSpike(SPIKE_MIN_SCANS - 1, 0)).toBe(false);
    expect(isSpike(200, 100)).toBe(false);
    expect(isSpike(SPIKE_FACTOR * 100, 100)).toBe(true);
  });

  it("does not call a quiet code waking up a spike", () => {
    expect(isSpike(6, 1)).toBe(false);
  });
});

describe("reportStatusSchema", () => {
  it("defaults to the open queue", () => {
    expect(reportStatusSchema.parse(undefined)).toBe("open");
    expect(reportStatusSchema.parse("deleted")).toBe("open");
    expect(reportStatusSchema.parse(["dismissed"])).toBe("dismissed");
  });
});
