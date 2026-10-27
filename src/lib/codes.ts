import { queryOne } from "@/lib/db";
import { cached, purge } from "@/lib/cache";

const NAMESPACE = "dest";

export type CodeStatus = "active" | "paused" | "blocked";

/**
 * Everything the redirect path needs, and nothing else. Kept deliberately flat
 * so it serialises into Redis cheaply.
 */
export type Destination = {
  qrId: number;
  shortCode: string;
  status: CodeStatus;
  destinationUrl: string;
  ownerName: string;
  /** True when the owner may serve traffic: active, or past due inside grace. */
  subscriptionOk: boolean;
  /**
   * Platform suspension, which migration 002 defines as stopping codes from
   * serving -- distinct from Neon Auth's `banned`, which stops the person
   * logging in. An admin suspends an account precisely so its codes go quiet,
   * so the redirect path has to know.
   *
   * Optional because entries cached before this field existed deserialise
   * without it. Absent reads as "not suspended", which is the right default:
   * it keeps serving rather than silently pausing a live code, and `purge`
   * runs on suspension anyway so the real value arrives at once.
   */
  ownerSuspended?: boolean;
  /**
   * Archived by staff (migration 017): out of service and out of the owner's
   * dashboard. Optional for the same reason as `ownerSuspended`, and absent
   * reads as "not archived"; archiving sets the code `paused` as well, so an
   * entry cached without this field still never redirects.
   */
  archived?: boolean;
};

type Row = {
  id: string;
  short_code: string;
  status: CodeStatus;
  destination_url: string;
  owner_name: string;
  subscription_ok: boolean;
  owner_suspended: boolean;
  archived: boolean;
};

/**
 * The single query on the redirect path. One index lookup on
 * `qr_codes_short_code_key`, then a join to the owner's subscription.
 *
 * `grace_until` is compared in the database so the app never has to reason
 * about clock drift between instances.
 */
const LOOKUP_SQL = `
  select
    c.id,
    c.short_code,
    c.status,
    c.destination_url,
    u.name as owner_name,
    u.suspended_at is not null as owner_suspended,
    c.archived_at is not null as archived,
    coalesce(
      s.status = 'active'
      or (s.status = 'past_due' and s.grace_until > now()),
      false
    ) as subscription_ok
  from qr_codes c
  join qr_users u on u.id = c.user_id
  left join qr_subscriptions s
    on s.user_id = c.user_id
   and s.status in ('active', 'past_due')
  where c.short_code = $1
  limit 1
`;

export async function lookupDestination(
  shortCode: string
): Promise<{ destination: Destination | null; cacheSource: string }> {
  const result = await cached<Destination>(NAMESPACE, shortCode, async () => {
    const row = await queryOne<Row>(LOOKUP_SQL, [shortCode]);
    if (!row) return null;

    return {
      qrId: Number(row.id),
      shortCode: row.short_code,
      status: row.status,
      destinationUrl: row.destination_url,
      ownerName: row.owner_name,
      subscriptionOk: row.subscription_ok,
      ownerSuspended: row.owner_suspended,
      archived: row.archived,
    };
  });

  return { destination: result.value, cacheSource: result.source };
}

/** Call after any change to a code's destination, status or owner standing. */
export async function purgeDestination(shortCode: string): Promise<void> {
  await purge(NAMESPACE, shortCode);
}

export type RedirectDecision =
  | { kind: "redirect"; url: string }
  | { kind: "not_found" }
  | { kind: "paused"; ownerName: string }
  | { kind: "blocked" };

/**
 * Pure decision function -- no I/O, so the rules are directly testable.
 *
 * A lapsed subscription shows the paused page naming the business. It never
 * sends a scan to an unrelated page or an advertisement.
 */
export function decide(destination: Destination | null): RedirectDecision {
  if (!destination) return { kind: "not_found" };
  if (destination.status === "blocked") return { kind: "blocked" };
  // Archived by staff. Answered as an unknown code rather than a pause: the
  // code is retired, and there is no business left to name. After the blocked
  // check, so a code that was blocked for safety keeps saying so.
  if (destination.archived) return { kind: "not_found" };
  if (destination.status === "paused") {
    return { kind: "paused", ownerName: destination.ownerName };
  }
  // Account suspended by an admin. Same page as a pause: a scanner is owed
  // "this code is not active", never the reason it is not active.
  if (destination.ownerSuspended) {
    return { kind: "paused", ownerName: destination.ownerName };
  }
  if (!destination.subscriptionOk) {
    return { kind: "paused", ownerName: destination.ownerName };
  }
  return { kind: "redirect", url: destination.destinationUrl };
}
