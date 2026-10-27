import type { Artwork } from "@/lib/qr-artwork";
import type { FrameLayout, Layer } from "@/lib/frames";

/**
 * An `Artwork`, and its frame if it has one, as an inline SVG element: the
 * same shapes `artworkSvg` writes into a download, so a specimen on screen
 * and the file the owner prints are one drawing. Renders on the server or in
 * the browser alike.
 */
export function QrArtworkSvg({
  art,
  frame,
  px,
  title,
  logoUrl,
  className,
  viewBox,
}: {
  art: Artwork;
  frame?: FrameLayout;
  /** Width; a frame below or above makes the image taller. */
  px: number;
  title: string;
  logoUrl?: string | null;
  className?: string;
  /** To show part of the symbol, such as one corner square in a picker. */
  viewBox?: string;
}) {
  const width = frame?.width ?? art.span;
  const height = frame?.height ?? art.span;
  const square =
    !frame?.back.length && !frame?.front.length && !art.logo?.preset && art.layers.every((layer) => !/[Aa]/.test(layer.d));
  const logo = art.logo;
  return (
    <svg
      viewBox={viewBox ?? `0 0 ${width} ${height}`}
      width={px}
      height={viewBox ? px : Math.round((px * height) / width)}
      className={className}
      shapeRendering={square ? "crispEdges" : undefined}
      role="img"
      aria-label={title}
    >
      {frame?.back.map(paint)}
      <g transform={frame ? `translate(${frame.qr.x} ${frame.qr.y})` : undefined}>
        {art.ground ? <rect width={art.span} height={art.span} fill={art.ground} /> : null}
        {art.layers.map(paint)}
        {logo?.preset ? (
          <>
            <circle cx={logo.x + logo.side / 2} cy={logo.y + logo.side / 2} r={logo.side / 2} fill={logo.preset.hex} />
            <svg
              x={logo.x + logo.side * 0.2}
              y={logo.y + logo.side * 0.2}
              width={logo.side * 0.6}
              height={logo.side * 0.6}
              viewBox="0 0 24 24"
            >
              <path d={logo.preset.path} fill="#FFFFFF" />
            </svg>
          </>
        ) : logo && logoUrl ? (
          <image
            href={logoUrl}
            x={logo.x}
            y={logo.y}
            width={logo.side}
            height={logo.side}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null}
      </g>
      {frame?.front.map(paint)}
    </svg>
  );
}

function paint(layer: Layer, index: number) {
  return layer.d ? (
    <path key={index} d={layer.d} fill={layer.fill} fillRule={layer.evenOdd ? "evenodd" : undefined} />
  ) : null;
}
