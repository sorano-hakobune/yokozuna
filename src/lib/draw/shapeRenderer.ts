import type { ShapeElement } from "@/types/project";
import { applyCanvasGradientFill } from "./gradient";
import { segmentControls } from "./pathBezier";

/**
 * 図形をCanvasに描画する
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement,
): void {
  ctx.save();

  ctx.translate(shape.x, shape.y);
  ctx.rotate((shape.rotation ?? 0) * (Math.PI / 180));
  ctx.scale(shape.scaleX ?? 1, shape.scaleY ?? 1);
  ctx.globalAlpha = shape.opacity ?? 1;

  const hasGrad = applyCanvasGradientFill(ctx, shape);
  if (!hasGrad && shape.fill && shape.fill !== "none") {
    ctx.fillStyle = shape.fill;
  }
  const canFill = hasGrad || (!!shape.fill && shape.fill !== "none");
  if (shape.stroke) {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth ?? 1;
  }

  switch (shape.shapeType) {
    case "rectangle":
      drawRectangle(ctx, shape, canFill);
      break;
    case "circle":
      drawCircle(ctx, shape, canFill);
      break;
    case "line":
      drawPolyOrCurve(ctx, shape, false, canFill);
      break;
    case "path":
      drawPolyOrCurve(ctx, shape, true, canFill);
      break;
  }

  ctx.restore();
}

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement,
  canFill: boolean,
): void {
  const width = shape.width ?? 100;
  const height = shape.height ?? 100;
  const x = -width / 2;
  const y = -height / 2;

  const rr = Math.max(
    0,
    Math.min(shape.cornerRadius ?? 0, Math.min(width, height) / 2),
  );
  ctx.beginPath();
  type RoundRectFn = (
    x: number,
    y: number,
    w: number,
    h: number,
    radii?: number | DOMPointInit | (number | DOMPointInit)[],
  ) => void;
  if (rr > 0 && typeof (ctx as CanvasRenderingContext2D & { roundRect?: RoundRectFn }).roundRect === "function") {
    (ctx as CanvasRenderingContext2D & { roundRect: RoundRectFn }).roundRect(
      x,
      y,
      width,
      height,
      rr,
    );
  } else if (rr > 0) {
    const r = rr;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  } else {
    ctx.rect(x, y, width, height);
  }

  if (canFill) ctx.fill();
  if (shape.stroke) ctx.stroke();
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement,
  canFill: boolean,
): void {
  const radius = shape.radius ?? 50;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  if (canFill) ctx.fill();
  if (shape.stroke) ctx.stroke();
}

/** Polyline or cubic path (handles on PathPoint). */
function drawPolyOrCurve(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement,
  allowFill: boolean,
  canFill: boolean,
): void {
  const points = shape.points;
  if (!points || points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  const n = points.length;
  const closed = !!shape.closePath && n >= 3;
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const { c1, c2, curved } = segmentControls(a, b);
    if (!curved) {
      ctx.lineTo(b.x, b.y);
    } else {
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
    }
  }
  if (closed) ctx.closePath();

  if (allowFill && canFill) ctx.fill();
  if (shape.stroke) ctx.stroke();
}
