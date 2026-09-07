import type { AxisAlignedBounds } from "./selectionBounds";
import type { HandleId, Point } from "@/components/Stage/transformGeometry";

const HANDLE_HIT_PX = 10;
const ROTATE_OFFSET = 28;

/** Hit-test axis-aligned group transform handles. */
export function hitTestGroupHandle(
  point: Point,
  bounds: AxisAlignedBounds,
  zoom: number,
): HandleId | null {
  const hitR = HANDLE_HIT_PX / Math.max(0.15, zoom);
  const invZoom = 1 / Math.max(0.15, zoom);
  const pad = 2 * invZoom;
  const x0 = bounds.minX - pad;
  const y0 = bounds.minY - pad;
  const x1 = bounds.maxX + pad;
  const y1 = bounds.maxY + pad;
  const cx = bounds.cx;
  const cy = bounds.cy;

  const rotate = { x: cx, y: y0 - ROTATE_OFFSET * invZoom };
  if (Math.hypot(point.x - rotate.x, point.y - rotate.y) <= hitR) {
    return "rotate";
  }

  const handles: { id: Exclude<HandleId, "move" | "rotate">; x: number; y: number }[] =
    [
      { id: "nw", x: x0, y: y0 },
      { id: "n", x: cx, y: y0 },
      { id: "ne", x: x1, y: y0 },
      { id: "e", x: x1, y: cy },
      { id: "se", x: x1, y: y1 },
      { id: "s", x: cx, y: y1 },
      { id: "sw", x: x0, y: y1 },
      { id: "w", x: x0, y: cy },
    ];

  for (const h of handles) {
    if (Math.hypot(point.x - h.x, point.y - h.y) <= hitR) {
      return h.id;
    }
  }

  if (point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1) {
    return "move";
  }
  return null;
}

/**
 * Scale factors relative to group center from dragging a handle on an AABB.
 * Returns multipliers to apply to both positions (relative to center) and element scales.
 */
export function groupScaleFromHandleDrag(args: {
  handle: Exclude<HandleId, "move" | "rotate">;
  bounds: AxisAlignedBounds;
  pointer: Point;
  uniform?: boolean;
}): { scaleX: number; scaleY: number } {
  const { handle, bounds, pointer, uniform } = args;
  const halfW = Math.max(1, bounds.width / 2);
  const halfH = Math.max(1, bounds.height / 2);
  const lx = pointer.x - bounds.cx;
  const ly = pointer.y - bounds.cy;

  let scaleX = 1;
  let scaleY = 1;

  if (handle.includes("e") || handle.includes("w")) {
    scaleX = Math.max(0.01, Math.abs(lx) / halfW);
  }
  if (handle.includes("n") || handle.includes("s")) {
    scaleY = Math.max(0.01, Math.abs(ly) / halfH);
  }

  if (handle.length === 2) {
    const sx = Math.max(0.01, Math.abs(lx) / halfW);
    const sy = Math.max(0.01, Math.abs(ly) / halfH);
    if (uniform) {
      const s = Math.max(sx, sy);
      scaleX = s;
      scaleY = s;
    } else {
      scaleX = sx;
      scaleY = sy;
    }
  } else if (uniform) {
    const s =
      handle.includes("e") || handle.includes("w") ? scaleX : scaleY;
    scaleX = s;
    scaleY = s;
  }

  return { scaleX, scaleY };
}

export function rotatePointAround(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}
