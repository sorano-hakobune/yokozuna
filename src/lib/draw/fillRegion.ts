/**
 * Region fill helpers for the paint-bucket tool.
 * Detects closed contours (single path or multi-stroke) and produces
 * a filled shape that integrates with project data (undo / save / export).
 */
import type { Layer, Project, ShapeElement } from "@/types/project";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { samplePathPoints } from "@/lib/draw/pathBezier";
import { generateId } from "@/lib/id";
import { isPointInShape } from "@/components/Stage/stageGeometry";

export type Pt = { x: number; y: number };

/** Point-in-polygon (even-odd) on a simple ring. */
export function pointInPolygon(px: number, py: number, ring: Pt[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    const intersect =
      pi.y > py !== pj.y > py &&
      px < ((pj.x - pi.x) * (py - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Local-space contour of a shape in stage space (world vertices). */
export function shapeWorldContour(shape: ShapeElement): Pt[] | null {
  const pivX = shape.pivot?.x ?? 0;
  const pivY = shape.pivot?.y ?? 0;
  const sx = shape.scaleX || 1;
  const sy = shape.scaleY || 1;
  const rad = ((shape.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const toWorld = (lx: number, ly: number): Pt => {
    const dx = (lx - pivX) * sx;
    const dy = (ly - pivY) * sy;
    return {
      x: shape.x + dx * cos - dy * sin,
      y: shape.y + dx * sin + dy * cos,
    };
  };

  switch (shape.shapeType) {
    case "rectangle":
    case "text": {
      const hw = (shape.width ?? 100) / 2;
      const hh = (shape.height ?? 100) / 2;
      return [
        toWorld(-hw, -hh),
        toWorld(hw, -hh),
        toWorld(hw, hh),
        toWorld(-hw, hh),
      ];
    }
    case "circle": {
      const r = shape.radius ?? 50;
      const pts: Pt[] = [];
      const n = 48;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(toWorld(Math.cos(a) * r, Math.sin(a) * r));
      }
      return pts;
    }
    case "path":
    case "line": {
      const pts = shape.points ?? [];
      if (pts.length < 2) return null;
      const closed =
        shape.shapeType === "path" &&
        (!!shape.closePath ||
          (pts.length >= 3 &&
            Math.hypot(pts[0]!.x - pts[pts.length - 1]!.x, pts[0]!.y - pts[pts.length - 1]!.y) < 1.5));
      if (!closed && shape.shapeType === "line") return null;
      if (!closed && !shape.closePath) {
        // Treat near-closed freehand as closed
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        if (Math.hypot(first.x - last.x, first.y - last.y) > 8) return null;
      }
      const sampled = samplePathPoints(pts, true, 6);
      return sampled.map((p) => toWorld(p.x, p.y));
    }
    default:
      return null;
  }
}

/**
 * Find a closed shape whose interior contains the stage point, preferring
 * shapes that currently have no fill (so paint-bucket can fill them).
 */
export function findClosedShapeAtPoint(
  layers: Layer[],
  currentFrame: number,
  point: Pt,
): { layerId: string; shape: ShapeElement } | null {
  for (const layer of layers) {
    if (!layer.visible || layer.locked) continue;
    const elements = getElementsAtFrame(layer.keyframes, currentFrame);
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]!;
      if (el.type !== "shape") continue;
      const shape = el as ShapeElement;
      // Skip pure open lines without close
      if (shape.shapeType === "line" && !shape.closePath) continue;

      // Prefer geometry interior test (works even when fill is none)
      const contour = shapeWorldContour(shape);
      if (contour && contour.length >= 3 && pointInPolygon(point.x, point.y, contour)) {
        return { layerId: layer.id, shape };
      }
      // Fallback to existing hit test (stroke or filled)
      if (isPointInShape(point.x, point.y, shape)) {
        // Only accept as fill target if closed
        if (
          shape.shapeType === "rectangle" ||
          shape.shapeType === "circle" ||
          shape.shapeType === "text" ||
          (shape.shapeType === "path" && shape.closePath)
        ) {
          return { layerId: layer.id, shape };
        }
      }
    }
  }
  return null;
}

/**
 * Raster flood-fill over stroked outlines of the current frame.
 * Returns a closed polyline in stage space, or null if the region is open
 * (flood reaches canvas border) or too small.
 */
export function floodFillContour(
  layers: Layer[],
  _project: Project,
  currentFrame: number,
  click: Pt,
  opts?: { padding?: number; resolution?: number },
): Pt[] | null {
  const padding = opts?.padding ?? 40;
  const resolution = opts?.resolution ?? 1; // 1 stage unit = 1 px

  // Bounds from all shape strokes
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const strokeShapes: ShapeElement[] = [];
  for (const layer of layers) {
    if (!layer.visible) continue;
    for (const el of getElementsAtFrame(layer.keyframes, currentFrame)) {
      if (el.type !== "shape") continue;
      const s = el as ShapeElement;
      strokeShapes.push(s);
      const c = shapeWorldContour(s);
      if (c) {
        for (const p of c) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      } else if (s.points) {
        const pivX = s.pivot?.x ?? 0;
        const pivY = s.pivot?.y ?? 0;
        const sx = s.scaleX || 1;
        const sy = s.scaleY || 1;
        const rad = ((s.rotation ?? 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        for (const pt of s.points) {
          const dx = (pt.x - pivX) * sx;
          const dy = (pt.y - pivY) * sy;
          const wx = s.x + dx * cos - dy * sin;
          const wy = s.y + dx * sin + dy * cos;
          minX = Math.min(minX, wx);
          minY = Math.min(minY, wy);
          maxX = Math.max(maxX, wx);
          maxY = Math.max(maxY, wy);
        }
      }
    }
  }
  if (!Number.isFinite(minX)) return null;

  // Expand around click as well
  minX = Math.min(minX, click.x) - padding;
  minY = Math.min(minY, click.y) - padding;
  maxX = Math.max(maxX, click.x) + padding;
  maxY = Math.max(maxY, click.y) + padding;

  const w = Math.max(8, Math.ceil((maxX - minX) * resolution));
  const h = Math.max(8, Math.ceil((maxY - minY) * resolution));
  // Cap raster size for safety
  if (w * h > 4_000_000) return null;

  // Use OffscreenCanvas when available, else regular canvas
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : (() => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          return c;
        })();
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#000000";
  ctx.fillStyle = "#000000";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const toPx = (x: number, y: number) => ({
    x: (x - minX) * resolution,
    y: (y - minY) * resolution,
  });

  for (const shape of strokeShapes) {
    const sw = Math.max(1.5, (shape.strokeWidth ?? 2) * resolution);
    ctx.lineWidth = sw;
    const contour = shapeWorldContour(shape);
    if (contour && contour.length >= 2) {
      ctx.beginPath();
      const p0 = toPx(contour[0]!.x, contour[0]!.y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < contour.length; i++) {
        const p = toPx(contour[i]!.x, contour[i]!.y);
        ctx.lineTo(p.x, p.y);
      }
      if (
        shape.closePath ||
        shape.shapeType === "rectangle" ||
        shape.shapeType === "circle" ||
        shape.shapeType === "text"
      ) {
        ctx.closePath();
      }
      ctx.stroke();
      continue;
    }
    // Open path / line points
    if (shape.points && shape.points.length >= 2) {
      const pivX = shape.pivot?.x ?? 0;
      const pivY = shape.pivot?.y ?? 0;
      const sx = shape.scaleX || 1;
      const sy = shape.scaleY || 1;
      const rad = ((shape.rotation ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const worldPts = shape.points.map((pt) => {
        const dx = (pt.x - pivX) * sx;
        const dy = (pt.y - pivY) * sy;
        return {
          x: shape.x + dx * cos - dy * sin,
          y: shape.y + dx * sin + dy * cos,
        };
      });
      ctx.beginPath();
      const a = toPx(worldPts[0]!.x, worldPts[0]!.y);
      ctx.moveTo(a.x, a.y);
      for (let i = 1; i < worldPts.length; i++) {
        const b = toPx(worldPts[i]!.x, worldPts[i]!.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }
  }

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const cx = Math.round((click.x - minX) * resolution);
  const cy = Math.round((click.y - minY) * resolution);
  if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;

  const idx = (x: number, y: number) => (y * w + x) * 4;
  // Seed must be white (empty)
  const seed = idx(cx, cy);
  if (data[seed]! < 200) {
    // Clicked on a stroke — not a fillable interior
    return null;
  }

  // Flood fill; if we touch border → open region
  const visited = new Uint8Array(w * h);
  const stack: number[] = [cx, cy];
  let touchedBorder = false;
  let count = 0;
  const maxFill = Math.floor(w * h * 0.85);

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) {
      touchedBorder = true;
      break;
    }
    const vi = y * w + x;
    if (visited[vi]) continue;
    const i = vi * 4;
    if (data[i]! < 200) continue; // barrier
    visited[vi] = 1;
    count++;
    if (count > maxFill) {
      touchedBorder = true;
      break;
    }
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
      touchedBorder = true;
      break;
    }
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  if (touchedBorder || count < 8) return null;

  // Mark filled pixels red for contour trace
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (visited[y * w + x]) {
        const i = (y * w + x) * 4;
        data[i] = 255;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
  }

  // Marching-squares style boundary: collect edge pixels and order them
  const edge: Pt[] = [];
  const isFill = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && visited[y * w + x] === 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isFill(x, y)) continue;
      if (
        !isFill(x - 1, y) ||
        !isFill(x + 1, y) ||
        !isFill(x, y - 1) ||
        !isFill(x, y + 1)
      ) {
        edge.push({
          x: minX + (x + 0.5) / resolution,
          y: minY + (y + 0.5) / resolution,
        });
      }
    }
  }
  if (edge.length < 3) return null;

  // Order edge points by nearest-neighbor (cheap contour)
  const ordered: Pt[] = [];
  const used = new Uint8Array(edge.length);
  ordered.push(edge[0]!);
  used[0] = 1;
  for (let n = 1; n < edge.length; n++) {
    const last = ordered[ordered.length - 1]!;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < edge.length; i++) {
      if (used[i]) continue;
      const d =
        (edge[i]!.x - last.x) * (edge[i]!.x - last.x) +
        (edge[i]!.y - last.y) * (edge[i]!.y - last.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) break;
    used[best] = 1;
    // Skip if jump is huge (noise)
    if (bestD > 40 * 40) continue;
    ordered.push(edge[best]!);
  }

  // Simplify
  const simplified = simplifyPolyline(ordered, 1.5);
  if (simplified.length < 3) return null;
  return simplified;
}

function simplifyPolyline(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice();
  // RDP
  const rdp = (pts: Pt[], eps: number): Pt[] => {
    if (pts.length < 3) return pts.slice();
    let maxD = 0;
    let idx = 0;
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i]!, a, b);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > eps) {
      const left = rdp(pts.slice(0, idx + 1), eps);
      const right = rdp(pts.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  };
  return rdp(points, epsilon);
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const x = a.x + t * dx;
  const y = a.y + t * dy;
  return Math.hypot(p.x - x, p.y - y);
}

/** Build a filled path shape from a world-space closed contour. */
export function contourToFillShape(
  contour: Pt[],
  fill: string,
): ShapeElement {
  let cx = 0,
    cy = 0;
  for (const p of contour) {
    cx += p.x;
    cy += p.y;
  }
  cx /= contour.length;
  cy /= contour.length;
  return {
    id: generateId("shape"),
    type: "shape",
    shapeType: "path",
    x: cx,
    y: cy,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    fill,
    stroke: "none",
    strokeWidth: 0,
    closePath: true,
    points: contour.map((p) => ({ x: p.x - cx, y: p.y - cy })),
  };
}
