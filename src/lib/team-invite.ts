import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { PRODUCT_NAME } from "@/lib/brand";
import { PLAN_FEATURES } from "@/lib/plan-features";

/**
 * The parts of team invites with no database: the token, what the email
 * says, and how an address is shown back to someone who is not its owner.
 * Pure, so each is tested on its own. The flow itself is `team.ts`.
 */

/**
 * Whether team seats are switched on. Tied to the plan catalogue's `built`
 * flag rather than a separate switch: the feature becomes visible, and
 * invites can be sent and accepted, in the same deploy that first
 * advertises it on the price table. Until then every team page, invite and
 * accept answers as if it did not exist.
 */
export function teamSeatsLive(): boolean {
  return PLAN_FEATURES.find((def) => def.key === "team_seats")?.built === true;
}

/** Roles an owner can give (decided 7 Nov 2026: admin is not offered yet). */
export const INVITE_ROLES = ["editor", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const ROLE_LABEL: Record<InviteRole, { name: string; article: string; can: string }> = {
  editor: { name: "editor", article: "an", can: "Editors can make codes and change where they point, their pages, colours and logos." },
  viewer: { name: "viewer", article: "a", can: "Viewers can see the codes and their scans, and download QR images and spreadsheets." },
};

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the email address to invite.").max(254),
  role: z.enum(INVITE_ROLES, { message: "Choose editor or viewer." }),
});

/** How long an invite can be accepted for. */
export const INVITE_DAYS = 7;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 32 random bytes as base64url: the only credential an invite has. */
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isInviteToken(raw: unknown): raw is string {
  return typeof raw === "string" && TOKEN_PATTERN.test(raw);
}

/**
 * What the database keeps instead of the token. The token is only ever in
 * the email, so someone who can read `qr_account_invites` still cannot join
 * a team with what they read.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The page an invite email links to, built only from a checked token. */
export function invitePath(token: string): string {
  if (!isInviteToken(token)) throw new Error("Not an invite token");
  return `/auth/invite/${token}`;
}

export { INVITE_PARAM } from "@/lib/team-invite-param";

/**
 * Where sign-in or sign-up goes next: back to the invitation when the form
 * carried one, otherwise the dashboard. Built only from a token that passes
 * the format check, so the field cannot become an open redirect.
 */
export function afterAuthPath(invite: unknown): string {
  return isInviteToken(invite) ? invitePath(invite) : "/app";
}

/**
 * An address shown to someone who may not own it, such as a person signed
 * in as somebody else: enough to recognise, not enough to harvest.
 * `ada.obi@example.com` becomes `a•••@e•••.com`.
 */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local.slice(0, 1)}•••@${host.slice(0, 1)}•••${tld}`;
}

/**
 * An account's name as it goes into an email subject and body: one line,
 * no control characters, a sensible length. The name is whatever the owner
 * typed at sign-up, and a newline in a subject is a header injection.
 */
export function mailSafeName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return (clean || "A QRiate+ account").slice(0, 60);
}

/** The invite email. Plain text, from the onboarding sender. */
export function inviteEmail(input: {
  accountName: string;
  role: InviteRole;
  link: string;
  expiresAt: Date;
}): { subject: string; text: string } {
  const account = mailSafeName(input.accountName);
  const role = ROLE_LABEL[input.role];
  const expires = input.expiresAt.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  });
  return {
    subject: `${account} invited you to their ${PRODUCT_NAME} account`,
    text: [
      `${account} has invited you to work on their QR codes on ${PRODUCT_NAME}, as ${role.article} ${role.name}.`,
      "",
      role.can,
      "",
      "Accept the invitation:",
      input.link,
      "",
      `The link works once and expires on ${expires}. You will sign in, or create a free account, with this email address.`,
      "",
      "If you were not expecting this, you can ignore it. Nothing happens unless you accept.",
      "",
      `${PRODUCT_NAME} · qriateplus.com`,
    ].join("\n"),
  };
}
