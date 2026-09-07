import type { Element, ShapeElement, Symbol as ProjectSymbol } from "@/types/project";
import { samplePathPoints } from "@/lib/draw/pathBezier";

type Point = { x: number; y: number };

type BitmapAsset = { width?: number; height?: number };

export function getViewportCoordinates(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): Point {
  if (!svg) return { x: 0, y: 0 };
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  try {
    const point = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    return Number.isFinite(point.x) && Number.isFinite(point.y)
      ? { x: point.x, y: point.y }
      : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

export function getCanvasCoordinates(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
  pan: Point,
): Point {
  const viewport = getViewportCoordinates(svg, clientX, clientY);
  return { x: viewport.x - pan.x, y: viewport.y - pan.y };
}

export function isPointInShape(
  px: number,
  py: number,
  shape: ShapeElement,
): boolean {
  const dx = px - shape.x;
  const dy = py - shape.y;
  const angle = (shape.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const scaleX = shape.scaleX || 1;
  const scaleY = shape.scaleY || 1;
  const localX = (dx * cos + dy * sin) / scaleX;
  const localY = (-dx * sin + dy * cos) / scaleY;

  switch (shape.shapeType) {
    case "rectangle":
    case "text":
      return (
        Math.abs(localX) <= (shape.width ?? 100) / 2 &&
        Math.abs(localY) <= (shape.height ?? 100) / 2
      );
    case "circle": {
      const radius = shape.radius ?? 50;
      return localX * localX + localY * localY <= radius * radius;
    }
    case "line":
    case "path": {
      if (!shape.points || shape.points.length < 2) return false;
      const tolerance = Math.max(10, (shape.strokeWidth ?? 2) + 8);
      const closed = !!shape.closePath && shape.shapeType === "path";
      const sampled = samplePathPoints(shape.points, closed, 6);
      const onStroke = sampled.slice(1).some((point, index) => {
        const previous = sampled[index]!;
        const deltaX = point.x - previous.x;
        const deltaY = point.y - previous.y;
        const lengthSquared = deltaX * deltaX + deltaY * deltaY;
        const parameter = Math.max(
          0,
          Math.min(
            1,
            ((localX - previous.x) * deltaX + (localY - previous.y) * deltaY) /
              (lengthSquared || 1),
          ),
        );
        const nearestX = previous.x + parameter * deltaX;
        const nearestY = previous.y + parameter * deltaY;
        return Math.hypot(localX - nearestX, localY - nearestY) <= tolerance;
      });
      if (onStroke) return true;
      // Closed filled path: point-in-polygon on sampled contour
      if (
        shape.shapeType === "path" &&
        closed &&
        shape.fill &&
        shape.fill !== "none" &&
        sampled.length >= 3
      ) {
        let inside = false;
        const pts = sampled;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const pi = pts[i]!;
          const pj = pts[j]!;
          const intersect =
            pi.y > localY !== pj.y > localY &&
            localX <
              ((pj.x - pi.x) * (localY - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x;
          if (intersect) inside = !inside;
        }
        return inside;
      }
      return false;
    }
    default:
      return false;
  }
}

export function isPointInBitmap(
  px: number,
  py: number,
  element: Extract<Element, { type: "bitmap" }>,
  asset: BitmapAsset | undefined,
): boolean {
  const width = asset?.width ?? 0;
  const height = asset?.height ?? 0;
  if (width <= 0 || height <= 0) return false;

  const dx = px - element.x;
  const dy = py - element.y;
  const angle = (element.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = (dx * cos + dy * sin) / (element.scaleX || 1);
  const localY = (-dx * sin + dy * cos) / (element.scaleY || 1);
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
}

export function isPointInInstance(
  px: number,
  py: number,
  element: Extract<Element, { type: "instance" }>,
  symbol: ProjectSymbol | undefined,
): boolean {
  const width = symbol?.width ?? 100;
  const height = symbol?.height ?? 100;
  const dx = px - element.x;
  const dy = py - element.y;
  const angle = ((element.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = (dx * cos + dy * sin) / (element.scaleX || 1);
  const localY = (-dx * sin + dy * cos) / (element.scaleY || 1);
  return Math.abs(localX) <= width / 2 && Math.abs(localY) <= height / 2;
}
