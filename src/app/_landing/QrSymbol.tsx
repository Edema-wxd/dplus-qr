import QRCode from "qrcode";

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
 * Runs at build time. The page reads no request API, so Next evaluates this
 * once and ships the markup — nothing here reaches a scanner's critical path.
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
  const span = n + quiet * 2;

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
