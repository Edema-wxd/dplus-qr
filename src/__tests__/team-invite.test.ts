import { readFileSync } from "node:fs";
import path from "node:path";
import {
  afterAuthPath,
  hashInviteToken,
  inviteEmail,
  invitePath,
  inviteSchema,
  isInviteToken,
  mailSafeName,
  maskEmail,
  newInviteToken,
  teamSeatsLive,
} from "@/lib/team-invite";
import { ACCOUNT_PIN_FIELD, pinMismatch, scopeFor } from "@/lib/account-scope";
import { MAIL_GROUPS } from "@/lib/email";
import { INBOX_DOMAIN } from "@/lib/brand";

describe("invite tokens", () => {
  it("are 32 random bytes as base64url, never the same twice", () => {
    const a = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newInviteToken()).not.toBe(a);
    expect(isInviteToken(a)).toBe(true);
  });

  it.each(["", "short", "a".repeat(42), "a".repeat(44), "../".padEnd(43, "a"), null, 7])(
    "refuses %p before it reaches the database",
    (raw) => {
      expect(isInviteToken(raw)).toBe(false);
    }
  );

  it("are stored only as a hash, which is stable and not the token", () => {
    const token = newInviteToken();
    expect(hashInviteToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toContain(token);
  });

  it("build a link only from a checked token, so the field is never an open redirect", () => {
    const token = newInviteToken();
    expect(invitePath(token)).toBe(`/auth/invite/${token}`);
    expect(() => invitePath("https://evil.example")).toThrow();
    expect(afterAuthPath(token)).toBe(`/auth/invite/${token}`);
    for (const bad of ["//evil.example", "/admin", "https://evil.example", "", null]) {
      expect(afterAuthPath(bad)).toBe("/app");
    }
  });
});

describe("what an invitee is shown", () => {
  it("masks an address to a recognisable minimum", () => {
    expect(maskEmail("ada.obi@example.com")).toBe("a•••@e•••.com");
    expect(maskEmail("x@y.co.uk")).toBe("x•••@y•••.uk");
    expect(maskEmail("odd")).toBe("o•••@•••");
  });

  it("keeps an account name to one clean line for an email subject", () => {
    expect(mailSafeName("Mama Put\r\nBcc: victim@example.com")).toBe("Mama Put Bcc: victim@example.com");
    expect(mailSafeName("  ")).toBe("A QRiate+ account");
    expect(mailSafeName("x".repeat(100))).toHaveLength(60);
  });

  it("writes the invitation with the role, the link and the expiry", () => {
    const { subject, text } = inviteEmail({
      accountName: "Mama Put",
      role: "viewer",
      link: "https://qriateplus.com/auth/invite/TOKEN",
      expiresAt: new Date("2026-11-14T12:00:00Z"),
    });
    expect(subject).toBe("Mama Put invited you to their QRiate+ account");
    expect(text).toContain("as a viewer.");
    expect(text).toContain("https://qriateplus.com/auth/invite/TOKEN");
    expect(text).toContain("expires on 14 November 2026");
    expect(inviteEmail({ accountName: "A", role: "editor", link: "x", expiresAt: new Date() }).text).toContain(
      "as an editor."
    );
  });

  it("validates the form: an address and editor or viewer, nothing else", () => {
    expect(inviteSchema.safeParse({ email: " Ada@Example.com ", role: "editor" })).toEqual({
      success: true,
      data: { email: "ada@example.com", role: "editor" },
    });
    expect(inviteSchema.safeParse({ email: "ada@example.com", role: "admin" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "not an email", role: "viewer" }).success).toBe(false);
  });

  it("is sent from the onboarding address, whose replies reach a real inbox", () => {
    const team = readFileSync(path.join(__dirname, "..", "lib", "team.ts"), "utf8");
    expect(team).toMatch(/sendEmail\(\{ group: "onboarding"/);
    expect(MAIL_GROUPS.onboarding.replyTo.endsWith(`@${INBOX_DOMAIN}`)).toBe(true);
  });
});

describe("the launch switch", () => {
  it("is on, because team_seats is built", () => {
    expect(teamSeatsLive()).toBe(true);
  });
});

describe("pinMismatch", () => {
  const scope = scopeFor("acct-b", "person", "owner");
  const form = (pin?: string) => {
    const data = new FormData();
    if (pin !== undefined) data.set(ACCOUNT_PIN_FIELD, pin);
    return data;
  };

  it("refuses a create form drawn for another account", () => {
    expect(pinMismatch(scope, form("acct-a"))).toMatch(/switched accounts in another tab/);
  });

  it("passes the right account, and a form with no pin", () => {
    expect(pinMismatch(scope, form("acct-b"))).toBeNull();
    expect(pinMismatch(scope, form())).toBeNull();
    expect(pinMismatch(scope, form(""))).toBeNull();
  });
});
