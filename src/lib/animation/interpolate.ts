import type {
  Element,
  Keyframe,
  TweenType,
  ShapeElement,
  MotionPath,
} from "@/types/project";
import { samplePathPoints } from "@/lib/draw/pathBezier";
import { lerpFilters } from "@/lib/filters";
import { lerpGradient } from "@/lib/draw/gradient";
import { applyEasing } from "./easing";
import {
  pointOnMotionPath,
  tangentAngleOnMotionPath,
} from "./motionPath";

export { applyEasing } from "./easing";
export {
  EASING_TYPES,
  EASING_GROUPS,
  EASING_MENU_SHORT,
  easingLabel,
} from "./easing";
export {
  createDefaultMotionPath,
  pointOnMotionPath,
  sampleMotionPathPoints,
  motionPathFromShapePoints,
} from "./motionPath";

export const lerp = (start: number, end: number, t: number): number =>
  start + (end - start) * t;

// ---------------------------------------------------------------------------
// Color helpers (hex / rgb / rgba → interpolated css color string)
// ---------------------------------------------------------------------------

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(input?: string): Rgba | null {
  if (!input || input === "none" || input === "transparent") return null;
  const s = input.trim();

  // #rgb / #rrggbb / #rrggbbaa
  if (s[0] === "#") {
    let h = s.slice(1);
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b].some((n) => Number.isNaN(n))) return null;
      return { r, g, b, a: Number.isNaN(a) ? 1 : a };
    }
    return null;
  }

  // rgb() / rgba()
  const m = s.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i,
  );
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] != null ? Number(m[4]) : 1,
    };
  }

  return null;
}

function formatRgba(c: Rgba): string {
  const r = Math.round(Math.max(0, Math.min(255, c.r)));
  const g = Math.round(Math.max(0, Math.min(255, c.g)));
  const b = Math.round(Math.max(0, Math.min(255, c.b)));
  const a = Math.max(0, Math.min(1, c.a));
  if (a >= 0.999) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

function lerpColor(
  a: string | undefined,
  b: string | undefined,
  t: number,
): string | undefined {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca && !cb) return a ?? b;
  if (!ca) return b;
  if (!cb) return a;
  return formatRgba({
    r: lerp(ca.r, cb.r, t),
    g: lerp(ca.g, cb.g, t),
    b: lerp(ca.b, cb.b, t),
    a: lerp(ca.a, cb.a, t),
  });
}

// ---------------------------------------------------------------------------
// Path sampling / resampling for shape morph
// ---------------------------------------------------------------------------

type Pt = { x: number; y: number };

const DEFAULT_SAMPLE_COUNT = 48;

function dist(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/** Evenly resample an open or closed polyline to exactly `count` points. */
export function resamplePolyline(
  points: Pt[],
  count: number,
  closed = false,
): Pt[] {
  if (count < 2) count = 2;
  if (!points.length) {
    return Array.from({ length: count }, () => ({ x: 0, y: 0 }));
  }
  if (points.length === 1) {
    return Array.from({ length: count }, () => ({ ...points[0]! }));
  }

  // Build segment list (optionally closing)
  const pts = points.slice();
  if (closed) {
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    if (dist(first, last) > 1e-6) pts.push({ ...first });
  }

  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = dist(pts[i]!, pts[i + 1]!);
    segLens.push(len);
    total += len;
  }

  if (total < 1e-8) {
    return Array.from({ length: count }, () => ({ ...pts[0]! }));
  }

  // For closed shapes we sample count unique vertices (not repeating the close)
  const sampleCount = closed ? count : count;
  const result: Pt[] = [];

  for (let i = 0; i < sampleCount; i++) {
    // For closed: distribute around the loop without duplicating start at end
    const u = closed
      ? (i / sampleCount) * total
      : (i / (sampleCount - 1)) * total;

    let acc = 0;
    let found = false;
    for (let s = 0; s < segLens.length; s++) {
      const seg = segLens[s]!;
      if (acc + seg >= u - 1e-9 || s === segLens.length - 1) {
        const local = seg < 1e-9 ? 0 : (u - acc) / seg;
        const t = Math.max(0, Math.min(1, local));
        const a = pts[s]!;
        const b = pts[s + 1]!;
        result.push({
          x: lerp(a.x, b.x, t),
          y: lerp(a.y, b.y, t),
        });
        found = true;
        break;
      }
      acc += seg;
    }
    if (!found) {
      result.push({ ...pts[pts.length - 1]! });
    }
  }

  return result;
}

/**
 * Convert any ShapeElement into a local-space polyline suitable for morphing.
 * Primitives (rect / circle / text bounds) are sampled; path / line use existing points.
 */
export function shapeToContour(
  shape: ShapeElement,
  sampleCount = DEFAULT_SAMPLE_COUNT,
): { points: Pt[]; closed: boolean } {
  switch (shape.shapeType) {
    case "rectangle": {
      const w = shape.width ?? 100;
      const h = shape.height ?? 100;
      const hw = w / 2;
      const hh = h / 2;
      const rr = Math.max(
        0,
        Math.min(shape.cornerRadius ?? 0, Math.min(w, h) / 2),
      );
      let corners: Pt[];
      if (rr <= 0.5) {
        corners = [
          { x: -hw, y: -hh },
          { x: hw, y: -hh },
          { x: hw, y: hh },
          { x: -hw, y: hh },
        ];
      } else {
        // Approximate rounded rect with arc samples per corner
        const arcN = Math.max(3, Math.floor(sampleCount / 8));
        corners = [];
        const arcs: Array<{ cx: number; cy: number; a0: number; a1: number }> =
          [
            { cx: hw - rr, cy: -hh + rr, a0: -Math.PI / 2, a1: 0 },
            { cx: hw - rr, cy: hh - rr, a0: 0, a1: Math.PI / 2 },
            { cx: -hw + rr, cy: hh - rr, a0: Math.PI / 2, a1: Math.PI },
            { cx: -hw + rr, cy: -hh + rr, a0: Math.PI, a1: (3 * Math.PI) / 2 },
          ];
        for (const arc of arcs) {
          for (let i = 0; i <= arcN; i++) {
            const a = lerp(arc.a0, arc.a1, i / arcN);
            corners.push({
              x: arc.cx + Math.cos(a) * rr,
              y: arc.cy + Math.sin(a) * rr,
            });
          }
        }
      }
      return {
        points: resamplePolyline(corners, sampleCount, true),
        closed: true,
      };
    }
    case "circle": {
      const r = shape.radius ?? 50;
      const pts: Pt[] = [];
      for (let i = 0; i < sampleCount; i++) {
        const a = (i / sampleCount) * Math.PI * 2 - Math.PI / 2;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return { points: pts, closed: true };
    }
    case "line": {
      const pts = shape.points ?? [];
      if (pts.length < 2) {
        return {
          points: resamplePolyline(
            [
              { x: -50, y: 0 },
              { x: 50, y: 0 },
            ],
            sampleCount,
            false,
          ),
          closed: false,
        };
      }
      const sampled = samplePathPoints(pts, false, 8);
      return {
        points: resamplePolyline(sampled, sampleCount, false),
        closed: false,
      };
    }
    case "path": {
      // Prefer primary points; if empty fall back to first subpath
      let pts = shape.points ?? [];
      if (pts.length < 2 && shape.subpaths?.length) {
        pts = shape.subpaths[0] ?? [];
      }
      if (pts.length < 2) {
        return {
          points: resamplePolyline(
            [
              { x: -40, y: -40 },
              { x: 40, y: -40 },
              { x: 40, y: 40 },
              { x: -40, y: 40 },
            ],
            sampleCount,
            true,
          ),
          closed: true,
        };
      }
      const closed = shape.closePath !== false;
      // Sample cubic handles so shape tween follows the curve
      const sampled = samplePathPoints(pts, closed, 8);
      return {
        points: resamplePolyline(sampled, sampleCount, closed),
        closed,
      };
    }
    case "text": {
      // Morph via bounding box (text content itself is not morphable)
      const fontSize = shape.fontSize ?? 24;
      const content = shape.text ?? "";
      const vertical = shape.textOrientation === "vertical";
      const w =
        shape.width ??
        (vertical
          ? fontSize * 1.4
          : Math.max(40, content.length * fontSize * 0.6));
      const h =
        shape.height ??
        (vertical
          ? Math.max(fontSize, content.length * fontSize * 1.1)
          : fontSize * 1.4);
      const hw = w / 2;
      const hh = h / 2;
      const corners: Pt[] = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
      return {
        points: resamplePolyline(corners, sampleCount, true),
        closed: true,
      };
    }
    default: {
      return {
        points: resamplePolyline(
          [
            { x: -40, y: -40 },
            { x: 40, y: -40 },
            { x: 40, y: 40 },
            { x: -40, y: 40 },
          ],
          sampleCount,
          true,
        ),
        closed: true,
      };
    }
  }
}

/**
 * Rotate `points` so that index 0 is the vertex closest to `target`.
 * Reduces morph spin when two similar shapes start at different contour origins.
 */
function alignContourStart(points: Pt[], target: Pt): Pt[] {
  if (points.length < 2) return points;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = dist(points[i]!, target);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best === 0) return points;
  return points.slice(best).concat(points.slice(0, best));
}

/**
 * Choose winding (forward vs reversed) that minimises total squared distance
 * to the reference contour — reduces self-intersection during morph.
 */
function bestWinding(points: Pt[], reference: Pt[]): Pt[] {
  if (points.length !== reference.length || points.length < 2) return points;
  let fwd = 0;
  let rev = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = reference[i]!;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    fwd += dx * dx + dy * dy;
    const r = points[(n - i) % n]!;
    const rdx = r.x - b.x;
    const rdy = r.y - b.y;
    rev += rdx * rdx + rdy * rdy;
  }
  if (rev < fwd) {
    // reverse but keep start fixed
    return [points[0]!, ...points.slice(1).reverse()];
  }
  return points;
}

// ---------------------------------------------------------------------------
// Element interpolation
// ---------------------------------------------------------------------------

function interpolateTransform(
  a: Element,
  b: Element,
  t: number,
): Pick<
  Element,
  "x" | "y" | "scaleX" | "scaleY" | "rotation" | "opacity" | "pivot" | "filters"
> {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scaleX: lerp(a.scaleX, b.scaleX, t),
    scaleY: lerp(a.scaleY, b.scaleY, t),
    rotation: lerp(a.rotation, b.rotation, t),
    opacity: lerp(a.opacity, b.opacity, t),
    pivot:
      a.pivot && b.pivot
        ? {
            x: lerp(a.pivot.x, b.pivot.x, t),
            y: lerp(a.pivot.y, b.pivot.y, t),
          }
        : (a.pivot ?? b.pivot),
    filters: lerpFilters(a.filters, b.filters, t),
  };
}

/**
 * Motion tween: transforms + primitive size fields. Path geometry stays on `a`.
 * Optional motionPath drives x/y (and rotation when orientToPath).
 */
function interpolateMotion(
  a: Element,
  b: Element,
  t: number,
  motionPath?: MotionPath,
): Element {
  const xf = interpolateTransform(a, b, t);
  if (motionPath && motionPath.points.length >= 2) {
    const pos = pointOnMotionPath(motionPath, t);
    xf.x = pos.x;
    xf.y = pos.y;
    if (motionPath.orientToPath) {
      xf.rotation = tangentAngleOnMotionPath(motionPath, t);
    }
  }
  const base = { ...a, ...xf };

  if (a.type === "shape" && b.type === "shape") {
    return {
      ...base,
      type: "shape",
      shapeType: a.shapeType,
      fill: a.fill,
      fillGradient: lerpGradient(a.fillGradient, b.fillGradient, t, (c0, c1, tt = t) => lerpColor(c0, c1, tt)),
      stroke: a.stroke,
      strokeWidth:
        a.strokeWidth != null && b.strokeWidth != null
          ? lerp(a.strokeWidth, b.strokeWidth, t)
          : a.strokeWidth,
      width:
        a.width != null && b.width != null
          ? lerp(a.width, b.width, t)
          : a.width,
      height:
        a.height != null && b.height != null
          ? lerp(a.height, b.height, t)
          : a.height,
      radius:
        a.radius != null && b.radius != null
          ? lerp(a.radius, b.radius, t)
          : a.radius,
      cornerRadius:
        a.cornerRadius != null && b.cornerRadius != null
          ? lerp(a.cornerRadius, b.cornerRadius, t)
          : a.cornerRadius,
      points: a.points,
      subpaths: a.subpaths,
      fillRule: a.fillRule,
      closePath: a.closePath,
      // text fields stay on start (motion does not morph glyphs)
      text: a.text,
      textOrientation: a.textOrientation,
      fontFamily: a.fontFamily,
      fontSize:
        a.fontSize != null && b.fontSize != null
          ? lerp(a.fontSize, b.fontSize, t)
          : a.fontSize,
      fontWeight: a.fontWeight,
      fontStyle: a.fontStyle,
      letterSpacing: a.letterSpacing,
      lineHeight: a.lineHeight,
      textAlign: a.textAlign,
    };
  }

  return base as Element;
}

/**
 * Shape tween: morph contour between two shapes (Flash-style).
 * Intermediate frames are emitted as closed/open `path` elements so the
 * existing SVG / canvas path renderers can draw them without special cases.
 * Non-shape elements fall back to motion interpolation.
 */
function interpolateShape(a: Element, b: Element, t: number): Element {
  if (a.type !== "shape" || b.type !== "shape") {
    return interpolateMotion(a, b, t);
  }

  const xf = interpolateTransform(a, b, t);
  const sampleCount = DEFAULT_SAMPLE_COUNT;

  const contourA = shapeToContour(a, sampleCount);
  let contourB = shapeToContour(b, sampleCount);

  // Align B's start vertex to A's start to reduce spin
  if (contourA.closed && contourB.closed && contourA.points.length > 0) {
    contourB = {
      ...contourB,
      points: alignContourStart(contourB.points, contourA.points[0]!),
    };
    contourB = {
      ...contourB,
      points: bestWinding(contourB.points, contourA.points),
    };
  }

  // Ensure equal length (shapeToContour already uses same sampleCount, but be safe)
  const n = Math.max(contourA.points.length, contourB.points.length, 2);
  const ptsA =
    contourA.points.length === n
      ? contourA.points
      : resamplePolyline(contourA.points, n, contourA.closed);
  const ptsB =
    contourB.points.length === n
      ? contourB.points
      : resamplePolyline(contourB.points, n, contourB.closed);

  const morphed: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const pa = ptsA[i] ?? ptsA[ptsA.length - 1]!;
    const pb = ptsB[i] ?? ptsB[ptsB.length - 1]!;
    morphed.push({
      x: lerp(pa.x, pb.x, t),
      y: lerp(pa.y, pb.y, t),
    });
  }

  const closed = contourA.closed || contourB.closed;

  const strokeWidth =
    a.strokeWidth != null && b.strokeWidth != null
      ? lerp(a.strokeWidth, b.strokeWidth, t)
      : (a.strokeWidth ?? b.strokeWidth);

  const result: ShapeElement = {
    id: a.id,
    type: "shape",
    shapeType: "path",
    name: a.name,
    ...xf,
    fill: lerpColor(a.fill, b.fill, t) ?? a.fill ?? b.fill,
    fillGradient: lerpGradient(a.fillGradient, b.fillGradient, t, (c0, c1, tt = t) => lerpColor(c0, c1, tt)),
    stroke: lerpColor(a.stroke, b.stroke, t) ?? a.stroke ?? b.stroke,
    strokeWidth,
    points: morphed,
    closePath: closed,
    fillRule: a.fillRule ?? b.fillRule,
    // Clear primitive size fields — geometry is fully in points
    width: undefined,
    height: undefined,
    radius: undefined,
    cornerRadius: undefined,
    subpaths: undefined,
  };

  return result;
}

/**
 * Interpolate two elements that share the same id.
 * `tween` selects motion (transform) vs shape (contour morph).
 */
function interpolateElement(
  a: Element,
  b: Element,
  t: number,
  tween: TweenType,
  motionPath?: MotionPath,
): Element {
  if (tween === "shape") {
    return interpolateShape(a, b, t);
  }
  // "motion" (and any future motion-like modes)
  return interpolateMotion(a, b, t, motionPath);
}

/**
 * Resolve the live element list for a layer at `currentFrame`.
 *
 * Model (Flash-style, no baked intermediate keyframes):
 *   Keyframe A  +  tween setting  +  Keyframe B
 *     →  interpolate for frames strictly between A and B
 *
 * - Tween is stored on the *start* keyframe (`prev.tween`).
 * - Matching is by element `id` so the same object is tracked across keyframes.
 * - Frames that fall exactly on a keyframe return that keyframe's elements.
 * - Mid-span manual edits create a real keyframe (via store) which splits the span.
 */
export function getElementsAtFrame(
  keyframes: Keyframe[],
  currentFrame: number,
): Element[] {
  if (!keyframes || keyframes.length === 0) return [];

  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);

  if (currentFrame < sorted[0]!.frame) {
    return [];
  }

  if (currentFrame === sorted[0]!.frame) {
    return sorted[0]!.elements.map((el) => ({ ...el }));
  }

  if (currentFrame >= sorted[sorted.length - 1]!.frame) {
    return sorted[sorted.length - 1]!.elements.map((el) => ({ ...el }));
  }

  let prev = sorted[0]!;
  let next = sorted[sorted.length - 1]!;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (
      currentFrame >= sorted[i]!.frame &&
      currentFrame <= sorted[i + 1]!.frame
    ) {
      prev = sorted[i]!;
      next = sorted[i + 1]!;
      break;
    }
  }

  // Exact keyframe hit
  if (currentFrame === prev.frame) {
    return prev.elements.map((el) => ({ ...el }));
  }
  if (currentFrame === next.frame) {
    return next.elements.map((el) => ({ ...el }));
  }

  // No tween on the starting keyframe → hold previous values (classic Flash hold)
  if (prev.tween === "none" || prev.frame === next.frame) {
    return prev.elements.map((el) => ({ ...el }));
  }

  const span = next.frame - prev.frame;
  if (span <= 0) {
    return prev.elements.map((el) => ({ ...el }));
  }

  const rawT = (currentFrame - prev.frame) / span;
  const t = applyEasing(
    rawT,
    prev.easing ?? "linear",
    prev.easingBezier,
  );
  const tweenType: TweenType = prev.tween;

  const nextMap = new Map(next.elements.map((el) => [el.id, el]));
  const result: Element[] = [];
  const path =
    tweenType === "motion" && prev.motionPath?.points?.length
      ? prev.motionPath
      : undefined;

  for (const el of prev.elements) {
    const match = nextMap.get(el.id);
    if (match) {
      result.push(interpolateElement(el, match, t, tweenType, path));
    } else {
      // Element removed on the end keyframe — keep start state for the span
      result.push({ ...el });
    }
  }

  // Elements that only exist on the end keyframe appear only after the span ends
  // (Flash classic behaviour: new instances start at the end keyframe).

  return result;
}

/**
 * Backward-compatible helper used by older call sites.
 */
export function getInterpolatedFrame(
  keyframes: Keyframe[],
  currentFrame: number,
): { frame: number; elements: Element[]; tween?: TweenType } | null {
  if (!keyframes || keyframes.length === 0) return null;

  const elements = getElementsAtFrame(keyframes, currentFrame);
  return {
    frame: currentFrame,
    elements,
  };
}
