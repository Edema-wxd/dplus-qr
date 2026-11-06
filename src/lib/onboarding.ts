import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { LINK_KINDS, type LinkKind } from "@/lib/qr-types";
import {
  buildFunnel,
  ONBOARDING_EVENTS,
  type FunnelStep,
  type OnboardingEvent,
  type OnboardingProgress,
  type Purpose,
} from "@/lib/onboarding-steps";

/**
 * Reads and writes for the first-code onboarding (migration 025). The screens
 * and their rules are in `onboarding-steps.ts`.
 *
 * Every query filters by the session's user id, which the callers take from
 * the session and never from a form.
 *
 * **Onboarding never stands between someone and their dashboard.** Recording
 * a step is best-effort: a failure is logged and the person carries on. The
 * dashboard's check treats an unreadable state as "no onboarding", so a
 * preview build ahead of migration 025 still opens `/app`.
 */

export type OnboardingDraft = { kind: LinkKind; destination: string };

const draftSchema = z.object({
  kind: z.enum(LINK_KINDS),
  destination: z.string().min(1).max(2048),
});

export type OnboardingState = {
  origin: "signup" | "existing";
  purpose: Purpose | null;
  draft: OnboardingDraft | null;
  codeId: string | null;
  startedAt: Date;
  skippedAt: Date | null;
  completedAt: Date | null;
  reached: Set<OnboardingEvent>;
};

type StateRow = {
  origin: "signup" | "existing";
  purpose: Purpose | null;
  draft: unknown;
  code_id: string | null;
  started_at: Date;
  skipped_at: Date | null;
  completed_at: Date | null;
  reached: string[] | null;
};

export function progressOf(state: OnboardingState): OnboardingProgress {
  return { reached: state.reached, hasCode: state.codeId !== null, hasDraft: state.draft !== null };
}

/**
 * Open an account's onboarding. Once per account: a second call, from a
 * reload or a second tab, changes nothing, so the first origin and start time
 * stand.
 */
export async function startOnboarding(
  userId: string,
  origin: "signup" | "existing"
): Promise<void> {
  await query(
    `insert into qr_onboarding (user_id, origin) values ($1, $2)
     on conflict (user_id) do nothing`,
    [userId, origin]
  );
}

/**
 * Record that an account reached a step, the first time only.
 *
 * Writes only for an account whose onboarding is open, so the download route
 * can call this for every download without logging a step for accounts that
 * never had an onboarding.
 */
export async function recordStep(userId: string, event: OnboardingEvent): Promise<void> {
  await query(
    `insert into qr_onboarding_steps (user_id, step)
     select user_id, $2 from qr_onboarding where user_id = $1
     on conflict (user_id, step) do nothing`,
    [userId, event]
  );
}

/** The same, for callers that must never fail because of it. */
export function recordStepQuietly(userId: string, event: OnboardingEvent): Promise<void> {
  return recordStep(userId, event).catch((error) => {
    console.error(`[onboarding] could not record ${event}`, error);
  });
}

export async function getOnboarding(userId: string): Promise<OnboardingState | null> {
  const row = await queryOne<StateRow>(
    `select o.origin, o.purpose, o.draft, o.code_id, o.started_at, o.skipped_at, o.completed_at,
            array(select s.step from qr_onboarding_steps s where s.user_id = o.user_id) as reached
     from qr_onboarding o
     where o.user_id = $1`,
    [userId]
  );
  if (!row) return null;

  const draft = draftSchema.safeParse(row.draft);
  return {
    origin: row.origin,
    purpose: row.purpose,
    draft: draft.success ? draft.data : null,
    codeId: row.code_id === null ? null : String(row.code_id),
    startedAt: row.started_at,
    skippedAt: row.skipped_at,
    completedAt: row.completed_at,
    reached: new Set(
      (row.reached ?? []).filter((step): step is OnboardingEvent =>
        (ONBOARDING_EVENTS as readonly string[]).includes(step)
      )
    ),
  };
}

/**
 * The state the dashboard checks, or null when it cannot be read. Null means
 * "carry on to the dashboard", never "send them to onboarding".
 */
export async function readOnboardingSafely(userId: string): Promise<OnboardingState | null | "unavailable"> {
  try {
    return await getOnboarding(userId);
  } catch (error) {
    console.error("[onboarding] state unavailable", error);
    return "unavailable";
  }
}

export async function setPurpose(userId: string, purpose: Purpose): Promise<void> {
  await query(
    `update qr_onboarding set purpose = $2, updated_at = now() where user_id = $1`,
    [userId, purpose]
  );
  await recordStep(userId, "purpose_chosen");
}

/** Keep the screened destination until the code is made from it. */
export async function setDraft(userId: string, draft: OnboardingDraft): Promise<void> {
  await query(
    `update qr_onboarding set draft = $2::jsonb, updated_at = now() where user_id = $1`,
    [userId, JSON.stringify(draft)]
  );
  await recordStep(userId, "destination_set");
}

/**
 * Tie the code made on screen 4 to the onboarding and drop the draft: the
 * destination now lives on the code, and keeping a second copy here would be
 * personal data with no further use.
 */
export async function attachCode(userId: string, codeId: string): Promise<void> {
  await query(
    `update qr_onboarding
        set code_id = $2::bigint, draft = '{}'::jsonb, updated_at = now()
      where user_id = $1
        and exists (select 1 from qr_codes c where c.id = $2::bigint and c.user_id = $1)`,
    [userId, codeId]
  );
  await recordStep(userId, "code_created");
}

/** The first skip, and the screen it was from, are the ones that are kept. */
export async function skipOnboarding(userId: string, screen: string): Promise<void> {
  await query(
    `update qr_onboarding
        set skipped_at = coalesce(skipped_at, now()),
            skipped_step = coalesce(skipped_step, $2),
            updated_at = now()
      where user_id = $1 and completed_at is null`,
    [userId, screen]
  );
}

export async function completeOnboarding(userId: string): Promise<void> {
  await query(
    `update qr_onboarding set completed_at = coalesce(completed_at, now()), updated_at = now()
      where user_id = $1`,
    [userId]
  );
  await recordStep(userId, "completed");
}

export type TestScan = {
  scannedAt: Date;
  country: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
};

/**
 * The most recent real scan of the code this account made during onboarding.
 *
 * Joined on the owner as well as the id, so only this account's own code can
 * answer. Bots are left out for the same reason they are everywhere else: a
 * link preview is not someone scanning.
 */
export async function latestTestScan(userId: string): Promise<TestScan | null> {
  const row = await queryOne<{
    scanned_at: Date;
    country: string | null;
    city: string | null;
    device_type: string | null;
    os: string | null;
  }>(
    `select s.scanned_at, s.country, s.city, s.device_type, s.os
     from qr_onboarding o
     join qr_codes c on c.id = o.code_id and c.user_id = o.user_id
     join qr_scans s on s.qr_id = c.id
     where o.user_id = $1 and not s.is_bot
     order by s.scanned_at desc
     limit 1`,
    [userId]
  );
  return row
    ? {
        scannedAt: row.scanned_at,
        country: row.country,
        city: row.city,
        deviceType: row.device_type,
        os: row.os,
      }
    : null;
}

export type OnboardingFunnel = {
  days: number;
  /** Accounts that signed up in the window. Older accounts are not counted. */
  cohort: number;
  steps: FunnelStep[];
  purposes: { purpose: Purpose | null; accounts: number }[];
  outcomes: {
    /** A first code by any route, the dashboard's own form included. */
    madeCode: number;
    madeCodeWithinDay: number;
    medianSecondsToCode: number | null;
    /** Scanned at least once, by anyone, the owner's own test included. */
    scanned: number;
    scannedWithinWeek: number;
    verifiedEmail: number;
  };
};

const STEP_ORDER = ONBOARDING_EVENTS as readonly string[];

/**
 * For the staff page: how far the accounts that signed up in the window got.
 *
 * Steps come from `qr_onboarding_steps`. Whether a code was made or scanned is
 * read from the codes and scans themselves, so it also counts someone who
 * skipped the onboarding and made a code on the dashboard, and someone whose
 * first scan came from a customer a week later. Scans are read from both the
 * raw rows and the daily rollup, because retention prunes the raw rows.
 */
export async function onboardingFunnel(days: number): Promise<OnboardingFunnel> {
  const cohort = `
    select o.user_id, o.started_at, o.skipped_step, o.purpose
    from qr_onboarding o
    where o.origin = 'signup' and o.started_at > now() - make_interval(days => $1)`;

  const [steps, skips, purposes, outcomes] = await Promise.all([
    query<{ step: OnboardingEvent; reached: string; median_seconds: number | null }>(
      `with cohort as (${cohort})
       select s.step, count(*) as reached,
              percentile_cont(0.5) within group (
                order by extract(epoch from s.reached_at - coalesce(prev.at, c.started_at))
              ) as median_seconds
       from cohort c
       join qr_onboarding_steps s on s.user_id = c.user_id
       -- Time on a step runs from the latest earlier step this person
       -- reached, so a skipped download does not inflate the scan step.
       left join lateral (
         select max(p.reached_at) as at
         from qr_onboarding_steps p
         where p.user_id = s.user_id
           and array_position($2::text[], p.step) < array_position($2::text[], s.step)
       ) prev on true
       group by s.step`,
      [days, STEP_ORDER]
    ),
    query<{ skipped_step: string; accounts: string }>(
      `with cohort as (${cohort})
       select skipped_step, count(*) as accounts from cohort
       where skipped_step is not null group by skipped_step`,
      [days]
    ),
    query<{ purpose: Purpose | null; accounts: string }>(
      `with cohort as (${cohort})
       select purpose, count(*) as accounts from cohort
       group by purpose order by count(*) desc, purpose`,
      [days]
    ),
    queryOne<{
      cohort: string;
      made_code: string;
      made_code_day: string;
      median_to_code: number | null;
      scanned: string;
      scanned_week: string;
      verified: string;
    }>(
      `with cohort as (${cohort})
       select count(*) as cohort,
              count(fc.at) as made_code,
              count(*) filter (where fc.at <= c.started_at + interval '1 day') as made_code_day,
              percentile_cont(0.5) within group (order by extract(epoch from fc.at - c.started_at))
                as median_to_code,
              count(fs.at) as scanned,
              count(*) filter (where fs.at <= c.started_at + interval '7 days') as scanned_week,
              count(*) filter (where a."emailVerified") as verified
       from cohort c
       left join lateral (
         select min(q.created_at) as at from qr_codes q where q.user_id = c.user_id
       ) fc on true
       left join lateral (
         select least(
           (select min(s.scanned_at)
              from qr_scans s join qr_codes q on q.id = s.qr_id
             where q.user_id = c.user_id and not s.is_bot),
           (select min(d.day)::timestamptz
              from qr_scan_daily d join qr_codes q on q.id = d.qr_id
             where q.user_id = c.user_id and d.scans > 0)
         ) as at
       ) fs on true
       left join neon_auth."user" a on a.id = c.user_id`,
      [days]
    ),
  ]);

  const counts = Object.fromEntries(
    steps.map((row) => [
      row.step,
      {
        reached: Number(row.reached),
        medianSeconds: row.median_seconds === null ? null : Number(row.median_seconds),
      },
    ])
  );
  const skipCounts = Object.fromEntries(
    skips.map((row) => [row.skipped_step, Number(row.accounts)])
  );

  return {
    days,
    cohort: Number(outcomes?.cohort ?? 0),
    steps: buildFunnel(counts, skipCounts),
    purposes: purposes.map((row) => ({ purpose: row.purpose, accounts: Number(row.accounts) })),
    outcomes: {
      madeCode: Number(outcomes?.made_code ?? 0),
      madeCodeWithinDay: Number(outcomes?.made_code_day ?? 0),
      medianSecondsToCode:
        outcomes?.median_to_code === null || outcomes?.median_to_code === undefined
          ? null
          : Number(outcomes.median_to_code),
      scanned: Number(outcomes?.scanned ?? 0),
      scannedWithinWeek: Number(outcomes?.scanned_week ?? 0),
      verifiedEmail: Number(outcomes?.verified ?? 0),
    },
  };
}
