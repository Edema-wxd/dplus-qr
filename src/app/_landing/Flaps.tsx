/**
 * A word set on split flaps: one fixed cell per character.
 *
 * Plain markup with no hooks, so the server page and the client demo both use
 * it. The characters are presentational; the readable text is carried once,
 * whole, for assistive technology, so a screen reader hears "LIVE" rather
 * than four separate letters.
 *
 * `flip` turns the cells over in sequence (see `.lp-flaps[data-flip]` in
 * globals.css). To replay it, the caller changes this component's `key`.
 */
export type FlapTone = "plain" | "live" | "new" | "off" | "cyan" | "dim";

export function Flaps({
  text,
  cells,
  tone = "plain",
  flip = false,
  delayMs = 0,
  className,
}: {
  text: string;
  /** Pad to this many cells, so a column of rows lines up like a real board. */
  cells?: number;
  tone?: FlapTone;
  flip?: boolean;
  delayMs?: number;
  className?: string;
}) {
  const chars = Array.from(cells && text.length < cells ? text.padEnd(cells, " ") : text);

  return (
    <span
      className={`lp-flaps ${className ?? ""}`}
      data-tone={tone === "plain" ? undefined : tone}
      data-flip={flip ? "" : undefined}
      style={delayMs ? ({ "--d": `${delayMs}ms` } as React.CSSProperties) : undefined}
    >
      <span className="sr-only">{text}</span>
      {chars.map((char, index) => (
        <span
          key={index}
          aria-hidden
          className="lp-flap"
          style={{ "--i": index } as React.CSSProperties}
        >
          {char === " " ? " " : char}
        </span>
      ))}
    </span>
  );
}
