import QRCode from "qrcode";

type Geometry = { path: string; span: number; quiet: number };

/**
 * Generated symbols, kept by the string they encode.
 *
 * A symbol is a pure function of its content at a fixed error-correction
 * level, so this can never go stale: a given URL has exactly one grid, for as
 * long as the process lives. What it saves is real -- the code list renders
 * one symbol per row on a per-request page, and an account at the top tier's
 * limit would otherwise run a hundred encodes and build a hundred path strings
 * before the page could stream.
 *
 * Bounded, and the bound is the point: this is a module-scope map in a
 * long-lived server process, which is a memory leak unless something stops it
 * growing. Oldest-first eviction, because `Map` iterates in insertion order
 * and the useful entries on any one page are the ones just inserted.
 */
const CACHE_LIMIT = 512;
const cache = new Map<string, Geometry>();

function geometry(value: string): Geometry {
  const hit = cache.get(value);
  if (hit) return hit;

  const qr = QRCode.create(value, { errorCorrectionLevel: "Q" });
  const n = qr.modules.size;
  const data = qr.modules.data;

  // One path for every dark module. Cheaper than n² elements, and it keeps the
  // symbol a single paint for the browser.
  let path = "";
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (data[y * n + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }

  // A quiet zone is part of the symbol, not padding around it: without four
  // modules of clear ground a scanner can fail to find the finder patterns.
  const quiet = 4;
  const built: Geometry = { path, quiet, span: n + quiet * 2 };

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(value, built);

  return built;
}

/**
 * A real QR symbol, drawn from the same library that will generate the
 * downloadable code artwork.
 *
 * Deliberately not an image and not a decorative approximation: the page's
 * whole argument is that this exact grid is what gets printed, so drawing a
 * fake one would be the one lie the surface cannot afford. Error correction is
 * Q, the level a printed code without a logo wants, and the level every
 * module-count figure on the page is quoted at.
 *
 * On the landing page this runs at build time: that page reads no request API,
 * so Next evaluates it once and ships the markup. The dashboard is the other
 * case -- those pages set `instant = false`, so every symbol in a code list is
 * generated per request, one per row. Hence the cache below. Either way
 * nothing here is on a scanner's critical path.
 */
export function QrSymbol({
  value,
  px,
  className,
  title,
}: {
  value: string;
  px: number;
  className?: string;
  title?: string;
}) {
  const { path, span, quiet } = geometry(value);

  return (
    <svg
      viewBox={`0 0 ${span} ${span}`}
      width={px}
      height={px}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title ?? `QR code for ${value}`}
    >
      <rect width={span} height={span} fill="var(--qr-ground)" />
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={path} fill="var(--qr-ink)" />
      </g>
    </svg>
  );
}

/** The module count for a value at the level the page quotes. */
export function moduleCount(value: string): number {
  return QRCode.create(value, { errorCorrectionLevel: "Q" }).modules.size;
}
