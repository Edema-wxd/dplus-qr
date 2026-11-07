import { auth } from "@/lib/auth/server";
import { canSeeInsights, chartDaysAllowed, getEntitlement } from "@/lib/entitlement";
import { isAnalyticsWindow, LONGEST_DAILY_WINDOW } from "@/lib/chart-buckets";
import { codeAnalytics, getCode, parseCodeId } from "@/lib/user-codes";

/**
 * One chart window as JSON, for the ranges longer than the code page
 * computes on the server (6, 12 and 24 months). Fetched when the owner picks
 * one, so the page's 30-second live refresh never re-runs a long query.
 *
 * The same rules as the page and the CSV route, checked again here because
 * this is an endpoint, not a button: signed in, the owner's own code (anyone
 * else's is a 404 that confirms nothing), a window within the plan's scan
 * history, and the detailed figures only on a plan that includes them.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: raw } = await params;

  const { data: session } = await auth.getSession();
  if (!session?.user) return json({ error: "Not signed in" }, 401);

  const id = parseCodeId(raw);
  if (!id) return json({ error: "Not found" }, 404);

  // Only the windows the page fetches. A daily window is already on the page.
  const days = Number(new URL(request.url).searchParams.get("days"));
  if (!isAnalyticsWindow(days) || days <= LONGEST_DAILY_WINDOW) {
    return json({ error: "Unknown range" }, 400);
  }

  const [code, entitlement] = await Promise.all([
    getCode(session.user.id, id),
    getEntitlement(session.user.id),
  ]);
  if (!code) return json({ error: "Not found" }, 404);

  if (days > chartDaysAllowed(entitlement)) {
    return json({ error: "That range is longer than your plan's scan history." }, 403);
  }

  const data = await codeAnalytics(session.user.id, id, days, {
    detail: canSeeInsights(entitlement),
  });
  return json(data, 200);
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
