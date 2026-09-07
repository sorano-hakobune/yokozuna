import type { AxisAlignedBounds } from "@/lib/selection/selectionBounds";

type Props = {
  bounds: AxisAlignedBounds;
  zoom: number;
  showMoveOnly?: boolean;
  count: number;
};

const SEL_STROKE = "#0b0f12";
const SEL_OUTER = "#ffffff";

/** Axis-aligned group selection box (multi-select). */
export function SelectionOverlay({ bounds, zoom, count }: Props) {
  const invZoom = 1 / Math.max(0.15, zoom);
  const strokeW = 1.5 * invZoom;
  const outerW = 3 * invZoom;
  const pad = 2 * invZoom;

  return (
    <g className="selection-overlay" pointerEvents="none">
      <rect
        x={bounds.minX - pad}
        y={bounds.minY - pad}
        width={bounds.width + pad * 2}
        height={bounds.height + pad * 2}
        fill="rgba(224, 90, 60, 0.06)"
        stroke={SEL_OUTER}
        strokeWidth={outerW}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={bounds.minX - pad}
        y={bounds.minY - pad}
        width={bounds.width + pad * 2}
        height={bounds.height + pad * 2}
        fill="none"
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        strokeDasharray={`${5 * invZoom} ${3 * invZoom}`}
        vectorEffect="non-scaling-stroke"
      />
      {count > 1 && (
        <text
          x={bounds.maxX + 6 * invZoom}
          y={bounds.minY - 4 * invZoom}
          fill={SEL_OUTER}
          stroke={SEL_STROKE}
          strokeWidth={0.6 * invZoom}
          fontSize={11 * invZoom}
          paintOrder="stroke"
          style={{ userSelect: "none" }}
        >
          {count}
        </text>
      )}
    </g>
  );
}

type MarqueeProps = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zoom: number;
};

export function MarqueeRect({ x0, y0, x1, y1, zoom }: MarqueeProps) {
  const invZoom = 1 / Math.max(0.15, zoom);
  const minX = Math.min(x0, x1);
  const minY = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  return (
    <rect
      className="marquee-rect"
      x={minX}
      y={minY}
      width={w}
      height={h}
      fill="rgba(224, 90, 60, 0.12)"
      stroke="#e05a3c"
      strokeWidth={1 * invZoom}
      strokeDasharray={`${4 * invZoom} ${3 * invZoom}`}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
    />
  );
}
