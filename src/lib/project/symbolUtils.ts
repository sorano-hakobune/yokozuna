import type {
  Element,
  Layer,
  ShapeElement,
  Symbol,
  SymbolType,
} from "@/types/project";
import { generateId } from "./generateId";

/** Rough axis-aligned bounds of an element in stage space (ignores rotation for convert centering). */
export function estimateElementBounds(
  element: Element,
  assetSize?: { width?: number; height?: number },
): { minX: number; minY: number; maxX: number; maxY: number } {
  const sx = Math.abs(element.scaleX || 1);
  const sy = Math.abs(element.scaleY || 1);
  // Pivot model: world ≈ T + S*(L - P) (rotation ignored, rough estimate)
  const pivX = element.pivot?.x ?? 0;
  const pivY = element.pivot?.y ?? 0;
  const cx = element.x - pivX * sx;
  const cy = element.y - pivY * sy;

  if (element.type === "bitmap") {
    const w = (assetSize?.width ?? 100) * sx;
    const h = (assetSize?.height ?? 100) * sy;
    return {
      minX: cx - w / 2,
      minY: cy - h / 2,
      maxX: cx + w / 2,
      maxY: cy + h / 2,
    };
  }

  if (element.type === "instance") {
    const w = 100 * sx;
    const h = 100 * sy;
    return {
      minX: cx - w / 2,
      minY: cy - h / 2,
      maxX: cx + w / 2,
      maxY: cy + h / 2,
    };
  }

  const shape = element as ShapeElement;
  switch (shape.shapeType) {
    case "rectangle": {
      const w = (shape.width ?? 100) * sx;
      const h = (shape.height ?? 100) * sy;
      return {
        minX: cx - w / 2,
        minY: cy - h / 2,
        maxX: cx + w / 2,
        maxY: cy + h / 2,
      };
    }
    case "circle": {
      const r = (shape.radius ?? 50) * Math.max(sx, sy);
      return {
        minX: cx - r,
        minY: cy - r,
        maxX: cx + r,
        maxY: cy + r,
      };
    }
    case "line":
    case "path": {
      const pts = shape.points ?? [];
      if (pts.length === 0) {
        return {
          minX: cx - 20,
          minY: cy - 20,
          maxX: cx + 20,
          maxY: cy + 20,
        };
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        const wx = shape.x + (p.x - pivX) * sx;
        const wy = shape.y + (p.y - pivY) * sy;
        minX = Math.min(minX, wx);
        minY = Math.min(minY, wy);
        maxX = Math.max(maxX, wx);
        maxY = Math.max(maxY, wy);
      }
      return { minX, minY, maxX, maxY };
    }
    default:
      return {
        minX: shape.x - 50,
        minY: shape.y - 50,
        maxX: shape.x + 50,
        maxY: shape.y + 50,
      };
  }
}

export function unionBounds(
  boundsList: { minX: number; minY: number; maxX: number; maxY: number }[],
): { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number; width: number; height: number } {
  if (boundsList.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 100, cx: 50, cy: 50, width: 100, height: 100 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boundsList) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width,
    height,
  };
}

/** Shift element so that (originX, originY) becomes local (0,0). */
export function recenterElement(
  element: Element,
  originX: number,
  originY: number,
): Element {
  const cloned = JSON.parse(JSON.stringify(element)) as Element;
  cloned.x = element.x - originX;
  cloned.y = element.y - originY;
  return cloned;
}

export function buildSymbolFromElements(args: {
  name: string;
  type: SymbolType;
  elements: Element[];
  assetSizes?: Record<string, { width?: number; height?: number }>;
}): Omit<Symbol, "id"> {
  const bounds = unionBounds(
    args.elements.map((el) =>
      estimateElementBounds(
        el,
        el.type === "bitmap" ? args.assetSizes?.[el.assetId] : undefined,
      ),
    ),
  );

  const recentered = args.elements.map((el) =>
    recenterElement(el, bounds.cx, bounds.cy),
  );

  const layer: Layer = {
    id: generateId("layer"),
    name: "レイヤー 1",
    type: "normal",
    visible: true,
    locked: false,
    keyframes: [
      {
        frame: 0,
        tween: "none",
        elements: recentered,
      },
    ],
  };

  return {
    name: args.name,
    type: args.type,
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height),
    pivot: { x: 0, y: 0 },
    duration: Math.max(1, args.type === "movieClip" ? 1 : 1),
    layers: [layer],
  };
}

export function createEmptySymbolData(
  name: string,
  type: SymbolType,
  width = 100,
  height = 100,
): Omit<Symbol, "id"> {
  return {
    name,
    type,
    width,
    height,
    pivot: { x: 0, y: 0 },
    duration: 1,
    layers: [
      {
        id: generateId("layer"),
        name: "レイヤー 1",
        type: "normal",
        visible: true,
        locked: false,
        keyframes: [{ frame: 0, tween: "none", elements: [] }],
      },
    ],
  };
}
