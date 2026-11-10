import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { access, accessArgs, type AccountScope } from "@/lib/account-scope";
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
 * Reads and writes for the first-code onboarding (migration 029). The screens
 * and their rules are in `onboarding-steps.ts`.
 *
 * **Onboarding is the person's own account's, never a team's.** Every
 * function takes the `AccountScope` from `resolveScope()` and does nothing
 * (reads null, writes nothing) unless that scope is the signed-in person's
 * own account. A member working in a team is never walked through making
 * the team's first code, and nothing they do there is counted as their
 * setup. Each statement still carries `access()` like every other dashboard
 * query (`scope-guard.test.ts`); for one's own account that is `$1 = $n`
 * and reads no members table. The one exception is sign-up
 * (`startOnboardingAtSignUp`), which runs before a session can be read and
 * takes the id of the account created in that same request.
 *
 * **Onboarding never stands between someone and their dashboard.** Recording
 * a step is best-effort: a failure is logged and the person carries on. The
 * dashboard's check treats an unreadable state as "no onboarding", so a
 * preview build ahead of migration 029 still opens `/app`.
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

/** Whether a scope is the signed-in person's own account, where onboarding lives. */
export function isOwnAccount(scope: AccountScope): boolean {
  return scope.role === "owner" && scope.accountId === scope.actorId;
}

export function progressOf(state: OnboardingState): OnboardingProgress {
  return { reached: state.reached, hasCode: state.codeId !== null, hasDraft: state.draft !== null };
}

/**
 * Open the onboarding of an account created by this sign-up, and record its
 * first step (`account_created`).
 *
 * The only function here without a scope: the sign-up action has just made
 * the account and cannot read a session in the same request. The id is the
 * one Neon Auth returned for that account, never anything from the form.
 * Once per account: a repeat changes nothing.
 */
export async function startOnboardingAtSignUp(userId: string): Promise<void> {
  await query(
    `-- scope: sign-up, for the account created in this same request
     insert into qr_onboarding (user_id, origin) values ($1, 'signup')
     on conflict (user_id) do nothing`,
    [userId]
  );
  await query(
    `-- scope: sign-up, for the account created in this same request
     insert into qr_onboarding_steps (user_id, step)
     select user_id, 'account_created' from qr_onboarding where user_id = $1
     on conflict (user_id, step) do nothing`,
    [userId]
  );
}

/**
 * Open the onboarding of an account that predates it, or whose sign-up
 * write failed, as `origin = 'existing'`, which the funnel leaves out. Once
 * per account: a second call, from a reload or a second tab, changes
 * nothing, so the first origin and start time stand.
 */
export async function startOnboarding(scope: AccountScope): Promise<void> {
  if (!isOwnAccount(scope)) return;
  await query(
    `insert into qr_onboarding (user_id, origin)
     select $1, 'existing' where ${access(2)}
     on conflict (user_id) do nothing`,
    [scope.accountId, ...accessArgs(scope, "write")]
  );
}

/**
 * Record that an account reached a step, the first time only.
 *
 * Writes only for an account whose onboarding is open, and only in the
 * person's own account, so the download route can call this for every
 * download without logging a step for accounts that never had an
 * onboarding, or for a team someone is working in.
 */
export async function recordStep(scope: AccountScope, event: OnboardingEvent): Promise<void> {
  if (!isOwnAccount(scope)) return;
  await query(
    `insert into qr_onboarding_steps (user_id, step)
     select user_id, $2 from qr_onboarding where user_id = $1 and ${access(3)}
     on conflict (user_id, step) do nothing`,
    [scope.accountId, event, ...accessArgs(scope, "write")]
  );
}

/** The same, for callers that must never fail because of it. */
export function recordStepQuietly(scope: AccountScope, event: OnboardingEvent): Promise<void> {
  return recordStep(scope, event).catch((error) => {
    console.error(`[onboarding] could not record ${event}`, error);
  });
}

export async function getOnboarding(scope: AccountScope): Promise<OnboardingState | null> {
  if (!isOwnAccount(scope)) return null;
  const row = await queryOne<StateRow>(
    `select o.origin, o.purpose, o.draft, o.code_id, o.started_at, o.skipped_at, o.completed_at,
            array(select s.step from qr_onboarding_steps s where s.user_id = o.user_id) as reached
     from qr_onboarding o
     where o.user_id = $1 and ${access(2)}`,
    [scope.accountId, ...accessArgs(scope, "read")]
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
export async function readOnboardingSafely(
  scope: AccountScope
): Promise<OnboardingState | null | "unavailable"> {
  try {
    return await getOnboarding(scope);
  } catch (error) {
    console.error("[onboarding] state unavailable", error);
    return "unavailable";
  }
}

/**
 * Whether the signed-in person is a live member of anyone's team. Someone
 * who joined a team and never started the onboarding is not sent to it from
 * their own empty account: they came to work in the team. The empty
 * dashboard still offers it. Reads only the person's own memberships, by
 * the actor id the session's scope carries. An error answers "yes", which
 * only ever means "do not redirect".
 */
export async function belongsToATeamSafely(scope: AccountScope): Promise<boolean> {
  try {
    const row = await queryOne<{ member: boolean }>(
      `select exists (
         select 1 from qr_account_members m
         where m.user_id = $1 and m.removed_at is null
       ) as member`,
      [scope.actorId]
    );
    return row?.member === true;
  } catch (error) {
    console.error("[onboarding] team membership unavailable", error);
    return true;
  }
}

export async function setPurpose(scope: AccountScope, purpose: Purpose): Promise<void> {
  if (!isOwnAccount(scope)) return;
  await query(
    `update qr_onboarding set purpose = $2, updated_at = now()
     where user_id = $1 and ${access(3)}`,
    [scope.accountId, purpose, ...accessArgs(scope, "write")]
  );
  await recordStep(scope, "purpose_chosen");
}

/** Keep the screened destination until the code is made from it. */
export async function setDraft(scope: AccountScope, draft: OnboardingDraft): Promise<void> {
  if (!isOwnAccount(scope)) return;
  await query(
    `update qr_onboarding set draft = $2::jsonb, updated_at = now()
     where user_id = $1 and ${access(3)}`,
    [scope.accountId, JSON.stringify(draft), ...accessArgs(scope, "write")]
  );
  await recordStep(scope, "destination_set");
}

/**
 * Tie the code made on screen 4 to the onboarding and drop the draft: the
 * destination now lives on the code, and keeping a second copy here would be
 * personal data with no further use.
 */
export async function attachCode(scope: AccountScope, codeId: string): Promise<void> {
  if (!isOwnAccount(scope)) return;
  await query(
    `update qr_onboarding
        set code_id = $2::bigint, draft = '{}'::jsonb, updated_at = now()
      where user_id = $1 and ${access(3)}
        and exists (select 1 from qr_codes c where c.id = $2::bigint and c.user_id = $1)`,
    [scope.accountId, codeId, ...accessArgs(scope, "write")]
  );
  await recordStep(scope, "code_created");
}

/** The first skip, and the screen it was from, are the ones that are kept. */
export async function skipOnboarding(scope: AccountScope, screen: string): Promise<void> {
  if (!isOwnAccount(scope)) return;
  await query(
    `update qr_onboarding
        set skipped_at = coalesce(skipped_at, now()),
            skipped_step = coalesce(skipped_step, $2),
            updated_at = now()
      where user_id = $1 and completed_at is null and ${access(3)}`,
    [scope.accountId, screen, ...accessArgs(scope, "write")]
  );
}

export async function completeOnboarding(scope: AccountScope): Promise<void> {
  if (!isOwnAccount(scope)) return;
  await query(
    `update qr_onboarding set completed_at = coalesce(completed_at, now()), updated_at = now()
      where user_id = $1 and ${access(2)}`,
    [scope.accountId, ...accessArgs(scope, "write")]
  );
  await recordStep(scope, "completed");
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
export async function latestTestScan(scope: AccountScope): Promise<TestScan | null> {
  if (!isOwnAccount(scope)) return null;
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
     where o.user_id = $1 and not s.is_bot and ${access(2)}
     order by s.scanned_at desc
     limit 1`,
    [scope.accountId, ...accessArgs(scope, "read")]
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
