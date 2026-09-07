import type { ShapeElement } from "@/types/project";
import { generateId } from "@/lib/project";

/**
 * 矩形図形を作成
 */
export function createRectangleShape(
  x: number,
  y: number,
  width: number = 100,
  height: number = 100,
  options?: Partial<ShapeElement>
): ShapeElement {
  return {
    id: generateId("shape"),
    type: "shape",
    shapeType: "rectangle",
    x,
    y,
    width,
    height,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    fill: options?.fill ?? "#3b82f6",
    stroke: options?.stroke ?? "#1d4ed8",
    strokeWidth: options?.strokeWidth ?? 2,
    ...options,
  };
}

/**
 * 円形図形を作成
 */
export function createCircleShape(
  x: number,
  y: number,
  radius: number = 50,
  options?: Partial<ShapeElement>
): ShapeElement {
  return {
    id: generateId("shape"),
    type: "shape",
    shapeType: "circle",
    x,
    y,
    radius,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    fill: options?.fill ?? "#ef4444",
    stroke: options?.stroke ?? "#b91c1c",
    strokeWidth: options?.strokeWidth ?? 2,
    ...options,
  };
}

/**
 * 線図形を作成
 */
export function createLineShape(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  options?: Partial<ShapeElement>
): ShapeElement {
  const centerX = (startX + endX) / 2;
  const centerY = (startY + endY) / 2;
  
  return {
    id: generateId("shape"),
    type: "shape",
    shapeType: "line",
    x: centerX,
    y: centerY,
    points: [
      { x: startX - centerX, y: startY - centerY },
      { x: endX - centerX, y: endY - centerY },
    ],
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    stroke: options?.stroke ?? "#10b981",
    strokeWidth: options?.strokeWidth ?? 2,
    ...options,
  };
}
