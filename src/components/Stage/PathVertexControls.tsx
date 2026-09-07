import type { ShapeElement } from "@/types/project";
import {
  pathEdgeMidpointsWorld,
  pathHandlesWorld,
  pathVerticesWorld,
} from "@/lib/selection/pathEdit";
import { segmentControls } from "@/lib/draw/pathBezier";
import {
  elementWorldTransform,
  localToWorld,
} from "@/components/Stage/transformGeometry";

type Props = {
  shape: ShapeElement;
  zoom: number;
  selectedIndex?: number | null;
  activeIndex?: number | null;
};

export function PathVertexControls({
  shape,
  zoom,
  selectedIndex,
  activeIndex,
}: Props) {
  const invZoom = 1 / Math.max(0.15, zoom);
  const r = 4.5 * invZoom;
  const midR = 3.2 * invZoom;
  const handleR = 3.6 * invZoom;
  const strokeW = 1.35 * invZoom;
  const verts = pathVerticesWorld(shape);
  const mids = pathEdgeMidpointsWorld(shape);
  const tf = elementWorldTransform(shape);
  const pts = shape.points ?? [];

  const curvePreview: string[] = [];
  if (pts.length >= 2) {
    const n = pts.length;
    const segCount = shape.closePath && n >= 3 ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const { c1, c2, curved } = segmentControls(a, b);
      const steps = curved ? 10 : 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        let lx: number;
        let ly: number;
        if (!curved) {
          lx = a.x + (b.x - a.x) * t;
          ly = a.y + (b.y - a.y) * t;
        } else {
          const u = 1 - t;
          lx =
            u * u * u * a.x +
            3 * u * u * t * c1.x +
            3 * u * t * t * c2.x +
            t * t * t * b.x;
          ly =
            u * u * u * a.y +
            3 * u * u * t * c1.y +
            3 * u * t * t * c2.y +
            t * t * t * b.y;
        }
        const w = localToWorld({ x: lx, y: ly }, tf);
        curvePreview.push(`${w.x},${w.y}`);
      }
    }
  }

  const focusIndex =
    activeIndex != null
      ? activeIndex
      : selectedIndex != null
        ? selectedIndex
        : null;

  return (
    <g className="path-vertex-controls" pointerEvents="none">
      {curvePreview.length >= 2 && (
        <>
          <polyline
            points={curvePreview.join(" ")}
            fill="none"
            stroke="#ffffff"
            strokeWidth={strokeW * 2}
            strokeOpacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={curvePreview.join(" ")}
            fill="none"
            stroke="#0b0f12"
            strokeWidth={strokeW}
            strokeOpacity={0.85}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {mids.map((p, i) => (
        <circle
          key={`m-${i}`}
          cx={p.x}
          cy={p.y}
          r={midR}
          fill="#0b0f12"
          stroke="#ffffff"
          strokeWidth={strokeW}
          strokeDasharray={`${2 * invZoom} ${2 * invZoom}`}
          vectorEffect="non-scaling-stroke"
          opacity={0.9}
        />
      ))}
      {pts.map((pt, i) => {
        const show = focusIndex === i || !!pt.handleIn || !!pt.handleOut;
        if (!show) return null;
        const h = pathHandlesWorld(shape, i);
        const v = verts[i];
        if (!v) return null;
        return (
          <g key={`h-${i}`}>
            {h.in && (
              <>
                <line
                  x1={v.x}
                  y1={v.y}
                  x2={h.in.x}
                  y2={h.in.y}
                  stroke="#93c5fd"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                  opacity={0.9}
                />
                <circle
                  cx={h.in.x}
                  cy={h.in.y}
                  r={handleR}
                  fill="#93c5fd"
                  stroke="#0b0f12"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            {h.out && (
              <>
                <line
                  x1={v.x}
                  y1={v.y}
                  x2={h.out.x}
                  y2={h.out.y}
                  stroke="#93c5fd"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                  opacity={0.9}
                />
                <circle
                  cx={h.out.x}
                  cy={h.out.y}
                  r={handleR}
                  fill="#93c5fd"
                  stroke="#0b0f12"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
          </g>
        );
      })}
      {verts.map((p, i) => {
        const active = activeIndex === i || selectedIndex === i;
        return (
          <circle
            key={`v-${i}`}
            cx={p.x}
            cy={p.y}
            r={r}
            fill={active ? "#e05a3c" : "#ffffff"}
            stroke="#0b0f12"
            strokeWidth={strokeW}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
