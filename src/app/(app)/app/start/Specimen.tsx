/**
 * The code before it exists.
 *
 * Three finder squares on the grid a real code of this host's length uses
 * (29 modules), with the data area left as a faint dot grid. It reads as a
 * code waiting to be filled in, and it **cannot be scanned**: there is no
 * format information and no data in it. Showing a real-looking symbol before
 * the code is made would invite someone to photograph and print a code that
 * leads nowhere, which is the one thing this platform exists to prevent.
 *
 * Painted with `--ob-ink` when the create screen's colour picker sets it,
 * and the dashboard's `--qr-ink` otherwise. Not `--qr-ink` alone, because the
 * `.dash` frame inside the picker's scope redefines that one.
 */
const GRID = 29;
const QUIET = 4;
const SPAN = GRID + QUIET * 2;
const FINDERS = [
  [0, 0],
  [GRID - 7, 0],
  [0, GRID - 7],
] as const;

function inFinder(x: number, y: number): boolean {
  return FINDERS.some(([fx, fy]) => x >= fx - 1 && x <= fx + 7 && y >= fy - 1 && y <= fy + 7);
}

const DOTS: [number, number][] = [];
for (let y = 0; y < GRID; y += 2) {
  for (let x = 0; x < GRID; x += 2) {
    if (!inFinder(x, y)) DOTS.push([x, y]);
  }
}

export function CodeOutline({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SPAN} ${SPAN}`}
      className={className}
      role="img"
      aria-label="Your code, not made yet"
    >
      <g transform={`translate(${QUIET} ${QUIET})`} fill="var(--ob-ink, var(--qr-ink))">
        {FINDERS.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <path
              fillRule="evenodd"
              d={`M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z`}
            />
            <rect x={x + 2} y={y + 2} width={3} height={3} />
          </g>
        ))}
        <g opacity={0.16}>
          {DOTS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.32} />
          ))}
        </g>
      </g>
    </svg>
  );
}
