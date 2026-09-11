/**
 * Off-screen canvas renderer for export (no onion skin, no guides, no UI chrome).
 */
import { applyCanvasGradientFill } from "@/lib/draw/gradient";
import type {
  Element,
  Layer,
  Project,
  ShapeElement,
  Symbol,
} from "@/types/project";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { groupsInPaintOrder } from "@/lib/layers";
import { filtersToCss } from "@/lib/filters";

export type ImageCache = Map<string, HTMLImageElement | HTMLCanvasElement>;

export async function preloadProjectImages(
  project: Project,
): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  const jobs: Promise<void>[] = [];
  for (const asset of Object.values(project.assets)) {
    if (!asset.src) continue;
    jobs.push(
      loadImage(asset.src)
        .then((img) => {
          cache.set(asset.id, img);
        })
        .catch(() => {
          /* skip broken assets */
        }),
    );
  }
  await Promise.all(jobs);
  return cache;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 64)}`));
    img.src = src;
  });
}

function applyElementTransform(
  ctx: CanvasRenderingContext2D,
  el: Pick<
    Element,
    "x" | "y" | "rotation" | "scaleX" | "scaleY" | "opacity" | "filters" | "pivot"
  >,
) {
  ctx.translate(el.x, el.y);
  ctx.rotate(((el.rotation ?? 0) * Math.PI) / 180);
  ctx.scale(el.scaleX || 1, el.scaleY || 1);
  const px = el.pivot?.x ?? 0;
  const py = el.pivot?.y ?? 0;
  if (px !== 0 || py !== 0) {
    ctx.translate(-px, -py);
  }
  ctx.globalAlpha *= el.opacity ?? 1;
  if (el.filters?.length) {
    const css = filtersToCss(el.filters);
    if (css !== "none") ctx.filter = css;
  }
}

function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeElement) {
  ctx.save();
  applyElementTransform(ctx, shape);

  const hasGrad = applyCanvasGradientFill(ctx, shape);
  const fill =
    !hasGrad && shape.fill && shape.fill !== "none" ? shape.fill : undefined;
  const canFill = hasGrad || !!fill;
  const stroke =
    shape.stroke && shape.stroke !== "none" ? shape.stroke : undefined;
  const strokeWidth = shape.strokeWidth ?? 1;

  if (shape.clip?.length) {
    for (const group of shape.clip) {
      const clipPath = new Path2D();
      for (const poly of group.paths) {
        if (poly.length < 3) continue;
        clipPath.moveTo(poly[0]!.x, poly[0]!.y);
        for (let i = 1; i < poly.length; i++) {
          clipPath.lineTo(poly[i]!.x, poly[i]!.y);
        }
        clipPath.closePath();
      }
      ctx.clip(clipPath);
    }
  }

  const paint = () => {
    if (canFill) {
      if (fill) ctx.fillStyle = fill;
      ctx.fill(shape.fillRule === "evenodd" ? "evenodd" : "nonzero");
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = shape.strokeLinejoin ?? "round";
      ctx.lineCap = shape.strokeLinecap ?? "round";
      if (shape.strokeMiterlimit != null) ctx.miterLimit = shape.strokeMiterlimit;
      if (shape.strokeDasharray) ctx.setLineDash(shape.strokeDasharray);
      if (shape.strokeDashoffset != null) ctx.lineDashOffset = shape.strokeDashoffset;
      ctx.stroke();
    }
  };

  switch (shape.shapeType) {
    case "rectangle": {
      const w = shape.width ?? 100;
      const h = shape.height ?? 100;
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      paint();
      break;
    }
    case "circle": {
      const r = shape.radius ?? 50;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      paint();
      break;
    }
    case "line":
    case "path": {
      const points = shape.points ?? [];
      if (points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0]!.x, points[0]!.y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i]!.x, points[i]!.y);
        }
        if (shape.closePath) ctx.closePath();
        paint();
      }
      for (const sub of shape.subpaths ?? []) {
        if (sub.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(sub[0]!.x, sub[0]!.y);
        for (let i = 1; i < sub.length; i++) {
          ctx.lineTo(sub[i]!.x, sub[i]!.y);
        }
        ctx.closePath();
        paint();
      }
      break;
    }
    case "text": {
      const content = shape.text ?? "";
      const fontSize = shape.fontSize ?? 24;
      const vertical = shape.textOrientation === "vertical";
      const weight = shape.fontWeight ?? "normal";
      const style = shape.fontStyle ?? "normal";
      const family = shape.fontFamily ?? "sans-serif";
      const rawLh = Number(shape.lineHeight);
      const lhFactor =
        Number.isFinite(rawLh) && rawLh >= 0.5 && rawLh <= 4 ? rawLh : 1.2;
      const lh = fontSize * lhFactor;
      const lines = content.replace(/\r\n?/g, "\n").split("\n");
      ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
      ctx.fillStyle = fill ?? "#e8eef2";
      ctx.textAlign =
        shape.textAlign === "center"
          ? "center"
          : shape.textAlign === "right"
            ? "right"
            : "left";
      if (vertical) {
        // Character-by-character vertical layout (not a block rotation)
        // 改行ごとに左へ新しい列
        ctx.textBaseline = "top";
        const w = shape.width ?? fontSize * 1.4;
        const h = shape.height ?? fontSize * lhFactor;
        const startY = -h / 2;
        const ls = Number(shape.letterSpacing ?? 0) || 0;
        const step = fontSize + (ls > 0 ? ls : 0);
        lines.forEach((col, colIdx) => {
          const x = w / 2 - lh / 2 - colIdx * lh;
          const chars = Array.from(col);
          if (chars.length === 0) return;
          chars.forEach((ch, i) => {
            ctx.fillText(ch, x, startY + i * step);
          });
        });
      } else {
        ctx.textBaseline = "middle";
        const firstY = -((lines.length - 1) * lh) / 2;
        const x =
          ctx.textAlign === "center"
            ? 0
            : ctx.textAlign === "right"
              ? (shape.width ?? 0) / 2
              : -(shape.width ?? 0) / 2;
        lines.forEach((line, i) => {
          ctx.fillText(line === "" ? " " : line, x, firstY + i * lh);
        });
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

function drawBitmap(
  ctx: CanvasRenderingContext2D,
  el: Element & { type: "bitmap" },
  project: Project,
  cache: ImageCache,
) {
  const asset = project.assets[el.assetId];
  if (!asset) return;
  const img = cache.get(el.assetId);
  if (!img) return;
  const w = asset.width ?? img.width;
  const h = asset.height ?? img.height;
  ctx.save();
  applyElementTransform(ctx, el);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawInstance(
  ctx: CanvasRenderingContext2D,
  el: Element & { type: "instance" },
  project: Project,
  cache: ImageCache,
  parentFrame: number,
) {
  const symbol = project.symbols[el.symbolId];
  if (!symbol) return;
  const symFrame =
    symbol.type === "graphic"
      ? Math.min(parentFrame, Math.max(0, symbol.duration - 1))
      : 0;

  ctx.save();
  applyElementTransform(ctx, el);
  drawLayers(ctx, symbol.layers, project, cache, symFrame, symbol);
  ctx.restore();
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: Element,
  project: Project,
  cache: ImageCache,
  frame: number,
) {
  if (el.type === "shape") {
    drawShape(ctx, el);
  } else if (el.type === "bitmap") {
    drawBitmap(ctx, el, project, cache);
  } else if (el.type === "instance") {
    drawInstance(ctx, el, project, cache, frame);
  }
}

function drawLayerContent(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  project: Project,
  cache: ImageCache,
  frame: number,
) {
  if (!layer.visible) return;
  const elements = getElementsAtFrame(layer.keyframes, frame);
  for (const el of elements) {
    drawElement(ctx, el, project, cache, frame);
  }
}

function drawLayers(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  project: Project,
  cache: ImageCache,
  frame: number,
  _symbol?: Symbol,
) {
  for (const group of groupsInPaintOrder(layers)) {
    if (group.kind === "guide") continue; // skip guides on export

    if (group.kind === "normal") {
      for (const layer of [...group.layers].reverse()) {
        drawLayerContent(ctx, layer, project, cache, frame);
      }
      continue;
    }

    // Mask group: draw masked content into temp canvas, mask with mask shapes
    const { mask, masked } = group;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    const content = document.createElement("canvas");
    content.width = w;
    content.height = h;
    const cctx = content.getContext("2d");
    if (!cctx) continue;

    for (const layer of [...masked].reverse()) {
      drawLayerContent(cctx, layer, project, cache, frame);
    }

    if (mask.visible) {
      cctx.globalCompositeOperation = "destination-in";
      // Draw mask shapes as opaque alpha
      const elements = getElementsAtFrame(mask.keyframes, frame);
      for (const el of elements) {
        if (el.type === "shape") {
          const forced: ShapeElement = {
            ...el,
            fill: "#ffffff",
            stroke: "none",
            opacity: 1,
          };
          drawShape(cctx, forced);
        } else if (el.type === "bitmap") {
          drawBitmap(cctx, el, project, cache);
        } else if (el.type === "instance") {
          // Approximate instance as solid rect via symbol bounds
          const symbol = project.symbols[el.symbolId];
          if (!symbol) continue;
          cctx.save();
          applyElementTransform(cctx, el);
          cctx.fillStyle = "#ffffff";
          cctx.fillRect(
            -(symbol.width || 100) / 2,
            -(symbol.height || 100) / 2,
            symbol.width || 100,
            symbol.height || 100,
          );
          cctx.restore();
        }
      }
    }

    ctx.drawImage(content, 0, 0);
  }
}

export function renderCompositionFrame(
  project: Project,
  layers: Layer[],
  frame: number,
  cache: ImageCache,
  options?: {
    width?: number;
    height?: number;
    /** Solid color, or "transparent" / null to leave alpha clear */
    backgroundColor?: string | null;
    transparent?: boolean;
    scale?: number;
  },
): HTMLCanvasElement {
  const scale = Math.max(0.1, options?.scale ?? 1);
  const width = Math.max(
    1,
    Math.round((options?.width ?? project.settings.width) * scale),
  );
  const height = Math.max(
    1,
    Math.round((options?.height ?? project.settings.height) * scale),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Background — transparent export skips the fill
  const transparent =
    options?.transparent === true ||
    options?.backgroundColor === "transparent" ||
    options?.backgroundColor === null;
  if (transparent) {
    ctx.clearRect(0, 0, width, height);
  } else {
    const bg =
      options?.backgroundColor ??
      project.settings.backgroundColor ??
      "#ffffff";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.save();
  ctx.scale(scale, scale);
  drawLayers(ctx, layers, project, cache, frame);
  ctx.restore();

  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob failed"));
      },
      "image/png",
    );
  });
}
