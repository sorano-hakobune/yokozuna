import type { MotionPath, PathPoint } from "@/types/project";
import { cubicAt, segmentControls } from "@/lib/draw/pathBezier";

export type Pt = { x: number; y: number };

/** Build a default curved path from start → end (one cubic segment). */
export function createDefaultMotionPath(
  from: Pt,
  to: Pt,
  orientToPath = false,
): MotionPath {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Perpendicular offset for a visible arc
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bulge = Math.min(80, len * 0.35);
  return {
    points: [
      {
        x: from.x,
        y: from.y,
        handleOut: {
          x: dx / 3 + nx * bulge,
          y: dy / 3 + ny * bulge,
        },
        smooth: true,
      },
      {
        x: to.x,
        y: to.y,
        handleIn: {
          x: -dx / 3 + nx * bulge,
          y: -dy / 3 + ny * bulge,
        },
        smooth: true,
      },
    ],
    orientToPath,
  };
}

/** Total approximate length + cumulative lengths per segment sample. */
function buildArcTable(
  points: PathPoint[],
  samplesPerSeg = 12,
): { total: number; samples: { t: number; x: number; y: number; dist: number }[] } {
  const n = points.length;
  if (n < 2) {
    const p = points[0] ?? { x: 0, y: 0 };
    return { total: 0, samples: [{ t: 0, x: p.x, y: p.y, dist: 0 }] };
  }
  const samples: { t: number; x: number; y: number; dist: number }[] = [];
  let dist = 0;
  const segCount = n - 1;
  let prev: Pt | null = null;
  for (let i = 0; i < segCount; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const { c1, c2, curved } = segmentControls(a, b);
    for (let s = 0; s <= samplesPerSeg; s++) {
      if (i > 0 && s === 0) continue;
      const localT = s / samplesPerSeg;
      const globalT = (i + localT) / segCount;
      let pt: Pt;
      if (!curved) {
        pt = {
          x: a.x + (b.x - a.x) * localT,
          y: a.y + (b.y - a.y) * localT,
        };
      } else {
        pt = cubicAt(a, c1, c2, b, localT);
      }
      if (prev) dist += Math.hypot(pt.x - prev.x, pt.y - prev.y);
      samples.push({ t: globalT, x: pt.x, y: pt.y, dist });
      prev = pt;
    }
  }
  return { total: dist, samples };
}

/**
 * Position along path at parameter u ∈ [0,1] (arc-length parameterized).
 */
export function pointOnMotionPath(path: MotionPath, u: number): Pt {
  const points = path.points;
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0]!.x, y: points[0]!.y };
  const uu = Math.max(0, Math.min(1, u));
  const { total, samples } = buildArcTable(points);
  if (total < 1e-6 || samples.length < 2) {
    const a = points[0]!;
    const b = points[points.length - 1]!;
    return { x: a.x + (b.x - a.x) * uu, y: a.y + (b.y - a.y) * uu };
  }
  const target = uu * total;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (b.dist >= target) {
      const span = b.dist - a.dist || 1;
      const local = (target - a.dist) / span;
      return {
        x: a.x + (b.x - a.x) * local,
        y: a.y + (b.y - a.y) * local,
      };
    }
  }
  const last = samples[samples.length - 1]!;
  return { x: last.x, y: last.y };
}

/** Tangent angle in degrees at u. */
export function tangentAngleOnMotionPath(path: MotionPath, u: number): number {
  const eps = 0.002;
  const a = pointOnMotionPath(path, Math.max(0, u - eps));
  const b = pointOnMotionPath(path, Math.min(1, u + eps));
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/** Sample path for SVG preview polyline. */
export function sampleMotionPathPoints(
  path: MotionPath,
  count = 48,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(pointOnMotionPath(path, i / count));
  }
  return out;
}

/** Convert a shape path (local points + element transform) to stage-space motion path. */
export function motionPathFromShapePoints(
  localPoints: PathPoint[],
  origin: Pt,
  rotationDeg = 0,
  scaleX = 1,
  scaleY = 1,
  pivot?: Pt,
): MotionPath {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const px = pivot?.x ?? 0;
  const py = pivot?.y ?? 0;
  const map = (p: PathPoint): PathPoint => {
    const lx = (p.x - px) * scaleX;
    const ly = (p.y - py) * scaleY;
    const wx = origin.x + lx * cos - ly * sin;
    const wy = origin.y + lx * sin + ly * cos;
    const out: PathPoint = { x: wx, y: wy, smooth: p.smooth };
    if (p.handleIn) {
      const hx = p.handleIn.x * scaleX;
      const hy = p.handleIn.y * scaleY;
      out.handleIn = {
        x: hx * cos - hy * sin,
        y: hx * sin + hy * cos,
      };
    }
    if (p.handleOut) {
      const hx = p.handleOut.x * scaleX;
      const hy = p.handleOut.y * scaleY;
      out.handleOut = {
        x: hx * cos - hy * sin,
        y: hx * sin + hy * cos,
      };
    }
    return out;
  };
  return {
    points: localPoints.map(map),
    orientToPath: false,
  };
}
