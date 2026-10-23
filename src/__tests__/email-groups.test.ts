import { MAIL_GROUPS, senderFor, type MailGroup } from "@/lib/email";
import { INBOX_DOMAIN, SENDING_DOMAIN, SUPPORT_EMAIL } from "@/lib/brand";

const GROUPS: MailGroup[] = ["onboarding", "plans", "support"];

describe("mail groups", () => {
  it("gives each group its own address", () => {
    const addresses = GROUPS.map((group) => MAIL_GROUPS[group].from);
    expect(new Set(addresses).size).toBe(GROUPS.length);
  });

  it("keeps the agreed mailbox names", () => {
    expect(MAIL_GROUPS.onboarding.from).toBe(`onboarding@${SENDING_DOMAIN}`);
    expect(MAIL_GROUPS.plans.from).toBe(`plans@${SENDING_DOMAIN}`);
    expect(MAIL_GROUPS.support.from).toBe(`support@${SENDING_DOMAIN}`);
  });

  it("formats a sender Resend accepts", () => {
    expect(senderFor("plans")).toBe(`QRiate+ Billing <plans@${SENDING_DOMAIN}>`);
  });

  /**
   * The point of the whole split. SENDING_DOMAIN publishes no MX, so a reply
   * addressed there is rejected and the user is never told -- a complaint that
   * silently vanishes. Every Reply-To has to sit on the apex, which receives.
   */
  it("never invites a reply to the send-only domain", () => {
    for (const group of GROUPS) {
      const { replyTo } = MAIL_GROUPS[group];
      expect(replyTo.endsWith(`@${INBOX_DOMAIN}`)).toBe(true);
      expect(replyTo).not.toContain(SENDING_DOMAIN);
    }
  });

  it("sends internal alerts to a mailbox that receives", () => {
    expect(SUPPORT_EMAIL.endsWith(`@${INBOX_DOMAIN}`)).toBe(true);
  });
});
