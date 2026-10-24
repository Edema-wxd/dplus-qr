import QRCode from "qrcode";
import { BRAND_COLORS, CODE_HOST } from "@/lib/brand";

/**
 * A phone scanning a printed table card. Drawn rather than photographed so it
 * ships with no image asset and stays crisp at any size.
 *
 * The code is real and resolves to the product's own host, so anyone who
 * points a camera at the screen gets somewhere sensible.
 */
const qr = QRCode.create(`https://${CODE_HOST}`, { errorCorrectionLevel: "M" });
const QR_SIZE = qr.modules.size;
const QR_PATH = (() => {
  let d = "";
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return d;
})();

const PAPER = "#FAF8F3";
const SKIN = "#C98B63";
const SKIN_SHADE = "#B07651";

/** The code with a quiet zone, scaled to `size` and placed at (x, y). */
function Code({ x, y, size }: { x: number; y: number; size: number }) {
  const quiet = 2;
  const scale = size / (QR_SIZE + quiet * 2);
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect width={QR_SIZE + quiet * 2} height={QR_SIZE + quiet * 2} fill={PAPER} />
      <path d={QR_PATH} transform={`translate(${quiet} ${quiet})`} fill={BRAND_COLORS.ink} />
    </g>
  );
}

export function ScanIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 520"
      className={className}
      role="img"
      aria-label="A phone camera scanning the QR code on a café table card"
    >
      <defs>
        <linearGradient id="scan-wrist-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="scan-wrist" maskUnits="userSpaceOnUse" x="0" y="380" width="420" height="140">
          <rect x="0" y="380" width="420" height="140" fill="url(#scan-wrist-fade)" />
        </mask>
      </defs>

      {/* Table */}
      <ellipse cx="190" cy="430" rx="190" ry="34" fill="#000" opacity="0.12" />

      {/* Table card */}
      <g transform="rotate(-7 150 250)">
        <rect x="40" y="70" width="210" height="300" rx="14" fill={PAPER} />
        <rect x="40" y="70" width="210" height="12" rx="6" fill={BRAND_COLORS.amber} />
        <text
          x="145"
          y="122"
          textAnchor="middle"
          fontFamily="var(--font-sarlotte), serif"
          fontSize="24"
          fill={BRAND_COLORS.ink}
        >
          Today&apos;s menu
        </text>
        <Code x={75} y={142} size={140} />
        <text
          x="145"
          y="314"
          textAnchor="middle"
          fontFamily="var(--font-raleway), sans-serif"
          fontSize="12"
          fill="#555"
        >
          Scan to order
        </text>
        <rect x="95" y="332" width="100" height="6" rx="3" fill="#E4E0D6" />
      </g>

      {/* Hand, behind the phone */}
      <path
        d="M236 520 C232 470 226 430 240 400 L392 392 C404 430 404 480 398 520 Z"
        fill={SKIN}
        mask="url(#scan-wrist)"
      />
      <rect x="374" y="262" width="34" height="40" rx="17" fill={SKIN_SHADE} />
      <rect x="378" y="300" width="34" height="42" rx="17" fill={SKIN_SHADE} />
      <rect x="376" y="340" width="32" height="40" rx="16" fill={SKIN_SHADE} />

      {/* Phone */}
      <g transform="rotate(4 300 300)">
        <rect x="200" y="130" width="186" height="340" rx="30" fill="#0B0D0E" />
        <rect x="208" y="138" width="170" height="324" rx="23" fill="#2B3033" />

        {/* Camera view of the card */}
        <rect x="226" y="196" width="134" height="160" rx="8" fill={PAPER} opacity="0.95" />
        <Code x={241} y={216} size={104} />

        {/* Viewfinder */}
        <g
          fill="none"
          stroke={BRAND_COLORS.green}
          strokeWidth="4"
          strokeLinecap="round"
        >
          <path d="M232 222v-14h14" />
          <path d="M340 208h14v14" />
          <path d="M354 312v14h-14" />
          <path d="M246 326h-14v-14" />
        </g>

        {/* Detected link */}
        <rect x="222" y="384" width="142" height="42" rx="21" fill={PAPER} />
        <circle cx="244" cy="405" r="9" fill={BRAND_COLORS.cyan} />
        <text
          x="260"
          y="409"
          fontFamily="var(--font-raleway), sans-serif"
          fontSize="11"
          fill={BRAND_COLORS.ink}
        >
          {CODE_HOST}
        </text>

        {/* Notch */}
        <rect x="270" y="146" width="46" height="12" rx="6" fill="#0B0D0E" />
      </g>

      {/* Thumb over the phone's edge */}
      <path
        d="M212 392 C196 380 186 356 196 344 C206 334 222 350 232 372 C238 386 228 402 212 392 Z"
        fill={SKIN}
      />

      {/* Scan cue */}
      <g stroke={BRAND_COLORS.coral} strokeWidth="3" strokeLinecap="round">
        <path d="M262 92l10-16" />
        <path d="M284 100l18-10" />
        <path d="M290 122h20" />
      </g>
    </svg>
  );
}
