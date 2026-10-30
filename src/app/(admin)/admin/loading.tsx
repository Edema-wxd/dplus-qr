/**
 * Shown while an admin page reads its data. Every admin page is per-request
 * (`instant = false`), so without this a click would leave staff on the old
 * page with no sign anything happened. The dark column holds the sidebar's
 * place so the frame does not jump when the page arrives; it carries no links,
 * because it renders before the staff check and must reveal nothing.
 */
export default function AdminLoading() {
  return (
    <div className="dash min-h-dvh lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]" aria-busy="true">
      <div className="h-14 bg-[var(--field)] lg:sticky lg:top-0 lg:h-dvh" />
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <p className="sr-only" role="status">Loading…</p>
        <div className="h-9 w-56 animate-pulse rounded-md bg-[var(--paper-rule)]" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-[var(--paper-rule)]/70" />
        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-rule)] lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[5.5rem] bg-white" />
          ))}
        </div>
        <div className="mt-10 space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-white" />
          ))}
        </div>
      </main>
    </div>
  );
}
