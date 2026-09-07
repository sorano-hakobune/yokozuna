import type { ShapeElement } from "@/types/project";

/**
 * 図形をCanvasに描画する
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement
): void {
  ctx.save();

  // 変換を適用
  ctx.translate(shape.x, shape.y);
  ctx.rotate((shape.rotation ?? 0) * (Math.PI / 180));
  ctx.scale(shape.scaleX ?? 1, shape.scaleY ?? 1);
  ctx.globalAlpha = shape.opacity ?? 1;

  // スタイルを設定
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
  }
  if (shape.stroke) {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth ?? 1;
  }

  // 図形タイプに応じて描画
  switch (shape.shapeType) {
    case "rectangle":
      drawRectangle(ctx, shape);
      break;
    case "circle":
      drawCircle(ctx, shape);
      break;
    case "line":
      drawLine(ctx, shape);
      break;
    case "path":
      drawPath(ctx, shape);
      break;
  }

  ctx.restore();
}

function drawRectangle(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement
): void {
  const width = shape.width ?? 100;
  const height = shape.height ?? 100;
  const x = -width / 2;
  const y = -height / 2;

  ctx.beginPath();
  ctx.rect(x, y, width, height);

  if (shape.fill) {
    ctx.fill();
  }
  if (shape.stroke) {
    ctx.stroke();
  }
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement
): void {
  const radius = shape.radius ?? 50;

  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);

  if (shape.fill) {
    ctx.fill();
  }
  if (shape.stroke) {
    ctx.stroke();
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement
): void {
  const points = shape.points;
  if (!points || points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  if (shape.stroke) {
    ctx.stroke();
  }
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement
): void {
  const points = shape.points;
  if (!points || points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  if (shape.closePath) {
    ctx.closePath();
  }

  if (shape.fill) {
    ctx.fill();
  }
  if (shape.stroke) {
    ctx.stroke();
  }
}
