import type { AxisAlignedBounds } from "@/lib/selection/selectionBounds";
import type { HandleId } from "./transformGeometry";

const HANDLE_SIZE = 8;
const ROTATE_OFFSET = 28;

const SEL_STROKE = "#0b0f12";
const SEL_OUTER = "#ffffff";
const SEL_ACTIVE = "#e05a3c";

type Props = {
  bounds: AxisAlignedBounds;
  zoom: number;
  activeHandle?: HandleId | null;
  count: number;
};

/** Axis-aligned group transform handles for multi-select. */
export function GroupTransformControls({
  bounds,
  zoom,
  activeHandle,
  count,
}: Props) {
  const invZoom = 1 / Math.max(0.15, zoom);
  const hs = HANDLE_SIZE * invZoom;
  const strokeW = 1.5 * invZoom;
  const outerW = 3 * invZoom;
  const pad = 2 * invZoom;

  const x = bounds.minX - pad;
  const y = bounds.minY - pad;
  const w = bounds.width + pad * 2;
  const h = bounds.height + pad * 2;
  const cx = bounds.cx;
  const cy = bounds.cy;

  const handles: { id: HandleId; x: number; y: number }[] = [
    { id: "nw", x: x, y: y },
    { id: "n", x: cx, y: y },
    { id: "ne", x: x + w, y: y },
    { id: "e", x: x + w, y: cy },
    { id: "se", x: x + w, y: y + h },
    { id: "s", x: cx, y: y + h },
    { id: "sw", x: x, y: y + h },
    { id: "w", x: x, y: cy },
  ];

  const rotateY = y - ROTATE_OFFSET * invZoom;

  // Group pivot (基準点): multi-select rotation/scale center (union center).
  const pivotR = hs * 0.55;
  const pivotArm = hs * 1.1;

  return (
    <g className="group-transform-controls" pointerEvents="none">
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="rgba(224, 90, 60, 0.06)"
        stroke={SEL_OUTER}
        strokeWidth={outerW}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        strokeDasharray={`${5 * invZoom} ${3 * invZoom}`}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx}
        y1={y}
        x2={cx}
        y2={rotateY}
        stroke={SEL_OUTER}
        strokeWidth={outerW}
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
      <line
        x1={cx}
        y1={y}
        x2={cx}
        y2={rotateY}
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={cx}
        cy={rotateY}
        r={hs * 0.65}
        fill={activeHandle === "rotate" ? SEL_ACTIVE : SEL_OUTER}
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      {handles.map((hnd) => (
        <rect
          key={hnd.id}
          x={hnd.x - hs / 2}
          y={hnd.y - hs / 2}
          width={hs}
          height={hs}
          fill={activeHandle === hnd.id ? SEL_ACTIVE : SEL_OUTER}
          stroke={SEL_STROKE}
          strokeWidth={strokeW}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {/* Group pivot (基準点) marker — display only */}
      <line
        x1={cx - pivotArm}
        y1={cy}
        x2={cx + pivotArm}
        y2={cy}
        stroke={SEL_OUTER}
        strokeWidth={outerW}
        vectorEffect="non-scaling-stroke"
        opacity={0.95}
      />
      <line
        x1={cx}
        y1={cy - pivotArm}
        x2={cx}
        y2={cy + pivotArm}
        stroke={SEL_OUTER}
        strokeWidth={outerW}
        vectorEffect="non-scaling-stroke"
        opacity={0.95}
      />
      <line
        x1={cx - pivotArm}
        y1={cy}
        x2={cx + pivotArm}
        y2={cy}
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx}
        y1={cy - pivotArm}
        x2={cx}
        y2={cy + pivotArm}
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={cx}
        cy={cy}
        r={pivotR}
        fill={SEL_OUTER}
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      {count > 1 && (
        <text
          x={x + w + 6 * invZoom}
          y={y - 4 * invZoom}
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
