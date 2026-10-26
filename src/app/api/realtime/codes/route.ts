import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { realtimeUrl, sealCodes } from "@/lib/live-codes";
import { parseCodeId, utcDay } from "@/lib/user-codes";

/**
 * Re-seal a dashboard live query.
 *
 * Sealed queries expire after about a minute, and the browser calls this a few
 * seconds before each expiry. A renewal must reproduce the original query
 * exactly, so the browser sends back the `day` and `id` it was given -- never
 * the user, which comes from the session alone.
 *
 * `userId` in the body is not trusted for anything but a comparison: it is the
 * user the page was rendered for, and a session belonging to anyone else is
 * treated as signed out. Without that, a tab left open across a sign-out and a
 * sign-in as someone else would quietly start streaming the new user's codes
 * into the old user's page.
 *
 * A Route Handler rather than a Server Action because actions run one at a
 * time per client, and a renewal must not queue behind a slow form submit.
 * `/api` is outside the proxy matcher, so the session is checked here.
 */
const bodySchema = z.object({
  userId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  id: z
    .string()
    .refine((value) => parseCodeId(value) !== null)
    .optional(),
});

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The window a renewal may be for: yesterday, today or tomorrow in UTC.
 *
 * A page rolls over to the new day at UTC midnight, so for a moment either
 * side of it a legitimate renewal names the neighbouring day, and a client
 * clock a little fast or slow can do the same. Nothing outside that is a page
 * this server rendered.
 */
function plausibleDay(day: string): boolean {
  const now = Date.now();
  return [-1, 0, 1].some((offset) => utcDay(new Date(now + offset * 86_400_000)) === day);
}

export async function POST(request: Request) {
  if (!realtimeUrl()) {
    return Response.json({ error: "Realtime is not configured" }, { status: 503, headers: NO_STORE });
  }

  const { data: session } = await auth.getSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400, headers: NO_STORE });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || !plausibleDay(parsed.data.day)) {
    return Response.json({ error: "Invalid body" }, { status: 400, headers: NO_STORE });
  }

  if (!session?.user || session.user.id !== parsed.data.userId) {
    return Response.json({ error: "Signed out" }, { status: 401, headers: NO_STORE });
  }

  const sealedQuery = await sealCodes(session.user.id, parsed.data.day, parsed.data.id);
  return Response.json(sealedQuery, { headers: NO_STORE });
}
