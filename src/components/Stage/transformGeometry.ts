import type { Element, ShapeElement } from "@/types/project";

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
  | "rotate";

export interface LocalBounds {
  /** Half-width in local (pre-scale) space */
  halfW: number;
  /** Half-height in local (pre-scale) space */
  halfH: number;
}

export interface WorldTransform {
  x: number;
  y: number;
  rotation: number; // degrees
  scaleX: number;
  scaleY: number;
}

const HANDLE_HIT_PX = 10;
const ROTATE_OFFSET = 28;

export function getLocalBounds(
  element: Element,
  asset?: { width?: number; height?: number },
): LocalBounds {
  if (element.type === "bitmap") {
    const w = asset?.width ?? 0;
    const h = asset?.height ?? 0;
    return { halfW: Math.max(1, w / 2), halfH: Math.max(1, h / 2) };
  }

  if (element.type === "instance") {
    // `asset` may carry symbol width/height when provided by caller
    const w = asset?.width ?? 100;
    const h = asset?.height ?? 100;
    return { halfW: Math.max(1, w / 2), halfH: Math.max(1, h / 2) };
  }

  const shape = element as ShapeElement;
  switch (shape.shapeType) {
    case "rectangle":
    case "text":
      return {
        halfW: Math.max(1, (shape.width ?? 100) / 2),
        halfH: Math.max(1, (shape.height ?? 100) / 2),
      };
    case "circle": {
      const r = Math.max(1, shape.radius ?? 50);
      return { halfW: r, halfH: r };
    }
    case "line":
    case "path": {
      const pts = shape.points ?? [];
      if (pts.length === 0) return { halfW: 20, halfH: 20 };
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      for (const sub of shape.subpaths ?? []) {
        for (const p of sub) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
      const pad = (shape.strokeWidth ?? 2) / 2;
      return {
        halfW: Math.max(4, (maxX - minX) / 2 + pad),
        halfH: Math.max(4, (maxY - minY) / 2 + pad),
      };
    }
    default:
      return { halfW: 50, halfH: 50 };
  }
}

export function elementWorldTransform(element: Element): WorldTransform {
  return {
    x: element.x,
    y: element.y,
    rotation: element.rotation ?? 0,
    scaleX: element.scaleX || 1,
    scaleY: element.scaleY || 1,
  };
}

/** Local point → canvas (stage) space */
export function localToWorld(local: Point, t: WorldTransform): Point {
  const sx = local.x * t.scaleX;
  const sy = local.y * t.scaleY;
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
  const dx = world.x - t.x;
  const dy = world.y - t.y;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;
  return {
    x: rx / (t.scaleX || 1),
    y: ry / (t.scaleY || 1),
  };
}

export function getHandleLocalPositions(
  bounds: LocalBounds,
): Record<Exclude<HandleId, "move">, Point> {
  const { halfW: w, halfH: h } = bounds;
  return {
    nw: { x: -w, y: -h },
    n: { x: 0, y: -h },
    ne: { x: w, y: -h },
    e: { x: w, y: 0 },
    se: { x: w, y: h },
    s: { x: 0, y: h },
    sw: { x: -w, y: h },
    w: { x: -w, y: 0 },
    rotate: { x: 0, y: -h - ROTATE_OFFSET / Math.max(0.001, 1) },
  };
}

/** Rotate handle sits above the top edge in local scaled visual space.
 *  Offset is in local units adjusted so on-screen distance stays ~ROTATE_OFFSET px
 *  when scale≈1; callers can pass zoom for tighter hit testing. */
export function getRotateHandleLocal(bounds: LocalBounds): Point {
  return { x: 0, y: -bounds.halfH - ROTATE_OFFSET };
}

export function getHandleWorldPositions(
  bounds: LocalBounds,
  t: WorldTransform,
): Record<Exclude<HandleId, "move">, Point> {
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
  const order: Exclude<HandleId, "move">[] = [
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

  // Inside AABB in local space → move
  const local = worldToLocal(canvasPoint, t);
  if (
    Math.abs(local.x) <= bounds.halfW + 2 &&
    Math.abs(local.y) <= bounds.halfH + 2
  ) {
    return "move";
  }
  return null;
}

export function cursorForHandle(handle: HandleId | null, rotationDeg: number): string {
  if (!handle || handle === "move") return handle === "move" ? "move" : "default";
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
 * Keeps opposite corner fixed in world space (Flash-like).
 */
export function scaleFromHandleDrag(args: {
  handle: Exclude<HandleId, "move" | "rotate">;
  bounds: LocalBounds;
  start: WorldTransform;
  pointer: Point;
  uniform?: boolean;
}): { scaleX: number; scaleY: number } {
  const { handle, bounds, start, pointer, uniform } = args;
  const local = worldToLocal(pointer, start);

  // Anchor is the opposite side/corner in local space
  const anchorLocal: Point = {
    x: handle.includes("e") ? -bounds.halfW : handle.includes("w") ? bounds.halfW : 0,
    y: handle.includes("s") ? -bounds.halfH : handle.includes("n") ? bounds.halfH : 0,
  };

  // Desired distance from anchor to pointer in local *unscaled* terms:
  // pointer is already in local pre-scale coords relative to center.
  // For scale from center (simpler, matches current editor model where x/y is center):
  let scaleX = start.scaleX;
  let scaleY = start.scaleY;

  if (handle.includes("e") || handle.includes("w")) {
    const target = Math.abs(local.x);
    scaleX = Math.max(0.01, target / bounds.halfW);
  }
  if (handle.includes("n") || handle.includes("s")) {
    const target = Math.abs(local.y);
    scaleY = Math.max(0.01, target / bounds.halfH);
  }

  if (uniform || handle.length === 2) {
    // Corner: use the dominant relative change or average
    if (handle.length === 2) {
      const sx = Math.max(0.01, Math.abs(local.x) / bounds.halfW);
      const sy = Math.max(0.01, Math.abs(local.y) / bounds.halfH);
      if (uniform) {
        const s = Math.max(sx, sy);
        scaleX = s;
        scaleY = s;
      } else {
        scaleX = sx;
        scaleY = sy;
      }
    } else if (uniform) {
      const s = handle.includes("e") || handle.includes("w") ? scaleX : scaleY;
      scaleX = s;
      scaleY = s;
    }
  }

  void anchorLocal;
  return { scaleX, scaleY };
}

export function rotationFromDrag(center: Point, pointer: Point): number {
  const deg = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI;
  // Handle sits above → angle of "up" is -90°; store absolute rotation of element
  return deg + 90;
}
