import type { Artwork } from "@/lib/qr-artwork";

/**
 * An `Artwork` as an inline SVG element: the same shapes `artworkSvg` writes
 * into a download, so a specimen on screen and the file the owner prints are
 * one drawing. Renders on the server or in the browser alike.
 */
export function QrArtworkSvg({
  art,
  px,
  title,
  logoUrl,
  className,
  viewBox,
}: {
  art: Artwork;
  px: number;
  title: string;
  logoUrl?: string | null;
  className?: string;
  /** To show part of the symbol, such as one corner square in a picker. */
  viewBox?: string;
}) {
  const square = art.layers.every((layer) => !/[Aa]/.test(layer.d));
  return (
    <svg
      viewBox={viewBox ?? `0 0 ${art.span} ${art.span}`}
      width={px}
      height={px}
      className={className}
      shapeRendering={square ? "crispEdges" : undefined}
      role="img"
      aria-label={title}
    >
      {art.ground ? <rect width={art.span} height={art.span} fill={art.ground} /> : null}
      {art.layers.map((layer, index) =>
        layer.d ? (
          <path key={index} d={layer.d} fill={layer.fill} fillRule={layer.evenOdd ? "evenodd" : undefined} />
        ) : null
      )}
      {art.logo && logoUrl ? (
        <image
          href={logoUrl}
          x={art.logo.x}
          y={art.logo.y}
          width={art.logo.side}
          height={art.logo.side}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
    </svg>
  );
}
