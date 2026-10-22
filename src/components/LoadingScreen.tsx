import { QrMark } from "./QrMark";

/**
 * Full-page loading state, used by every `loading.tsx` in the app.
 *
 * The label is a prop rather than a fixed string because the two audiences on
 * this host are different people: a client waiting for their dashboard knows
 * what they asked for, while someone who has just scanned a printed code does
 * not know what this site is and needs telling that something is coming.
 *
 * `role="status"` on the text, not on the mark -- a screen reader should hear
 * the sentence once, not the decorative glyph as well.
 */
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-12">
      <div className="flex flex-col items-center text-center">
        <QrMark size="lg" />
        <p role="status" aria-live="polite" className="mt-6 text-sm text-muted-foreground">
          {label}
        </p>
      </div>
    </main>
  );
}

/**
 * The same mark at text size, for a pending button or an inline row. Takes no
 * label of its own: the thing it sits beside already has one.
 */
export function LoadingMark({ className }: { className?: string }) {
  return <QrMark size="sm" className={className} />;
}
