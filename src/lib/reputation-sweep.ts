import { query } from "@/lib/db";
import { CODE_HOST } from "@/lib/brand";
import { notifyAdmin, sendEmail } from "@/lib/email";
import { recordAdminAudit } from "@/lib/admin";
import { blockCode } from "@/lib/moderation";
import { isLinkKind } from "@/lib/qr-types";
import {
  describeThreats,
  pageLinks,
  reputationConfigured,
  reputationOfMany,
  type ThreatType,
} from "@/lib/reputation";

/**
 * The weekly re-check: every code still in service is looked up again, and
 * one whose destination (or any outside link on its page) has been listed as
 * unsafe since it was saved is blocked at once, its owner emailed, and staff
 * alerted (decided 8 Nov 2026, as INFRASTRUCTURE.md planned).
 *
 * Blocking a printed code is the one thing this platform otherwise avoids,
 * so the rules are narrow: only a `flagged` answer blocks, never an
 * unavailable one; a code already blocked is left alone; the owner is told
 * exactly which link and why; and staff can lift the block from the admin
 * if Google was wrong. Each block is in the staff audit as the system's,
 * with no staff actor.
 *
 * Does nothing without `WEB_RISK_API_KEY`.
 */

export type SweepResult =
  | { skipped: true }
  | {
      skipped: false;
      codes: number;
      links: number;
      unavailable: number;
      blocked: { codeId: string; shortCode: string; url: string; threats: ThreatType[] }[];
    };

type Row = {
  id: string;
  short_code: string;
  name: string;
  kind: string;
  destination_url: string;
  content: unknown;
  owner_email: string;
};

export async function recheckDestinations(): Promise<SweepResult> {
  if (!reputationConfigured()) return { skipped: true };

  // Live or paused (a paused code can be resumed at any moment), not yet
  // blocked or archived, on an account that has not been erased.
  const rows = await query<Row>(
    `-- scope: the system's weekly sweep, across every account
     select c.id, c.short_code, c.name, c.kind, c.destination_url, c.content, u.email as owner_email
     from qr_codes c join qr_users u on u.id = c.user_id
     where c.status in ('active', 'paused') and c.archived_at is null and u.erased_at is null`
  );

  const linksOf = (row: Row): string[] =>
    isLinkKind(row.kind) ? [row.destination_url] : [...pageLinks(row.content)];
  const results = await reputationOfMany(rows.flatMap(linksOf));

  const blocked: Extract<SweepResult, { skipped: false }>["blocked"] = [];
  for (const row of rows) {
    const hit = linksOf(row)
      .map((url) => ({ url, result: results.get(url) }))
      .find((link) => link.result?.verdict === "flagged");
    if (!hit?.result) continue;

    const threats = hit.result.threats;
    const reason = `Google lists ${hostOf(hit.url)} as unsafe (${describeThreats(threats)}). Found by the weekly safety check.`;
    const shortCode = await blockCode(Number(row.id), reason);
    if (!shortCode) continue; // blocked meanwhile by someone else

    blocked.push({ codeId: String(row.id), shortCode, url: hit.url, threats });
    await recordAdminAudit({
      actorId: null,
      action: "code.block.reputation",
      targetType: "code",
      targetId: String(row.id),
      detail: { shortCode, host: hostOf(hit.url), threats },
    }).catch((error) => console.error("[reputation] block made but audit row not written", error));
    if (row.owner_email) {
      await sendEmail({
        group: "support",
        to: row.owner_email,
        ...ownerNotice({ name: row.name, shortCode, url: hit.url, threats }),
      });
    }
  }

  if (blocked.length > 0) {
    await notifyAdmin(
      `Weekly safety check blocked ${blocked.length} ${blocked.length === 1 ? "code" : "codes"}`,
      [
        "Google Web Risk listed these destinations as unsafe, so their codes were blocked and the owners emailed.",
        "Lift a block from the code's admin page if it was a mistake.",
        "",
        ...blocked.map((b) => `${CODE_HOST}/${b.shortCode}  ${hostOf(b.url)}  ${b.threats.join(", ")}`),
      ].join("\n")
    );
  }

  const unavailable = [...results.values()].filter((r) => r.verdict === "unavailable").length;
  return { skipped: false, codes: rows.length, links: results.size, unavailable, blocked };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 80);
  }
}

/** The owner's email: which code, which link, why, and what to do. */
export function ownerNotice(input: {
  name: string;
  shortCode: string;
  url: string;
  threats: ThreatType[];
}): { subject: string; text: string } {
  const name = input.name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80) || "One of your codes";
  return {
    subject: `We blocked ${CODE_HOST}/${input.shortCode} for safety`,
    text: [
      `Your code "${name}" (${CODE_HOST}/${input.shortCode}) has been blocked.`,
      "",
      `Our weekly safety check found that Google now lists ${hostOf(input.url)}, which the code leads to, as unsafe: ${describeThreats(input.threats)}.`,
      "",
      "Anyone who scans it now sees a page saying the code was disabled for safety, instead of being sent there.",
      "",
      "If the site has been hacked, clean it and ask Google to review it, then reply to this email and we will look again. If you think this is a mistake, reply and tell us.",
    ].join("\n"),
  };
}
