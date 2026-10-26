import { query, queryOne } from "@/lib/db";
import { decide, lookupDestination } from "@/lib/codes";
import { isPageKind, type PageKind } from "@/lib/qr-types";
import { readPageContent, type PageContent } from "@/lib/page-content";

/**
 * The read behind `/p/{code}`, the hosted page a page-type code redirects to.
 *
 * Not the redirect path. A scan reaches this page through `/{code}`, which has
 * already decided the code may be served and recorded the scan. But the page
 * URL is public and can be opened directly, so it asks the redirect path's
 * own `decide()` again: a paused or blocked code must not keep showing its
 * content to anyone who bookmarked the page.
 */

export type PublicPage =
  | { state: "page"; kind: PageKind; content: PageContent; ownerName: string; qrId: number }
  | { state: "paused" | "blocked" | "not_found" | "broken" };

export async function loadPublicPage(shortCode: string): Promise<PublicPage> {
  const { destination } = await lookupDestination(shortCode);
  const decision = decide(destination);
  if (decision.kind === "paused") return { state: "paused" };
  if (decision.kind === "blocked") return { state: "blocked" };
  if (decision.kind !== "redirect" || !destination) return { state: "not_found" };

  const row = await queryOne<{ kind: string; content: unknown }>(
    `select kind, content from qr_codes where id = $1`,
    [destination.qrId]
  );
  if (!row || !isPageKind(row.kind)) return { state: "not_found" };

  const content = readPageContent(row.kind, row.content);
  if (!content) return { state: "broken" };

  return {
    state: "page",
    kind: row.kind,
    content,
    ownerName: destination.ownerName,
    qrId: destination.qrId,
  };
}

/**
 * Save one answer to a feedback code. Only a live feedback code accepts one:
 * the kind and status are checked in the insert itself, so a paused code or a
 * code of another kind takes nothing.
 */
export async function saveFeedback(
  shortCode: string,
  rating: number,
  comment: string | null
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `insert into qr_feedback (qr_id, rating, comment)
     select id, $2, $3 from qr_codes
     where short_code = $1 and kind = 'feedback' and status = 'active'
     returning id`,
    [shortCode, rating, comment]
  );
  return rows.length > 0;
}
