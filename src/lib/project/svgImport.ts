import type { ShapeElement } from "@/types/project";
import { generateId } from "./generateId";

export type SvgImportShape = Omit<
  ShapeElement,
  "id" | "x" | "y" | "scaleX" | "scaleY" | "rotation" | "opacity"
> & {
  /** Local-space geometry; caller places with x/y. */
  localX: number;
  localY: number;
};

export type SvgImportResult = {
  width: number;
  height: number;
  viewBox: { x: number; y: number; width: number; height: number };
  shapes: SvgImportShape[];
  /** True when at least one vector primitive was parsed. */
  hasVectors: boolean;
};

type Pt = { x: number; y: number };

const DEFAULT_FILL = "#3b82f6";
const DEFAULT_STROKE = "#1d4ed8";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: string | null | undefined, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

function styleMap(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  const style = attr(el, "style");
  if (style) {
    for (const part of style.split(";")) {
      const [k, ...rest] = part.split(":");
      if (!k || rest.length === 0) continue;
      out[k.trim().toLowerCase()] = rest.join(":").trim();
    }
  }
  return out;
}

function resolvePaint(
  el: Element,
  kind: "fill" | "stroke",
  inherited?: { fill?: string; stroke?: string; strokeWidth?: number },
): string | undefined {
  const styles = styleMap(el);
  const raw =
    attr(el, kind) ??
    styles[kind] ??
    (kind === "fill" ? inherited?.fill : inherited?.stroke);
  if (raw == null || raw === "" || raw === "none") {
    if (kind === "fill" && raw === "none") return undefined;
    if (kind === "fill" && raw == null && !inherited?.fill) return DEFAULT_FILL;
    if (raw === "none") return undefined;
    return kind === "fill" ? inherited?.fill : inherited?.stroke;
  }
  // url(#...) gradients → solid fallback
  if (/^url\(/i.test(raw)) {
    return kind === "fill" ? DEFAULT_FILL : DEFAULT_STROKE;
  }
  return raw;
}

function resolveStrokeWidth(
  el: Element,
  inherited?: number,
): number | undefined {
  const styles = styleMap(el);
  const raw = attr(el, "stroke-width") ?? styles["stroke-width"];
  if (raw == null || raw === "") return inherited;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : inherited;
}

/** Parse a minimal subset of SVG transform: translate, scale, matrix, rotate. */
function parseTransform(raw: string | null): {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
} {
  let a = 1,
    b = 0,
    c = 0,
    d = 1,
    e = 0,
    f = 0;
  if (!raw) return { a, b, c, d, e, f };

  const multiply = (
    a2: number,
    b2: number,
    c2: number,
    d2: number,
    e2: number,
    f2: number,
  ) => {
    const na = a * a2 + c * b2;
    const nb = b * a2 + d * b2;
    const nc = a * c2 + c * d2;
    const nd = b * c2 + d * d2;
    const ne = a * e2 + c * f2 + e;
    const nf = b * e2 + d * f2 + f;
    a = na;
    b = nb;
    c = nc;
    d = nd;
    e = ne;
    f = nf;
  };

  const re =
    /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const kind = m[1]!.toLowerCase();
    const args = m[2]!
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(parseFloat);
    if (kind === "matrix" && args.length >= 6) {
      multiply(args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!);
    } else if (kind === "translate") {
      multiply(1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0);
    } else if (kind === "scale") {
      const sx = args[0] ?? 1;
      const sy = args[1] ?? sx;
      multiply(sx, 0, 0, sy, 0, 0);
    } else if (kind === "rotate") {
      const ang = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      if (cx || cy) multiply(1, 0, 0, 1, cx, cy);
      multiply(cos, sin, -sin, cos, 0, 0);
      if (cx || cy) multiply(1, 0, 0, 1, -cx, -cy);
    }
  }
  return { a, b, c, d, e, f };
}

function applyMatrix(
  mat: { a: number; b: number; c: number; d: number; e: number; f: number },
  x: number,
  y: number,
): Pt {
  return {
    x: mat.a * x + mat.c * y + mat.e,
    y: mat.b * x + mat.d * y + mat.f,
  };
}

function combineMatrix(
  parent: ReturnType<typeof parseTransform>,
  local: string | null,
): ReturnType<typeof parseTransform> {
  const m = parseTransform(local);
  // parent * local
  return {
    a: parent.a * m.a + parent.c * m.b,
    b: parent.b * m.a + parent.d * m.b,
    c: parent.a * m.c + parent.c * m.d,
    d: parent.b * m.c + parent.d * m.d,
    e: parent.a * m.e + parent.c * m.f + parent.e,
    f: parent.b * m.e + parent.d * m.f + parent.f,
  };
}

// ---------------------------------------------------------------------------
// Path data → polyline points (curves sampled)
// ---------------------------------------------------------------------------

function sampleCubic(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  steps = 8,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * p0.x +
        3 * u * u * t * p1.x +
        3 * u * t * t * p2.x +
        t * t * t * p3.x,
      y:
        u * u * u * p0.y +
        3 * u * u * t * p1.y +
        3 * u * t * t * p2.y +
        t * t * t * p3.y,
    });
  }
  return out;
}

function sampleQuadratic(p0: Pt, p1: Pt, p2: Pt, steps = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    });
  }
  return out;
}

/** Tokenize SVG path `d` into command + number args. */
function tokenizePath(d: string): Array<{ cmd: string; args: number[] }> {
  const tokens: Array<{ cmd: string; args: number[] }> = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let current: { cmd: string; args: number[] } | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d))) {
    if (match[1]) {
      if (current) tokens.push(current);
      current = { cmd: match[1], args: [] };
    } else if (match[2] && current) {
      current.args.push(parseFloat(match[2]));
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function pathDToSubpaths(d: string, mat: ReturnType<typeof parseTransform>): {
  subpaths: Pt[][];
  closed: boolean[];
} {
  const tokens = tokenizePath(d);
  const subpaths: Pt[][] = [];
  const closed: boolean[] = [];
  let current: Pt[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrl: Pt | null = null;
  let lastCmd = "";

  const pushPoint = (x: number, y: number) => {
    const p = applyMatrix(mat, x, y);
    current.push(p);
    cx = x;
    cy = y;
  };

  const ensureSub = () => {
    if (current.length) {
      subpaths.push(current);
      closed.push(false);
      current = [];
    }
  };

  for (const tok of tokens) {
    const cmd = tok.cmd;
    const a = tok.args;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === "M") {
      ensureSub();
      for (let i = 0; i + 1 < a.length; i += 2) {
        const x = rel ? cx + a[i]! : a[i]!;
        const y = rel ? cy + a[i + 1]! : a[i + 1]!;
        if (i === 0) {
          pushPoint(x, y);
          startX = x;
          startY = y;
        } else {
          // implicit L
          pushPoint(x, y);
        }
      }
      lastCtrl = null;
    } else if (C === "L") {
      for (let i = 0; i + 1 < a.length; i += 2) {
        const x = rel ? cx + a[i]! : a[i]!;
        const y = rel ? cy + a[i + 1]! : a[i + 1]!;
        pushPoint(x, y);
      }
      lastCtrl = null;
    } else if (C === "H") {
      for (const v of a) {
        const x = rel ? cx + v : v;
        pushPoint(x, cy);
      }
      lastCtrl = null;
    } else if (C === "V") {
      for (const v of a) {
        const y = rel ? cy + v : v;
        pushPoint(cx, y);
      }
      lastCtrl = null;
    } else if (C === "C") {
      for (let i = 0; i + 5 < a.length; i += 6) {
        const x1 = rel ? cx + a[i]! : a[i]!;
        const y1 = rel ? cy + a[i + 1]! : a[i + 1]!;
        const x2 = rel ? cx + a[i + 2]! : a[i + 2]!;
        const y2 = rel ? cy + a[i + 3]! : a[i + 3]!;
        const x = rel ? cx + a[i + 4]! : a[i + 4]!;
        const y = rel ? cy + a[i + 5]! : a[i + 5]!;
        const p0 = { x: cx, y: cy };
        const samples = sampleCubic(p0, { x: x1, y: y1 }, { x: x2, y: y2 }, {
          x,
          y,
        });
        for (const s of samples) {
          const p = applyMatrix(mat, s.x, s.y);
          current.push(p);
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x2, y: y2 };
      }
    } else if (C === "S") {
      for (let i = 0; i + 3 < a.length; i += 4) {
        let x1 = cx;
        let y1 = cy;
        if (lastCtrl && (lastCmd === "C" || lastCmd === "S")) {
          x1 = 2 * cx - lastCtrl.x;
          y1 = 2 * cy - lastCtrl.y;
        }
        const x2 = rel ? cx + a[i]! : a[i]!;
        const y2 = rel ? cy + a[i + 1]! : a[i + 1]!;
        const x = rel ? cx + a[i + 2]! : a[i + 2]!;
        const y = rel ? cy + a[i + 3]! : a[i + 3]!;
        const samples = sampleCubic(
          { x: cx, y: cy },
          { x: x1, y: y1 },
          { x: x2, y: y2 },
          { x, y },
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x2, y: y2 };
      }
    } else if (C === "Q") {
      for (let i = 0; i + 3 < a.length; i += 4) {
        const x1 = rel ? cx + a[i]! : a[i]!;
        const y1 = rel ? cy + a[i + 1]! : a[i + 1]!;
        const x = rel ? cx + a[i + 2]! : a[i + 2]!;
        const y = rel ? cy + a[i + 3]! : a[i + 3]!;
        const samples = sampleQuadratic(
          { x: cx, y: cy },
          { x: x1, y: y1 },
          { x, y },
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x1, y: y1 };
      }
    } else if (C === "T") {
      for (let i = 0; i + 1 < a.length; i += 2) {
        let x1 = cx;
        let y1 = cy;
        if (lastCtrl && (lastCmd === "Q" || lastCmd === "T")) {
          x1 = 2 * cx - lastCtrl.x;
          y1 = 2 * cy - lastCtrl.y;
        }
        const x = rel ? cx + a[i]! : a[i]!;
        const y = rel ? cy + a[i + 1]! : a[i + 1]!;
        const samples = sampleQuadratic(
          { x: cx, y: cy },
          { x: x1, y: y1 },
          { x, y },
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
        lastCtrl = { x: x1, y: y1 };
      }
    } else if (C === "A") {
      // Arc: approximate with line segments via endpoint parameterization (simplified)
      for (let i = 0; i + 6 < a.length; i += 7) {
        const x = rel ? cx + a[i + 5]! : a[i + 5]!;
        const y = rel ? cy + a[i + 6]! : a[i + 6]!;
        // Cheap approximation: sample along chord with a bulge via mid control
        const mx = (cx + x) / 2;
        const my = (cy + y) / 2;
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const large = a[i + 3]! !== 0;
        const sweep = a[i + 4]! !== 0;
        const bulge = (large ? 0.55 : 0.25) * (sweep ? 1 : -1);
        const ox = (-dy / len) * len * bulge;
        const oy = (dx / len) * len * bulge;
        const samples = sampleQuadratic(
          { x: cx, y: cy },
          { x: mx + ox, y: my + oy },
          { x, y },
          10,
        );
        for (const s of samples) {
          current.push(applyMatrix(mat, s.x, s.y));
        }
        cx = x;
        cy = y;
      }
      lastCtrl = null;
    } else if (C === "Z") {
      if (current.length) {
        current.push(applyMatrix(mat, startX, startY));
        subpaths.push(current);
        closed.push(true);
        current = [];
      }
      cx = startX;
      cy = startY;
      lastCtrl = null;
    }
    lastCmd = C;
  }
  ensureSub();
  return { subpaths, closed };
}

// ---------------------------------------------------------------------------
// Element collectors
// ---------------------------------------------------------------------------

type Inherited = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
};

function makePathShape(
  points: Pt[],
  closed: boolean,
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  extraSubpaths?: Pt[][],
): SvgImportShape | null {
  if (points.length < 2) return null;
  // Center geometry at local origin for easier placement
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const consider = (p: Pt) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const p of points) consider(p);
  for (const sp of extraSubpaths ?? []) for (const p of sp) consider(p);
  if (!Number.isFinite(minX)) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const shift = (pts: Pt[]) => pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));

  return {
    type: "shape",
    shapeType: "path",
    localX: cx,
    localY: cy,
    points: shift(points),
    subpaths: extraSubpaths?.length
      ? extraSubpaths.map(shift)
      : undefined,
    closePath: closed,
    fill,
    stroke,
    strokeWidth: strokeWidth ?? (stroke ? 1 : undefined),
    fillRule: "nonzero",
  };
}

function collectFromElement(
  el: Element,
  parentMat: ReturnType<typeof parseTransform>,
  inherited: Inherited,
  out: SvgImportShape[],
): void {
  const tag = el.tagName.toLowerCase().replace(/^svg:/, "");
  if (
    tag === "defs" ||
    tag === "clippath" ||
    tag === "mask" ||
    tag === "title" ||
    tag === "desc" ||
    tag === "metadata" ||
    tag === "style" ||
    tag === "script"
  ) {
    return;
  }

  const mat = combineMatrix(parentMat, attr(el, "transform"));
  const fill = resolvePaint(el, "fill", inherited);
  const stroke = resolvePaint(el, "stroke", inherited);
  const strokeWidth = resolveStrokeWidth(el, inherited.strokeWidth);
  const nextInherited: Inherited = { fill, stroke, strokeWidth };

  if (tag === "g" || tag === "svg" || tag === "a") {
    for (const child of Array.from(el.children)) {
      collectFromElement(child, mat, nextInherited, out);
    }
    return;
  }

  if (tag === "path") {
    const d = attr(el, "d");
    if (!d) return;
    const { subpaths, closed } = pathDToSubpaths(d, mat);
    if (!subpaths.length) return;
    const primary = subpaths[0]!;
    const extras = subpaths.slice(1);
    const shape = makePathShape(
      primary,
      closed[0] ?? true,
      fill,
      stroke,
      strokeWidth,
      extras.length ? extras : undefined,
    );
    if (shape) out.push(shape);
    return;
  }

  if (tag === "rect") {
    const x = num(attr(el, "x"));
    const y = num(attr(el, "y"));
    const w = num(attr(el, "width"));
    const h = num(attr(el, "height"));
    if (w <= 0 || h <= 0) return;
    const rx = Math.min(num(attr(el, "rx")), w / 2);
    const ry = Math.min(num(attr(el, "ry"), rx), h / 2);
    // Transform corners (ignore heavy rounded for matrix; sample if rx)
    const corners: Pt[] = [
      applyMatrix(mat, x, y),
      applyMatrix(mat, x + w, y),
      applyMatrix(mat, x + w, y + h),
      applyMatrix(mat, x, y + h),
    ];
    if (rx > 0 || ry > 0) {
      // Approximate rounded rect in local space then transform samples
      const pts: Pt[] = [];
      const steps = 4;
      const arcs: Array<[number, number, number, number]> = [
        [x + w - rx, y + ry, -Math.PI / 2, 0],
        [x + w - rx, y + h - ry, 0, Math.PI / 2],
        [x + rx, y + h - ry, Math.PI / 2, Math.PI],
        [x + rx, y + ry, Math.PI, (3 * Math.PI) / 2],
      ];
      for (const [cx, cy, a0, a1] of arcs) {
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const a = a0 + (a1 - a0) * t;
          pts.push(applyMatrix(mat, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
        }
      }
      const shape = makePathShape(pts, true, fill, stroke, strokeWidth);
      if (shape) out.push(shape);
    } else {
      // Keep as rectangle if axis-aligned enough; else path
      const shape = makePathShape(corners, true, fill, stroke, strokeWidth);
      if (shape) {
        // Prefer native rect when no rotation/skew in matrix
        if (
          Math.abs(mat.b) < 1e-6 &&
          Math.abs(mat.c) < 1e-6 &&
          mat.a > 0 &&
          mat.d > 0
        ) {
          out.push({
            type: "shape",
            shapeType: "rectangle",
            localX: (corners[0]!.x + corners[2]!.x) / 2,
            localY: (corners[0]!.y + corners[2]!.y) / 2,
            width: w * mat.a,
            height: h * mat.d,
            fill,
            stroke,
            strokeWidth: strokeWidth ?? (stroke ? 1 : undefined),
          });
        } else if (shape) {
          out.push(shape);
        }
      }
    }
    return;
  }

  if (tag === "circle") {
    const cx = num(attr(el, "cx"));
    const cy = num(attr(el, "cy"));
    const r = num(attr(el, "r"));
    if (r <= 0) return;
    if (
      Math.abs(mat.b) < 1e-6 &&
      Math.abs(mat.c) < 1e-6 &&
      Math.abs(mat.a - mat.d) < 1e-6
    ) {
      const c = applyMatrix(mat, cx, cy);
      out.push({
        type: "shape",
        shapeType: "circle",
        localX: c.x,
        localY: c.y,
        radius: r * Math.abs(mat.a),
        fill,
        stroke,
        strokeWidth: strokeWidth ?? (stroke ? 1 : undefined),
      });
    } else {
      const pts: Pt[] = [];
      const n = 32;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push(applyMatrix(mat, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      const shape = makePathShape(pts, true, fill, stroke, strokeWidth);
      if (shape) out.push(shape);
    }
    return;
  }

  if (tag === "ellipse") {
    const cx = num(attr(el, "cx"));
    const cy = num(attr(el, "cy"));
    const rx = num(attr(el, "rx"));
    const ry = num(attr(el, "ry"));
    if (rx <= 0 || ry <= 0) return;
    const pts: Pt[] = [];
    const n = 32;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(
        applyMatrix(mat, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry),
      );
    }
    const shape = makePathShape(pts, true, fill, stroke, strokeWidth);
    if (shape) out.push(shape);
    return;
  }

  if (tag === "line") {
    const x1 = num(attr(el, "x1"));
    const y1 = num(attr(el, "y1"));
    const x2 = num(attr(el, "x2"));
    const y2 = num(attr(el, "y2"));
    const p1 = applyMatrix(mat, x1, y1);
    const p2 = applyMatrix(mat, x2, y2);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    out.push({
      type: "shape",
      shapeType: "line",
      localX: cx,
      localY: cy,
      points: [
        { x: p1.x - cx, y: p1.y - cy },
        { x: p2.x - cx, y: p2.y - cy },
      ],
      fill: undefined,
      stroke: stroke ?? DEFAULT_STROKE,
      strokeWidth: strokeWidth ?? 2,
    });
    return;
  }

  if (tag === "polyline" || tag === "polygon") {
    const raw = attr(el, "points") ?? "";
    const nums = raw
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat)
      .filter((n) => Number.isFinite(n));
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pts.push(applyMatrix(mat, nums[i]!, nums[i + 1]!));
    }
    const shape = makePathShape(
      pts,
      tag === "polygon",
      fill,
      stroke,
      strokeWidth,
    );
    if (shape) out.push(shape);
    return;
  }

  // Unknown: still walk children if any
  for (const child of Array.from(el.children)) {
    collectFromElement(child, mat, nextInherited, out);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function parseViewBox(
  svg: Element,
): { x: number; y: number; width: number; height: number } {
  const vb = attr(svg, "viewBox");
  if (vb) {
    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map(parseFloat);
    if (parts.length >= 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        x: parts[0]!,
        y: parts[1]!,
        width: parts[2]!,
        height: parts[3]!,
      };
    }
  }
  const width = num(attr(svg, "width"), 100);
  const height = num(attr(svg, "height"), 100);
  return { x: 0, y: 0, width, height };
}

/**
 * Parse an SVG document string into vector shapes usable by the editor.
 * Supports path / rect / circle / ellipse / line / polyline / polygon and
 * nested groups with basic transforms.
 */
export function parseSvgToShapes(svgText: string): SvgImportResult {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("SVG の解析に失敗しました");
  }
  const svg =
    doc.querySelector("svg") ??
    (doc.documentElement?.tagName.toLowerCase() === "svg"
      ? doc.documentElement
      : null);
  if (!svg) {
    throw new Error("SVG ルート要素が見つかりません");
  }

  const viewBox = parseViewBox(svg);
  const shapes: SvgImportShape[] = [];
  const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  collectFromElement(svg, identity, {}, shapes);

  return {
    width: viewBox.width || 100,
    height: viewBox.height || 100,
    viewBox,
    shapes,
    hasVectors: shapes.length > 0,
  };
}

/** Read SVG file text (handles UTF-8). */
export async function readSvgText(file: File): Promise<string> {
  return file.text();
}

/**
 * Convert parsed import shapes into full ShapeElements centered at (cx, cy).
 * `offset` shifts by the SVG viewBox origin so content lands on stage correctly.
 */
export function materializeSvgShapes(
  result: SvgImportResult,
  cx: number,
  cy: number,
): ShapeElement[] {
  const ox = result.viewBox.x + result.viewBox.width / 2;
  const oy = result.viewBox.y + result.viewBox.height / 2;
  return result.shapes.map((s) => {
    const { localX, localY, ...rest } = s;
    return {
      ...rest,
      id: generateId("shape"),
      x: cx + (localX - ox),
      y: cy + (localY - oy),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    } as ShapeElement;
  });
}

export function isSvgFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/svg+xml" ||
    name.endsWith(".svg") ||
    file.type === "text/xml" && name.endsWith(".svg")
  );
}
