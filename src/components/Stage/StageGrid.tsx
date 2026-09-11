import type { GuideLine } from "@/types/project";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";

type GridProps = {
  width: number;
  height: number;
  gridSize: number;
  visible: boolean;
  zoom: number;
};

/**
 * SVG grid overlay on the stage (non-interactive).
 */
export function StageGrid({
  width,
  height,
  gridSize,
  visible,
  zoom,
}: GridProps) {
  if (!visible || gridSize <= 0) return null;
  // Constant screen width via vector-effect (no manual 1/zoom: that would
  // double-compensate and thin the grid on zoom-in).
  void zoom;
  const stroke = 1;
  const majorEvery = 5;
  const lines: ReactNode[] = [];
  let i = 0;
  for (let x = gridSize; x < width; x += gridSize) {
    i += 1;
    const major = i % majorEvery === 0;
    lines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={major ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.08)"}
        strokeWidth={stroke}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  i = 0;
  for (let y = gridSize; y < height; y += gridSize) {
    i += 1;
    const major = i % majorEvery === 0;
    lines.push(
      <line
        key={`h-${y}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke={major ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.08)"}
        strokeWidth={stroke}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  return (
    <g className="stage-grid" pointerEvents="none">
      {lines}
    </g>
  );
}

type GuidesProps = {
  guides: GuideLine[];
  visible: boolean;
  width: number;
  height: number;
  zoom: number;
  activeId?: string | null;
  onPointerDownGuide?: (
    guideId: string,
    e: ReactPointerEvent<SVGLineElement>,
  ) => void;
};

export function StageGuides({
  guides,
  visible,
  width,
  height,
  zoom,
  activeId,
  onPointerDownGuide,
}: GuidesProps) {
  if (!visible || !guides.length) return null;
  // Visible line: constant screen width via vector-effect (no 1/zoom).
  // `hit` stays zoom-compensated: it has no vector-effect, so a single
  // user-unit compensation is correct for a constant hit area.
  const stroke = 1.25;
  const hit = 8 / Math.max(zoom, 0.0001);
  return (
    <g className="stage-guides">
      {guides.map((g) => {
        const isActive = activeId === g.id;
        const color = isActive ? "#e05a3c" : "#3b82f6";
        if (g.orientation === "vertical") {
          return (
            <g key={g.id}>
              <line
                x1={g.position}
                y1={-40}
                x2={g.position}
                y2={height + 40}
                stroke="transparent"
                strokeWidth={hit}
                style={{ cursor: "ew-resize" }}
                onPointerDown={(e) => onPointerDownGuide?.(g.id, e)}
              />
              <line
                x1={g.position}
                y1={-40}
                x2={g.position}
                y2={height + 40}
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            </g>
          );
        }
        return (
          <g key={g.id}>
            <line
              x1={-40}
              y1={g.position}
              x2={width + 40}
              y2={g.position}
              stroke="transparent"
              strokeWidth={hit}
              style={{ cursor: "ns-resize" }}
              onPointerDown={(e) => onPointerDownGuide?.(g.id, e)}
            />
            <line
              x1={-40}
              y1={g.position}
              x2={width + 40}
              y2={g.position}
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </g>
  );
}
