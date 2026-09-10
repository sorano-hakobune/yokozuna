import type { Element, ShapeElement } from "@/types/project";
import { samplePathPoints } from "@/lib/draw/pathBezier";

export type Point = { x: number; y: number };

export type HandleId =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "rotate"
  | "pivot";

export interface LocalBounds {
  /** Half-width in local (pre-scale) space */
  halfW: number;
  /** Half-height in local (pre-scale) space */
  halfH: number;
  /** Center of the actual visual geometry in local (pre-scale) space.
   *  Centered shapes (rect/circle/bitmap/…) are (0,0).
   *  Path/line/text may be offset when their geometry is not centered
   *  on the local origin. Independent from the pivot (transform origin). */
  cx: number;
  cy: number;
}

export interface WorldTransform {
  x: number;
  y: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
  /** Local-space pivot (rotation/scale origin). Default (0,0) = geometric center. */
  pivotX?: number;
  pivotY?: number;
}

const HANDLE_HIT_PX = 10;
const ROTATE_OFFSET = 28;

/** Measured horizontal text width using canvas (falls back to estimate). */
let measureCtx: CanvasRenderingContext2D | null | undefined;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  try {
    if (typeof document === "undefined") {
      measureCtx = null;
      return measureCtx;
    }
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d");
  } catch {
    measureCtx = null;
  }
  return measureCtx;
}

function measureTextWidth(
  content: string,
  shape: ShapeElement,
  fontSize: number,
): number {
  if (!content) return 0;
  const ctx = getMeasureCtx();
  const family = shape.fontFamily ?? "sans-serif";
  const weight = shape.fontWeight ?? "normal";
  const style = shape.fontStyle ?? "normal";
  if (ctx) {
    try {
      ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
      const w = ctx.measureText(content).width;
      if (Number.isFinite(w) && w > 0) {
        const ls = Number(shape.letterSpacing ?? 0) || 0;
        const extra = ls > 0 ? Math.max(0, Array.from(content).length - 1) * ls : 0;
        return w + extra;
      }
    } catch {
      // fall through to estimate
    }
  }
  const ls = Number(shape.letterSpacing ?? 0) || 0;
  return Math.max(1, Array.from(content).length) * fontSize * 0.6 + Math.max(0, Array.from(content).length - 1) * ls;
}

/**
 * Actual visual bounds of a text shape in local space.
 * Matches the SVG stage renderer (LayerContent): glyph origin depends on
 * textAlign vs layout width, vertical center is fontSize*0.35 for horizontal.
 * Width comes from measured glyphs, not from the stale stored width/height.
 */
function getTextLocalBounds(shape: ShapeElement): LocalBounds {
  const fontSize = shape.fontSize ?? 24;
  const content = shape.text ?? "";
  const chars = Array.from(content);
  const len = chars.length;
  const vertical = shape.textOrientation === "vertical";
  const strokePad =
    shape.stroke && shape.stroke !== "none" ? (shape.strokeWidth ?? 0) / 2 : 0;

  if (vertical) {
    const layoutW = shape.width ?? fontSize * 1.4;
    const layoutH =
      shape.height ?? Math.max(fontSize, Math.max(1, len) * fontSize * 1.1);
    const colW = Math.max(4, fontSize);
    const lineH = shape.lineHeight ?? 1.1;
    const colH = Math.max(fontSize, len * fontSize * lineH);
    const startY = -layoutH / 2;
    const minY = startY;
    const maxY = startY + (len === 0 ? fontSize : colH);
    let minX: number;
    let maxX: number;
    if (shape.textAlign === "center") {
      minX = -colW / 2;
      maxX = colW / 2;
    } else if (shape.textAlign === "right") {
      maxX = layoutW / 2;
      minX = maxX - colW;
    } else {
      minX = -layoutW / 2;
      maxX = minX + colW;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      halfW: Math.max(1, (maxX - minX) / 2 + strokePad),
      halfH: Math.max(1, (maxY - minY) / 2 + strokePad),
      cx,
      cy,
    };
  }

  const layoutW =
    shape.width ?? Math.max(40, Math.max(1, len) * fontSize * 0.6);
  const tw =
    len === 0 ? fontSize * 0.5 : measureTextWidth(content, shape, fontSize);
  const th = Math.max(4, fontSize);
  const y = fontSize * 0.35;
  const minY = y - th / 2;
  const maxY = y + th / 2;
  let minX: number;
  let maxX: number;
  if (shape.textAlign === "center") {
    minX = -tw / 2;
    maxX = tw / 2;
  } else if (shape.textAlign === "right") {
    maxX = layoutW / 2;
    minX = maxX - tw;
  } else {
    minX = -layoutW / 2;
    maxX = minX + tw;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    halfW: Math.max(1, (maxX - minX) / 2 + strokePad),
    halfH: Math.max(1, (maxY - minY) / 2 + strokePad),
    cx,
    cy,
  };
}

/**
 * Actual visual bounds of a line/path in local space.
 * Samples Bezier curves (not raw handles) + subpaths so the box tightly
 * wraps the rendered stroke. Center offset is preserved (cx/cy) instead
 * of assuming geometry is centered on the local origin.
 */
function getPathLocalBounds(shape: ShapeElement): LocalBounds {
  const pts = shape.points ?? [];
  const subs = shape.subpaths ?? [];
  if (pts.length === 0 && subs.length === 0) {
    return { halfW: 20, halfH: 20, cx: 0, cy: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const eat = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  if (pts.length >= 2) {
    const sampled = samplePathPoints(pts, !!shape.closePath, 12);
    for (const p of sampled) eat(p.x, p.y);
    // Safety: vertices themselves (degenerate sampling)
    for (const p of pts) eat(p.x, p.y);
  } else {
    for (const p of pts) eat(p.x, p.y);
  }
  for (const sub of subs) {
    for (const p of sub) eat(p.x, p.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { halfW: 20, halfH: 20, cx: 0, cy: 0 };
  }
  const pad = (shape.strokeWidth ?? 2) / 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    halfW: Math.max(4, (maxX - minX) / 2 + pad),
    halfH: Math.max(4, (maxY - minY) / 2 + pad),
    cx,
    cy,
  };
}

export function getLocalBounds(
  element: Element,
  asset?: { width?: number; height?: number },
): LocalBounds {
  if (element.type === "bitmap") {
    const w = asset?.width ?? 0;
    const h = asset?.height ?? 0;
    return { halfW: Math.max(1, w / 2), halfH: Math.max(1, h / 2), cx: 0, cy: 0 };
  }

  if (element.type === "instance") {
    // `asset` may carry symbol width/height when provided by caller
    const w = asset?.width ?? 100;
    const h = asset?.height ?? 100;
    return { halfW: Math.max(1, w / 2), halfH: Math.max(1, h / 2), cx: 0, cy: 0 };
  }

  const shape = element as ShapeElement;
  switch (shape.shapeType) {
    case "rectangle":
      return {
        halfW: Math.max(1, (shape.width ?? 100) / 2),
        halfH: Math.max(1, (shape.height ?? 100) / 2),
        cx: 0,
        cy: 0,
      };
    case "text":
      return getTextLocalBounds(shape);
    case "circle": {
      const r = Math.max(1, shape.radius ?? 50);
      return { halfW: r, halfH: r, cx: 0, cy: 0 };
    }
    case "line":
    case "path": {
      return getPathLocalBounds(shape);
    }
    default:
      return { halfW: 50, halfH: 50, cx: 0, cy: 0 };
  }
}

export function elementWorldTransform(element: Element): WorldTransform {
  const pivot = element.pivot;
  return {
    x: element.x,
    y: element.y,
    rotation: element.rotation ?? 0,
    scaleX: element.scaleX || 1,
    scaleY: element.scaleY || 1,
    pivotX: pivot?.x ?? 0,
    pivotY: pivot?.y ?? 0,
  };
}

/**
 * Local point → canvas (stage) space.
 * Model: W(L) = T + R * S * (L - P)  so (x,y) is the world position of the pivot.
 */
export function localToWorld(local: Point, t: WorldTransform): Point {
  const px = t.pivotX ?? 0;
  const py = t.pivotY ?? 0;
  const sx = (local.x - px) * t.scaleX;
  const sy = (local.y - py) * t.scaleY;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: t.x + sx * cos - sy * sin,
    y: t.y + sx * sin + sy * cos,
  };
}

/** Canvas point → local (pre-scale) space */
export function worldToLocal(world: Point, t: WorldTransform): Point {
  const px = t.pivotX ?? 0;
  const py = t.pivotY ?? 0;
  const dx = world.x - t.x;
  const dy = world.y - t.y;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;
  return {
    x: rx / (t.scaleX || 1) + px,
    y: ry / (t.scaleY || 1) + py,
  };
}

/** World position of the pivot (equals element x/y under the pivot model). */
export function pivotWorldPosition(t: WorldTransform): Point {
  return { x: t.x, y: t.y };
}

/**
 * Apply a new local pivot while keeping all geometry fixed in world space.
 * Returns updated { x, y, pivot }.
 */
export function reanchorPivot(
  element: Pick<Element, "x" | "y" | "rotation" | "scaleX" | "scaleY" | "pivot">,
  nextPivot: Point,
): { x: number; y: number; pivot: Point } {
  const t0 = elementWorldTransform(element as Element);
  // World position of a local point L under current pivot:
  // W(L) = T + R*S*(L - P0)
  // After: W'(L) = T' + R*S*(L - P1)
  // Require W'=W for all L → T' = T + R*S*(P1 - P0)
  const p0x = t0.pivotX ?? 0;
  const p0y = t0.pivotY ?? 0;
  const dpx = nextPivot.x - p0x;
  const dpy = nextPivot.y - p0y;
  const sx = dpx * t0.scaleX;
  const sy = dpy * t0.scaleY;
  const rad = (t0.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: t0.x + sx * cos - sy * sin,
    y: t0.y + sx * sin + sy * cos,
    pivot: { x: nextPivot.x, y: nextPivot.y },
  };
}

/** SVG transform attribute for an element (pivot-aware). */
export function elementSvgTransform(
  el: Pick<Element, "x" | "y" | "rotation" | "scaleX" | "scaleY" | "pivot">,
): string {
  const px = el.pivot?.x ?? 0;
  const py = el.pivot?.y ?? 0;
  const r = el.rotation ?? 0;
  const sx = el.scaleX ?? 1;
  const sy = el.scaleY ?? 1;
  if (px === 0 && py === 0) {
    return `translate(${el.x} ${el.y}) rotate(${r}) scale(${sx} ${sy})`;
  }
  return `translate(${el.x} ${el.y}) rotate(${r}) scale(${sx} ${sy}) translate(${-px} ${-py})`;
}

export function getHandleLocalPositions(
  bounds: LocalBounds,
): Record<Exclude<HandleId, "move" | "pivot">, Point> {
  const minX = bounds.cx - bounds.halfW;
  const maxX = bounds.cx + bounds.halfW;
  const minY = bounds.cy - bounds.halfH;
  const maxY = bounds.cy + bounds.halfH;
  return {
    nw: { x: minX, y: minY },
    n: { x: bounds.cx, y: minY },
    ne: { x: maxX, y: minY },
    e: { x: maxX, y: bounds.cy },
    se: { x: maxX, y: maxY },
    s: { x: bounds.cx, y: maxY },
    sw: { x: minX, y: maxY },
    w: { x: minX, y: bounds.cy },
    rotate: { x: bounds.cx, y: minY - ROTATE_OFFSET / Math.max(0.001, 1) },
  };
}

/** Rotate handle sits above the top edge in local scaled visual space.
 *  Offset is in local units adjusted so on-screen distance stays ~ROTATE_OFFSET px
 *  when scale≈1; callers can pass zoom for tighter hit testing. */
export function getRotateHandleLocal(bounds: LocalBounds): Point {
  return { x: bounds.cx, y: bounds.cy - bounds.halfH - ROTATE_OFFSET };
}

export function getHandleWorldPositions(
  bounds: LocalBounds,
  t: WorldTransform,
): Record<Exclude<HandleId, "move" | "pivot">, Point> {
  const locals = getHandleLocalPositions(bounds);
  // Fix rotate offset: place in local space then transform
  const rotateLocal = getRotateHandleLocal(bounds);
  return {
    nw: localToWorld(locals.nw, t),
    n: localToWorld(locals.n, t),
    ne: localToWorld(locals.ne, t),
    e: localToWorld(locals.e, t),
    se: localToWorld(locals.se, t),
    s: localToWorld(locals.s, t),
    sw: localToWorld(locals.sw, t),
    w: localToWorld(locals.w, t),
    rotate: localToWorld(rotateLocal, t),
  };
}

export function hitTestHandle(
  canvasPoint: Point,
  bounds: LocalBounds,
  t: WorldTransform,
  zoom: number,
): HandleId | null {
  const hitR = HANDLE_HIT_PX / Math.max(0.15, zoom);
  const handles = getHandleWorldPositions(bounds, t);
  const order: Exclude<HandleId, "move" | "pivot">[] = [
    "rotate",
    "nw",
    "ne",
    "se",
    "sw",
    "n",
    "s",
    "e",
    "w",
  ];
  for (const id of order) {
    const p = handles[id];
    if (Math.hypot(canvasPoint.x - p.x, canvasPoint.y - p.y) <= hitR) {
      return id;
    }
  }
  // Pivot wins over move (but never over scale/rotate above) so the marker
  // stays grabbable even when it sits inside the selection box.
  if (Math.hypot(canvasPoint.x - t.x, canvasPoint.y - t.y) <= hitR * 1.15) {
    return "pivot";
  }

  // Inside AABB in local space → move
  const local = worldToLocal(canvasPoint, t);
  if (
    local.x >= bounds.cx - bounds.halfW - 2 &&
    local.x <= bounds.cx + bounds.halfW + 2 &&
    local.y >= bounds.cy - bounds.halfH - 2 &&
    local.y <= bounds.cy + bounds.halfH + 2
  ) {
    return "move";
  }
  return null;
}

export function cursorForHandle(handle: HandleId | null, rotationDeg: number): string {
  if (!handle || handle === "move") return handle === "move" ? "move" : "default";
  if (handle === "pivot") return "crosshair";
  if (handle === "rotate") return "grab";

  // Map handle to base angle, then add element rotation for approximate cursor
  const base: Record<string, number> = {
    e: 0,
    se: 45,
    s: 90,
    sw: 135,
    w: 180,
    nw: 225,
    n: 270,
    ne: 315,
  };
  const angle = (((base[handle] ?? 0) + rotationDeg) % 180 + 180) % 180;
  if (angle < 22.5 || angle >= 157.5) return "ew-resize";
  if (angle < 67.5) return "nwse-resize";
  if (angle < 112.5) return "ns-resize";
  return "nesw-resize";
}

/**
 * Compute new scale from dragging a scale handle.
 * Scaling is applied around the pivot P: W(H) = T + R*S*(H - P).
 * The dragged handle H tracks the pointer p (both absolute local coords):
 *   (H - P) * S_new == (p - P) * S_start
 */
export function scaleFromHandleDrag(args: {
  handle: Exclude<HandleId, "move" | "rotate" | "pivot">;
  bounds: LocalBounds;
  start: WorldTransform;
  pointer: Point;
  uniform?: boolean;
}): { scaleX: number; scaleY: number } {
  const { handle, bounds, start, pointer, uniform } = args;
  const local = worldToLocal(pointer, start);
  const px = start.pivotX ?? 0;
  const py = start.pivotY ?? 0;

  const minX = bounds.cx - bounds.halfW;
  const maxX = bounds.cx + bounds.halfW;
  const minY = bounds.cy - bounds.halfH;
  const maxY = bounds.cy + bounds.halfH;
  // Dragged handle position in absolute local space
  const hx = handle.includes("e") ? maxX : handle.includes("w") ? minX : null;
  const hy = handle.includes("s") ? maxY : handle.includes("n") ? minY : null;

  const axisScale = (
    p: number,
    h: number | null,
    pivot: number,
    startScale: number,
  ): number => {
    if (h === null) return startScale;
    const denom = h - pivot;
    if (Math.abs(denom) < 1e-6) return startScale;
    const ratio = (p - pivot) / denom;
    if (!Number.isFinite(ratio)) return startScale;
    const sign = startScale >= 0 ? 1 : -1;
    return sign * Math.max(0.01, Math.abs(ratio) * Math.abs(startScale));
  };

  let scaleX = start.scaleX;
  let scaleY = start.scaleY;

  if (hx !== null) {
    scaleX = axisScale(local.x, hx, px, start.scaleX);
  }
  if (hy !== null) {
    scaleY = axisScale(local.y, hy, py, start.scaleY);
  }

  if (uniform || handle.length === 2) {
    if (handle.length === 2) {
      const sx = hx !== null ? axisScale(local.x, hx, px, start.scaleX) : start.scaleX;
      const sy = hy !== null ? axisScale(local.y, hy, py, start.scaleY) : start.scaleY;
      if (uniform) {
        const rx = Math.abs(sx / (start.scaleX || 1));
        const ry = Math.abs(sy / (start.scaleY || 1));
        const r = Math.max(rx, ry);
        scaleX = (start.scaleX >= 0 ? 1 : -1) * Math.max(0.01, Math.abs(start.scaleX) * r);
        scaleY = (start.scaleY >= 0 ? 1 : -1) * Math.max(0.01, Math.abs(start.scaleY) * r);
      } else {
        scaleX = sx;
        scaleY = sy;
      }
    } else if (uniform) {
      const s = hx !== null ? scaleX : scaleY;
      const base = hx !== null ? start.scaleX : start.scaleY;
      const r = Math.abs(s / (base || 1));
      scaleX = (start.scaleX >= 0 ? 1 : -1) * Math.max(0.01, Math.abs(start.scaleX) * r);
      scaleY = (start.scaleY >= 0 ? 1 : -1) * Math.max(0.01, Math.abs(start.scaleY) * r);
    }
  }

  return { scaleX, scaleY };
}

export function rotationFromDrag(center: Point, pointer: Point): number {
  const deg = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI;
  // Handle sits above → angle of "up" is -90°; store absolute rotation of element
  return deg + 90;
}
