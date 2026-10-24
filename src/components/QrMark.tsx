/**
 * The QR glyph used as this platform's loading indicator.
 *
 * Three finder eyes in the brand ink, and the four squares of the wordmark's
 * QR motif in the brand colours. Animated, the four squares light in clockwise
 * order, which reads as a code being scanned -- the one thing every visitor to
 * this host has just done, whether they are a client signing in or someone who
 * pointed a phone at a package.
 *
 * No `"use client"`: the whole animation is CSS in globals.css, so it runs
 * inside a streamed Suspense fallback with no JavaScript on the page at all,
 * and it respects `prefers-reduced-motion` without a media query hook.
 */

const SIZES = {
  sm: 28,
  md: 44,
  lg: 64,
} as const;

/**
 * The four squares sit in the bottom-right corner, on the same footprint and
 * the same grid as the three eyes -- exactly where a fourth eye would be if a
 * QR code had one. The colours are the wordmark's, so the mark is recognisably
 * the same object as the logo in the footer below it.
 *
 * Listed clockwise from the top left, which is the order they light in.
 */
const MODULES = [
  { x: 30, y: 30, className: "fill-dsp-blue", delay: "0ms" },
  { x: 38, y: 30, className: "fill-dsp-green", delay: "160ms" },
  { x: 38, y: 38, className: "fill-dsp-yellow", delay: "320ms" },
  { x: 30, y: 38, className: "fill-dsp-red", delay: "480ms" },
] as const;

/** The three corner eyes, as a QR code has. */
const EYES = [
  { x: 2, y: 2 },
  { x: 30, y: 2 },
  { x: 2, y: 30 },
] as const;

/**
 * Timing modules: static, and only there so the glyph reads as a code rather
 * than as four dots between three squares.
 */
const QUIET_MODULES = [
  { x: 22, y: 4 },
  { x: 22, y: 12 },
  { x: 4, y: 22 },
  { x: 12, y: 22 },
  { x: 22, y: 22 },
] as const;

export function QrMark({
  size = "md",
  animated = true,
  className,
}: {
  size?: keyof typeof SIZES;
  animated?: boolean;
  className?: string;
}) {
  const px = SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      // Decorative. Every caller pairs it with a live region or a heading that
      // says what is happening, so announcing it twice would only be noise.
      aria-hidden="true"
      className={[animated ? "qr-mark-animated" : null, className]
        .filter(Boolean)
        .join(" ")}
    >
      {EYES.map((eye) => (
        <g key={`${eye.x}-${eye.y}`}>
          <rect
            x={eye.x + 1.75}
            y={eye.y + 1.75}
            width={12.5}
            height={12.5}
            rx={3.5}
            stroke="currentColor"
            strokeWidth={3.5}
          />
          <rect
            x={eye.x + 5.5}
            y={eye.y + 5.5}
            width={5}
            height={5}
            rx={1.5}
            fill="currentColor"
          />
        </g>
      ))}

      {QUIET_MODULES.map((module) => (
        <rect
          key={`${module.x}-${module.y}`}
          x={module.x}
          y={module.y}
          width={4}
          height={4}
          rx={1.25}
          fill="currentColor"
          opacity={0.22}
        />
      ))}

      {MODULES.map((module) => (
        <rect
          key={`${module.x}-${module.y}`}
          x={module.x}
          y={module.y}
          width={6}
          height={6}
          rx={1.75}
          className={[module.className, animated ? "qr-module" : null]
            .filter(Boolean)
            .join(" ")}
          style={animated ? { animationDelay: module.delay } : undefined}
          opacity={animated ? undefined : 1}
        />
      ))}
    </svg>
  );
}
