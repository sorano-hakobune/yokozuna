import type { PathPoint, ShapeElement } from "@/types/project";
import {
  elementWorldTransform,
  localToWorld,
  worldToLocal,
  type Point,
} from "@/components/Stage/transformGeometry";
import {
  ensureHandles,
  movePathVertex,
  samplePathPoints,
  segmentControls,
  setHandleAbsolute,
} from "@/lib/draw/pathBezier";

export type PathHit =
  | { kind: "vertex"; index: number }
  | { kind: "edge"; index: number; t: number }
  | { kind: "handleIn"; index: number }
  | { kind: "handleOut"; index: number };

const VERTEX_HIT_PX = 12;
const EDGE_HIT_PX = 10;
const HANDLE_HIT_PX = 10;

export function isEditablePathShape(
  el: { type: string; shapeType?: string } | null | undefined,
): el is ShapeElement {
  return (
    !!el &&
    el.type === "shape" &&
    (el.shapeType === "path" || el.shapeType === "line")
  );
}

export function getPathPoints(shape: ShapeElement): PathPoint[] {
  return (shape.points ?? []).map((p) => ({
    ...p,
    handleIn: p.handleIn ? { ...p.handleIn } : undefined,
    handleOut: p.handleOut ? { ...p.handleOut } : undefined,
  }));
}

export function pathVerticesWorld(shape: ShapeElement): Point[] {
  const t = elementWorldTransform(shape);
  return getPathPoints(shape).map((p) => localToWorld({ x: p.x, y: p.y }, t));
}

export function pathHandlesWorld(
  shape: ShapeElement,
  index: number,
): { in?: Point; out?: Point } {
  const pts = getPathPoints(shape);
  const v = pts[index];
  if (!v) return {};
  const tf = elementWorldTransform(shape);
  const result: { in?: Point; out?: Point } = {};
  if (v.handleIn) {
    result.in = localToWorld(
      { x: v.x + v.handleIn.x, y: v.y + v.handleIn.y },
      tf,
    );
  }
  if (v.handleOut) {
    result.out = localToWorld(
      { x: v.x + v.handleOut.x, y: v.y + v.handleOut.y },
      tf,
    );
  }
  return result;
}

export function pathEdgeMidpointsWorld(shape: ShapeElement): Point[] {
  const pts = getPathPoints(shape);
  const n = pts.length;
  if (n < 2) return [];
  const tf = elementWorldTransform(shape);
  const mids: Point[] = [];
  const segCount = shape.closePath && n >= 3 ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const { c1, c2, curved } = segmentControls(a, b);
    let mid: Point;
    if (!curved) {
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    } else {
      const t = 0.5;
      const u = 1 - t;
      mid = {
        x:
          u * u * u * a.x +
          3 * u * u * t * c1.x +
          3 * u * t * t * c2.x +
          t * t * t * b.x,
        y:
          u * u * u * a.y +
          3 * u * u * t * c1.y +
          3 * u * t * t * c2.y +
          t * t * t * b.y,
      };
    }
    mids.push(localToWorld(mid, tf));
  }
  return mids;
}

function distPointToSegment(
  p: Point,
  a: Point,
  b: Point,
): { dist: number; t: number; closest: Point } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-8) {
    return {
      dist: Math.hypot(p.x - a.x, p.y - a.y),
      t: 0,
      closest: { ...a },
    };
  }
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + abx * t, y: a.y + aby * t };
  return {
    dist: Math.hypot(p.x - closest.x, p.y - closest.y),
    t,
    closest,
  };
}

export function hitTestPathEdit(
  worldPoint: Point,
  shape: ShapeElement,
  zoom: number,
  selectedVertexIndex?: number | null,
): PathHit | null {
  const hitV = VERTEX_HIT_PX / Math.max(0.15, zoom);
  const hitE = EDGE_HIT_PX / Math.max(0.15, zoom);
  const hitH = HANDLE_HIT_PX / Math.max(0.15, zoom);
  const verts = pathVerticesWorld(shape);
  const pts = getPathPoints(shape);

  const handleIndices =
    selectedVertexIndex != null && selectedVertexIndex >= 0
      ? [selectedVertexIndex]
      : pts
          .map((_, i) => i)
          .filter((i) => pts[i]?.handleIn || pts[i]?.handleOut);

  for (const i of handleIndices) {
    const h = pathHandlesWorld(shape, i);
    if (h.out) {
      const d = Math.hypot(worldPoint.x - h.out.x, worldPoint.y - h.out.y);
      if (d <= hitH) return { kind: "handleOut", index: i };
    }
    if (h.in) {
      const d = Math.hypot(worldPoint.x - h.in.x, worldPoint.y - h.in.y);
      if (d <= hitH) return { kind: "handleIn", index: i };
    }
  }

  for (let i = 0; i < verts.length; i++) {
    const v = verts[i]!;
    if (Math.hypot(worldPoint.x - v.x, worldPoint.y - v.y) <= hitV) {
      return { kind: "vertex", index: i };
    }
  }

  const localSample = samplePathPoints(pts, !!shape.closePath, 6);
  const tf = elementWorldTransform(shape);
  const worldSample = localSample.map((p) => localToWorld(p, tf));
  let best: { index: number; t: number; dist: number } | null = null;
  const n = pts.length;
  const segCount = shape.closePath && n >= 3 ? n : n - 1;
  const samplesPerSeg = 6;
  for (let i = 0; i < worldSample.length - 1; i++) {
    const { dist, t } = distPointToSegment(
      worldPoint,
      worldSample[i]!,
      worldSample[i + 1]!,
    );
    if (dist <= hitE) {
      const segIndex = Math.min(segCount - 1, Math.floor(i / samplesPerSeg));
      const localT = (i % samplesPerSeg) / samplesPerSeg + t / samplesPerSeg;
      if (localT > 0.06 && localT < 0.94) {
        if (!best || dist < best.dist) {
          best = { index: segIndex, t: localT, dist };
        }
      }
    }
  }
  if (best) {
    return { kind: "edge", index: best.index, t: best.t };
  }
  return null;
}

export function moveVertexToWorld(
  shape: ShapeElement,
  index: number,
  worldPoint: Point,
): PathPoint[] {
  const t = elementWorldTransform(shape);
  const local = worldToLocal(worldPoint, t);
  return movePathVertex(getPathPoints(shape), index, local);
}

export function moveHandleToWorld(
  shape: ShapeElement,
  index: number,
  which: "in" | "out",
  worldPoint: Point,
  breakSmooth: boolean,
): PathPoint[] {
  const t = elementWorldTransform(shape);
  const local = worldToLocal(worldPoint, t);
  let pts = getPathPoints(shape);
  pts = ensureHandles(pts, index, !!shape.closePath);
  return setHandleAbsolute(pts, index, which, local, { breakSmooth });
}

export function insertVertexOnEdge(
  shape: ShapeElement,
  edgeIndex: number,
  t: number,
): PathPoint[] {
  const points = getPathPoints(shape);
  const n = points.length;
  if (n < 2) return points;

  let a: PathPoint;
  let b: PathPoint;
  let insertAt: number;

  if (shape.closePath && edgeIndex === n - 1) {
    a = points[n - 1]!;
    b = points[0]!;
    insertAt = n;
  } else {
    if (edgeIndex < 0 || edgeIndex >= n - 1) return points;
    a = points[edgeIndex]!;
    b = points[edgeIndex + 1]!;
    insertAt = edgeIndex + 1;
  }

  const u = Math.max(0, Math.min(1, t));
  const { c1, c2, curved } = segmentControls(a, b);
  let mid: PathPoint;
  if (!curved) {
    mid = {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
    };
  } else {
    const p0 = a;
    const p1 = c1;
    const p2 = c2;
    const p3 = b;
    const lerp = (x: Point, y: Point, tt: number) => ({
      x: x.x + (y.x - x.x) * tt,
      y: x.y + (y.y - x.y) * tt,
    });
    const q0 = lerp(p0, p1, u);
    const q1 = lerp(p1, p2, u);
    const q2 = lerp(p2, p3, u);
    const r0 = lerp(q0, q1, u);
    const r1 = lerp(q1, q2, u);
    const s = lerp(r0, r1, u);
    mid = {
      x: s.x,
      y: s.y,
      handleIn: { x: r0.x - s.x, y: r0.y - s.y },
      handleOut: { x: r1.x - s.x, y: r1.y - s.y },
      smooth: true,
    };
    const aIdx = edgeIndex >= n ? n - 1 : edgeIndex;
    points[aIdx] = {
      ...a,
      handleOut: { x: q0.x - a.x, y: q0.y - a.y },
    };
    const bIndex = shape.closePath && edgeIndex === n - 1 ? 0 : edgeIndex + 1;
    points[bIndex] = {
      ...b,
      handleIn: { x: q2.x - b.x, y: q2.y - b.y },
    };
  }

  points.splice(insertAt, 0, mid);
  return points;
}

export function removeVertex(
  shape: ShapeElement,
  index: number,
): PathPoint[] | null {
  const points = getPathPoints(shape);
  if (points.length <= 2) return null;
  if (index < 0 || index >= points.length) return null;
  points.splice(index, 1);
  return points;
}
