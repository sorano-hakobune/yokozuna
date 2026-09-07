import type { GradientFill, GradientStop, ShapeElement } from "@/types/project";

export function defaultLinearGradient(
  c0 = "#e05a3c",
  c1 = "#3d7eb8",
): GradientFill {
  return {
    type: "linear",
    x1: 0,
    y1: 0.5,
    x2: 1,
    y2: 0.5,
    stops: [
      { offset: 0, color: c0 },
      { offset: 1, color: c1 },
    ],
  };
}

export function defaultRadialGradient(
  c0 = "#e8eef2",
  c1 = "#e05a3c",
): GradientFill {
  return {
    type: "radial",
    cx: 0.5,
    cy: 0.5,
    r: 0.6,
    stops: [
      { offset: 0, color: c0 },
      { offset: 1, color: c1 },
    ],
  };
}

/** Local AABB of a shape in its own transform space (origin at element pivot). */
export function shapeLocalBounds(shape: ShapeElement): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (shape.shapeType === "rectangle") {
    const w = shape.width ?? 100;
    const h = shape.height ?? 100;
    return { minX: -w / 2, minY: -h / 2, maxX: w / 2, maxY: h / 2, width: w, height: h };
  }
  if (shape.shapeType === "circle") {
    const r = shape.radius ?? 50;
    return { minX: -r, minY: -r, maxX: r, maxY: r, width: r * 2, height: r * 2 };
  }
  if (shape.shapeType === "text") {
    const size = shape.fontSize ?? 24;
    const text = shape.text ?? "";
    const w = Math.max(size, text.length * size * 0.6);
    const h = size * (shape.lineHeight ?? 1.2);
    return { minX: 0, minY: -size * 0.8, maxX: w, maxY: h - size * 0.8, width: w, height: h };
  }
  const pts = shape.points ?? [];
  if (pts.length === 0) {
    return { minX: -50, minY: -50, maxX: 50, maxY: 50, width: 100, height: 100 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    if (p.handleIn) {
      minX = Math.min(minX, p.x + p.handleIn.x);
      minY = Math.min(minY, p.y + p.handleIn.y);
      maxX = Math.max(maxX, p.x + p.handleIn.x);
      maxY = Math.max(maxY, p.y + p.handleIn.y);
    }
    if (p.handleOut) {
      minX = Math.min(minX, p.x + p.handleOut.x);
      minY = Math.min(minY, p.y + p.handleOut.y);
      maxX = Math.max(maxX, p.x + p.handleOut.x);
      maxY = Math.max(maxY, p.y + p.handleOut.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: -50, minY: -50, maxX: 50, maxY: 50, width: 100, height: 100 };
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { minX, minY, maxX, maxY, width, height };
}

function mapUnit(
  u: number,
  v: number,
  b: ReturnType<typeof shapeLocalBounds>,
): { x: number; y: number } {
  return {
    x: b.minX + u * b.width,
    y: b.minY + v * b.height,
  };
}

/** Apply gradient as Canvas fillStyle in current local transform. */
export function applyCanvasGradientFill(
  ctx: CanvasRenderingContext2D,
  shape: ShapeElement,
): boolean {
  const g = shape.fillGradient;
  if (!g || !g.stops?.length) return false;
  const b = shapeLocalBounds(shape);
  let grad: CanvasGradient;
  if (g.type === "linear") {
    const a = mapUnit(g.x1, g.y1, b);
    const c = mapUnit(g.x2, g.y2, b);
    grad = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
  } else {
    const c = mapUnit(g.cx, g.cy, b);
    const r = Math.max(0.5, g.r * Math.max(b.width, b.height));
    grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
  }
  const stops = [...g.stops].sort((a, b) => a.offset - b.offset);
  for (const s of stops) {
    try {
      grad.addColorStop(
        Math.max(0, Math.min(1, s.offset)),
        s.color || "#000000",
      );
    } catch {
      /* ignore invalid stop */
    }
  }
  ctx.fillStyle = grad;
  return true;
}

/** SVG gradient element markup pieces for <defs>. */
export function svgGradientDef(
  id: string,
  gradient: GradientFill,
): { tag: "linearGradient" | "radialGradient"; attrs: Record<string, string>; stops: GradientStop[] } {
  const stops = [...gradient.stops].sort((a, b) => a.offset - b.offset);
  if (gradient.type === "linear") {
    return {
      tag: "linearGradient",
      attrs: {
        id,
        x1: String(gradient.x1),
        y1: String(gradient.y1),
        x2: String(gradient.x2),
        y2: String(gradient.y2),
        gradientUnits: "objectBoundingBox",
      },
      stops,
    };
  }
  return {
    tag: "radialGradient",
    attrs: {
      id,
      cx: String(gradient.cx),
      cy: String(gradient.cy),
      r: String(gradient.r),
      gradientUnits: "objectBoundingBox",
    },
    stops,
  };
}

export function resolveFillPaint(
  shape: ShapeElement,
  isMask: boolean,
): { solid?: string; gradientId?: string } {
  if (isMask) return { solid: "#ffffff" };
  if (shape.fillGradient && shape.fillGradient.stops?.length) {
    return { gradientId: `grad-${shape.id}` };
  }
  const f = shape.fill;
  if (!f || f === "none") return {};
  return { solid: f };
}

export function lerpGradient(
  a: GradientFill | undefined,
  b: GradientFill | undefined,
  t: number,
  lerpColor: (c0?: string, c1?: string, tt?: number) => string | undefined,
): GradientFill | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  if (a.type !== b.type) return t < 0.5 ? a : b;

  const stopCount = Math.max(a.stops.length, b.stops.length, 2);
  const stops: GradientStop[] = [];
  for (let i = 0; i < stopCount; i++) {
    const sa = a.stops[Math.min(i, a.stops.length - 1)]!;
    const sb = b.stops[Math.min(i, b.stops.length - 1)]!;
    stops.push({
      offset: sa.offset + (sb.offset - sa.offset) * t,
      color: lerpColor(sa.color, sb.color, t) ?? sa.color,
    });
  }

  if (a.type === "linear" && b.type === "linear") {
    return {
      type: "linear",
      x1: a.x1 + (b.x1 - a.x1) * t,
      y1: a.y1 + (b.y1 - a.y1) * t,
      x2: a.x2 + (b.x2 - a.x2) * t,
      y2: a.y2 + (b.y2 - a.y2) * t,
      stops,
    };
  }
  if (a.type === "radial" && b.type === "radial") {
    return {
      type: "radial",
      cx: a.cx + (b.cx - a.cx) * t,
      cy: a.cy + (b.cy - a.cy) * t,
      r: a.r + (b.r - a.r) * t,
      stops,
    };
  }
  return a;
}
