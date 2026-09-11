import type { Element } from "@/types/project";
import {
  elementWorldTransform,
  getHandleWorldPositions,
  getLocalBounds,
  getRotateHandleLocal,
  localToWorld,
  type HandleId,
} from "./transformGeometry";

const HANDLE_SIZE = 8;

/** High-contrast selection chrome — readable on any fill/stroke color. */
const SEL_STROKE = "#0b0f12";
const SEL_OUTER = "#ffffff";
const SEL_ACTIVE = "#e05a3c";

type Props = {
  element: Element;
  asset?: { width?: number; height?: number };
  zoom: number;
  activeHandle?: HandleId | null;
};

export function TransformControls({
  element,
  asset,
  zoom,
  activeHandle,
}: Props) {
  const bounds = getLocalBounds(element, asset);
  const t = elementWorldTransform(element);
  const handles = getHandleWorldPositions(bounds, t);
  const rotateLocal = getRotateHandleLocal(bounds);
  const topMid = localToWorld({ x: bounds.cx, y: bounds.cy - bounds.halfH }, t);
  const rotateWorld = localToWorld(rotateLocal, t);

  const invZoom = 1 / Math.max(0.15, zoom);
  const hs = HANDLE_SIZE * invZoom;
  // Screen-constant strokes via vector-effect (no /zoom compensation).
  const strokeW = 1.5;
  const outerW = 3;

  const boxCorners: { x: number; y: number }[] = [
    localToWorld({ x: bounds.cx - bounds.halfW, y: bounds.cy - bounds.halfH }, t),
    localToWorld({ x: bounds.cx + bounds.halfW, y: bounds.cy - bounds.halfH }, t),
    localToWorld({ x: bounds.cx + bounds.halfW, y: bounds.cy + bounds.halfH }, t),
    localToWorld({ x: bounds.cx - bounds.halfW, y: bounds.cy + bounds.halfH }, t),
  ];
  const boxPath =
    boxCorners.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ") + " Z";

  const scaleIds: Exclude<HandleId, "move" | "rotate" | "pivot">[] = [
    "nw",
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
  ];

  return (
    <g className="transform-controls" pointerEvents="none">
      {/* Outer white halo for contrast on dark/blue shapes */}
      <path
        d={boxPath}
        fill="none"
        stroke={SEL_OUTER}
        strokeWidth={outerW}
        vectorEffect="non-scaling-stroke"
        opacity={0.95}
      />
      <path
        d={boxPath}
        fill="none"
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={topMid.x}
        y1={topMid.y}
        x2={rotateWorld.x}
        y2={rotateWorld.y}
        stroke={SEL_OUTER}
        strokeWidth={outerW}
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
      <line
        x1={topMid.x}
        y1={topMid.y}
        x2={rotateWorld.x}
        y2={rotateWorld.y}
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={rotateWorld.x}
        cy={rotateWorld.y}
        r={hs * 0.65}
        fill={activeHandle === "rotate" ? SEL_ACTIVE : SEL_OUTER}
        stroke={SEL_STROKE}
        strokeWidth={strokeW}
        vectorEffect="non-scaling-stroke"
      />
      {scaleIds.map((id) => {
        const p = handles[id];
        return (
          <rect
            key={id}
            x={p.x - hs / 2}
            y={p.y - hs / 2}
            width={hs}
            height={hs}
            fill={activeHandle === id ? SEL_ACTIVE : SEL_OUTER}
            stroke={SEL_STROKE}
            strokeWidth={strokeW}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {/* Pivot / transform origin — distinct from scale handles */}
      <g className="pivot-marker">
        <circle
          cx={t.x}
          cy={t.y}
          r={hs * 0.55}
          fill={activeHandle === "pivot" ? SEL_ACTIVE : "#fbbf24"}
          stroke={SEL_STROKE}
          strokeWidth={strokeW}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={t.x - hs * 0.85}
          y1={t.y}
          x2={t.x + hs * 0.85}
          y2={t.y}
          stroke={SEL_STROKE}
          strokeWidth={1.35}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={t.x}
          y1={t.y - hs * 0.85}
          x2={t.x}
          y2={t.y + hs * 0.85}
          stroke={SEL_STROKE}
          strokeWidth={1.35}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>
  );
}
