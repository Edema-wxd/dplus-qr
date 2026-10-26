"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRealtimeClient, type SealedLiveQuery } from "@neon/realtime/client";
import { RealtimeProvider, useLiveQuery } from "@neon/realtime-react";
import type { CodeRow, UtcDay } from "@/lib/user-codes";
import type { LiveCodes as LiveCodesData } from "@/lib/live-codes";

/**
 * The dashboard's code rows, kept live by Neon Realtime.
 *
 * The server renders the rows it read and hands over a sealed query for the
 * same SQL. This component shows those rows at once -- they are real rows, not
 * a placeholder -- and the first live result replaces them in place. After
 * that every committed change to the user's codes or their scans arrives on
 * its own: a scan on someone's phone ticks the count, an admin block flips the
 * pill, an edit in another tab shows up here.
 *
 * When `live` is null (Realtime not configured, or sealing failed) it renders
 * the server rows and nothing else. The dashboard never depends on Realtime.
 */

export type LiveStatus = "static" | "connecting" | "live" | "stale" | "closed" | "error";

type LiveRows = { rows: readonly CodeRow[]; status: LiveStatus };

const LiveRowsContext = createContext<LiveRows | null>(null);

export function useLiveRows(): LiveRows {
  const value = useContext(LiveRowsContext);
  if (!value) throw new Error("useLiveRows must be used inside <LiveCodes>");
  return value;
}

/** The single code on a code page. Null only if it stops matching the query. */
export function useLiveRow(): { row: CodeRow | null; status: LiveStatus } {
  const { rows, status } = useLiveRows();
  return { row: rows[0] ?? null, status };
}

type Props = {
  rows: CodeRow[];
  live: LiveCodesData | null;
  /** The user the page was rendered for. Renewals for anyone else are refused. */
  userId: string;
  /** Set on a code's own page, to narrow the query to that code. */
  id?: string;
  children: ReactNode;
};

export function LiveCodes({ rows, live, userId, id, children }: Props) {
  if (!live) {
    return (
      <LiveRowsContext.Provider value={{ rows, status: "static" }}>
        {children}
      </LiveRowsContext.Provider>
    );
  }
  return (
    <RealtimeRoot url={live.url}>
      <DaySubscription initialRows={rows} live={live} userId={userId} id={id}>
        {children}
      </DaySubscription>
    </RealtimeRoot>
  );
}

/**
 * One client per mounted page, created in a `useState` initializer rather
 * than at module scope: during the server render it is constructed but never
 * connects, because nothing subscribes on the server.
 */
function RealtimeRoot({ url, children }: { url: string; children: ReactNode }) {
  const [client] = useState(() => createRealtimeClient({ url }));
  // Not closed on unmount: Strict Mode replays effects in development, and a
  // cleanup that closed it would leave the remount holding a dead client.
  // Leaving the page drops it with everything else.
  return <RealtimeProvider client={client}>{children}</RealtimeProvider>;
}

// Module scope on purpose: once a renewal comes back signed out, every
// subscription on the page stops asking, and the reload below resets it.
let signedOut = false;

async function fetchSealed(
  userId: string,
  day: UtcDay,
  id: string | undefined
): Promise<SealedLiveQuery<CodeRow>> {
  if (signedOut) throw new Error("Signed out");

  const response = await fetch("/api/realtime/codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, day, id }),
    cache: "no-store",
  });

  if (response.status === 401) {
    // The hook retries a failed renewal every second, so stop here, and leave
    // with a full page load: it drops this user's rows and client, and the
    // page's own guard sends the visitor to sign-in or to their own codes.
    signedOut = true;
    window.location.reload();
    throw new Error("Signed out");
  }
  if (!response.ok) {
    throw new Error(`Could not renew live updates (${response.status})`);
  }
  return (await response.json()) as SealedLiveQuery<CodeRow>;
}

function utcToday(): UtcDay {
  return new Date().toISOString().slice(0, 10);
}

/** Milliseconds until just after the next UTC midnight. */
function untilNextUtcDay(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime() + 2_000;
}

type Day = {
  day: UtcDay;
  sealedQuery: SealedLiveQuery<CodeRow>;
  /** What the subscription shows until its first result arrives. */
  initialRows: readonly CodeRow[];
};

/**
 * Holds the sealed query for the current UTC day.
 *
 * "Today" is a parameter of the query, not `now()` -- live queries must be
 * deterministic -- so a page left open overnight would otherwise keep counting
 * yesterday as today. `Subscription` seals the next day's query at midnight
 * and hands it up here with the rows it was showing, so the new subscription
 * starts from them and the table never empties.
 */
function DaySubscription({
  initialRows,
  live,
  userId,
  id,
  children,
}: {
  initialRows: readonly CodeRow[];
  live: LiveCodesData;
  userId: string;
  id?: string;
  children: ReactNode;
}) {
  // Kept from the first render. A server re-render after a form submit sends a
  // new sealed object for the same query, and handing that to the hook would
  // restart the subscription for nothing; renewals go through refreshQuery.
  const [current, setCurrent] = useState<Day>(() => ({
    day: live.day,
    sealedQuery: live.sealedQuery,
    initialRows,
  }));

  return (
    <Subscription
      // A new day is a new query: remount, so the hook subscribes afresh.
      key={current.sealedQuery.queryFingerprint}
      current={current}
      userId={userId}
      id={id}
      onNextDay={setCurrent}
    >
      {children}
    </Subscription>
  );
}

function Subscription({
  current,
  userId,
  id,
  onNextDay,
  children,
}: {
  current: Day;
  userId: string;
  id?: string;
  onNextDay: (next: Day) => void;
  children: ReactNode;
}) {
  const { day, sealedQuery, initialRows } = current;

  // A renewal must be for exactly the sealed query, so it names the same day.
  const refreshQuery = useCallback(
    () => fetchSealed(userId, day, id),
    [userId, day, id]
  );

  const { data, status } = useLiveQuery(sealedQuery, {
    refreshQuery,
    initialData: initialRows,
  });
  const rows = data ?? initialRows;

  // Read by the midnight timer, which outlives any one render.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const roll = () => {
      const next = utcToday();
      if (next === day) {
        timer = setTimeout(roll, untilNextUtcDay());
        return;
      }
      fetchSealed(userId, next, id).then(
        (nextQuery) => {
          if (!cancelled) {
            onNextDay({ day: next, sealedQuery: nextQuery, initialRows: rowsRef.current });
          }
        },
        // Try again shortly. Until then the old day's query stays live, so
        // "today" lags by a minute rather than going blank.
        () => {
          if (!cancelled) timer = setTimeout(roll, 60_000);
        }
      );
    };

    timer = setTimeout(roll, untilNextUtcDay());
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [day, userId, id, onNextDay]);

  return (
    <LiveRowsContext.Provider value={{ rows, status }}>
      {children}
    </LiveRowsContext.Provider>
  );
}

/**
 * A quiet line saying whether the figures are live.
 *
 * Silent while connecting: the server rows are real, and announcing a
 * connection on every page load would be noise. It speaks up only when the
 * figures might be behind.
 */
export function LiveIndicator() {
  const { status } = useLiveRows();
  if (status === "static" || status === "connecting" || status === "closed") return null;

  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--live-ink)]">
        <span aria-hidden className="size-1.5 rounded-full bg-[var(--live-ink)]" />
        Live
      </span>
    );
  }

  return (
    <span role="status" className="text-xs text-[var(--paper-soft)]">
      {status === "stale"
        ? "Reconnecting. Figures may be a moment behind."
        : "Live updates stopped. Reload to resume."}
    </span>
  );
}
