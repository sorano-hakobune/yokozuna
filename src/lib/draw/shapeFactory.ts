import type { ShapeElement } from "@/types/project";
import { generateId } from "@/lib/id";
import { simplifyPath } from "./pathSimplify";

/**
 * 矩形図形を作成
 */
export function createRectangleShape(
  x: number,
  y: number,
  width: number = 100,
  height: number = 100,
  options?: Partial<ShapeElement>,
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
  options?: Partial<ShapeElement>,
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
  options?: Partial<ShapeElement>,
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

/**
 * 自由線を作成（描画直後にパスを簡略化し、過剰なアンカーを抑制）
 */
export function createFreehandShape(
  points: { x: number; y: number }[],
  options?: Partial<ShapeElement>,
): ShapeElement {
  if (points.length < 2) {
    throw new Error("Freehand shape requires at least two points");
  }

  const simplified = simplifyPath(points, 1.25);

  const centerX =
    simplified.reduce((sum, point) => sum + point.x, 0) / simplified.length;
  const centerY =
    simplified.reduce((sum, point) => sum + point.y, 0) / simplified.length;

  return {
    id: generateId("shape"),
    type: "shape",
    shapeType: "path",
    x: centerX,
    y: centerY,
    points: simplified.map((point) => ({
      x: point.x - centerX,
      y: point.y - centerY,
    })),
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    fill: "none",
    stroke: options?.stroke ?? "#f8fafc",
    strokeWidth: options?.strokeWidth ?? 4,
    ...options,
  };
}


/**
 * テキスト図形を作成（横書き / 縦書き）
 */
export function createTextShape(
  x: number,
  y: number,
  text: string = "テキスト",
  options?: Partial<ShapeElement>,
): ShapeElement {
  const orientation = options?.textOrientation ?? "horizontal";
  const fontSize = options?.fontSize ?? 24;
  const content = text || "テキスト";
  // Approximate box for selection handles
  const width =
    options?.width ??
    (orientation === "vertical"
      ? fontSize * 1.4
      : Math.max(fontSize, content.length * fontSize * 0.6));
  const height =
    options?.height ??
    (orientation === "vertical"
      ? Math.max(fontSize, content.length * fontSize * 1.1)
      : fontSize * 1.4);
  return {
    id: generateId("shape"),
    type: "shape",
    x,
    y,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    fill: "#e8eef2",
    stroke: "none",
    strokeWidth: 0,
    fontFamily: "sans-serif",
    fontWeight: "normal",
    fontStyle: "normal",
    letterSpacing: 0,
    lineHeight: 1.2,
    textAlign: "left",
    // Caller overrides (fill, fontSize, etc.) — applied before locked fields
    ...options,
    // Always win: identity + computed layout for this text object
    shapeType: "text",
    text: content,
    textOrientation: orientation,
    fontSize,
    width,
    height,
  };
}
