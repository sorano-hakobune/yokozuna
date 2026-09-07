import type { MotionPath, PathPoint } from "@/types/project";
import { sampleMotionPathPoints } from "@/lib/animation/motionPath";

type Props = {
  path: MotionPath;
  zoom: number;
  selectedPointIndex?: number | null;
  onMovePoint?: (index: number, x: number, y: number) => void;
  onMoveHandle?: (
    index: number,
    which: "in" | "out",
    x: number,
    y: number,
  ) => void;
};

/**
 * Visual + editable overlay for a keyframe motion path.
 */
export function MotionPathOverlay({
  path,
  zoom,
  selectedPointIndex,
  onMovePoint,
  onMoveHandle,
}: Props) {
  const inv = 1 / Math.max(0.15, zoom);
  const strokeW = 1.5 * inv;
  const samples = sampleMotionPathPoints(path, 56);
  const pts = path.points;

  return (
    <g className="motion-path-overlay" pointerEvents="none">
      {samples.length >= 2 && (
        <polyline
          points={samples.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#e05a3c"
          strokeWidth={strokeW}
          strokeDasharray={`${6 * inv} ${4 * inv}`}
          opacity={0.9}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {/* handles */}
      {pts.map((pt, i) => {
        const show = selectedPointIndex == null || selectedPointIndex === i;
        if (!show) return null;
        return (
          <g key={`mh-${i}`}>
            {pt.handleOut && (
              <>
                <line
                  x1={pt.x}
                  y1={pt.y}
                  x2={pt.x + pt.handleOut.x}
                  y2={pt.y + pt.handleOut.y}
                  stroke="#fca5a5"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={pt.x + pt.handleOut.x}
                  cy={pt.y + pt.handleOut.y}
                  r={3.5 * inv}
                  fill="#fca5a5"
                  stroke="#0b0f12"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: onMoveHandle ? "auto" : "none", cursor: "move" }}
                  onPointerDown={(e) => {
                    if (!onMoveHandle) return;
                    e.stopPropagation();
                    // parent Stage handles via data attributes — use custom events
                    (e.target as SVGElement).setPointerCapture?.(e.pointerId);
                    const start = { x: e.clientX, y: e.clientY };
                    const origin = {
                      x: pt.x + pt.handleOut!.x,
                      y: pt.y + pt.handleOut!.y,
                    };
                    const move = (ev: PointerEvent) => {
                      // approximate: rely on Stage for accurate coords — here use delta in screen / zoom
                      const dx = (ev.clientX - start.x) / zoom;
                      const dy = (ev.clientY - start.y) / zoom;
                      onMoveHandle(i, "out", origin.x + dx, origin.y + dy);
                    };
                    const up = () => {
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", up);
                    };
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                  }}
                />
              </>
            )}
            {pt.handleIn && (
              <>
                <line
                  x1={pt.x}
                  y1={pt.y}
                  x2={pt.x + pt.handleIn.x}
                  y2={pt.y + pt.handleIn.y}
                  stroke="#fca5a5"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={pt.x + pt.handleIn.x}
                  cy={pt.y + pt.handleIn.y}
                  r={3.5 * inv}
                  fill="#fca5a5"
                  stroke="#0b0f12"
                  strokeWidth={strokeW}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            <circle
              cx={pt.x}
              cy={pt.y}
              r={4.5 * inv}
              fill={selectedPointIndex === i ? "#e05a3c" : "#fff"}
              stroke="#e05a3c"
              strokeWidth={strokeW}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: onMovePoint ? "auto" : "none", cursor: "move" }}
              onPointerDown={(e) => {
                if (!onMovePoint) return;
                e.stopPropagation();
                const start = { x: e.clientX, y: e.clientY };
                const origin = { x: pt.x, y: pt.y };
                const move = (ev: PointerEvent) => {
                  const dx = (ev.clientX - start.x) / zoom;
                  const dy = (ev.clientY - start.y) / zoom;
                  onMovePoint(i, origin.x + dx, origin.y + dy);
                };
                const up = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", up);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", up);
              }}
            />
          </g>
        );
      })}
    </g>
  );
}

/** Apply absolute stage position to a path point (keeps handles relative). */
export function moveMotionPathPoint(
  points: PathPoint[],
  index: number,
  x: number,
  y: number,
): PathPoint[] {
  return points.map((p, i) =>
    i === index
      ? {
          ...p,
          x,
          y,
          handleIn: p.handleIn ? { ...p.handleIn } : undefined,
          handleOut: p.handleOut ? { ...p.handleOut } : undefined,
        }
      : { ...p },
  );
}

export function moveMotionPathHandle(
  points: PathPoint[],
  index: number,
  which: "in" | "out",
  absX: number,
  absY: number,
): PathPoint[] {
  return points.map((p, i) => {
    if (i !== index) return { ...p };
    const rel = { x: absX - p.x, y: absY - p.y };
    if (which === "out") {
      return { ...p, handleOut: rel };
    }
    return { ...p, handleIn: rel };
  });
}
