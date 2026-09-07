import type { PathPoint, ShapeElement } from "@/types/project";

export type Pt = { x: number; y: number };

const EPS = 1e-8;

export function isPathPoint(p: unknown): p is PathPoint {
  return !!p && typeof p === "object" && "x" in p && "y" in p;
}

export function hasAnyHandles(points: PathPoint[] | undefined): boolean {
  if (!points) return false;
  return points.some((p) => p.handleIn || p.handleOut);
}

/** Cubic Bezier point at t. */
export function cubicAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/**
 * Absolute positions of the two cubic controls for segment i → j.
 * Falls back to linear controls when handles are missing.
 */
export function segmentControls(
  a: PathPoint,
  b: PathPoint,
): { c1: Pt; c2: Pt; curved: boolean } {
  const out = a.handleOut;
  const inn = b.handleIn;
  if (!out && !inn) {
    // Straight: controls on the chord (SVG still uses cubic-compatible API)
    return {
      c1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      c2: { x: a.x + (2 * (b.x - a.x)) / 3, y: a.y + (2 * (b.y - a.y)) / 3 },
      curved: false,
    };
  }
  return {
    c1: out ? { x: a.x + out.x, y: a.y + out.y } : { x: a.x, y: a.y },
    c2: inn ? { x: b.x + inn.x, y: b.y + inn.y } : { x: b.x, y: b.y },
    curved: true,
  };
}

/** Build SVG path `d` for a point list (optional close). */
export function pointsToPathD(
  points: PathPoint[],
  closePath = false,
): string {
  if (!points.length) return "";
  const parts: string[] = [`M${points[0]!.x} ${points[0]!.y}`];
  const n = points.length;
  const segCount = closePath && n >= 3 ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const { c1, c2, curved } = segmentControls(a, b);
    if (!curved) {
      parts.push(`L${b.x} ${b.y}`);
    } else {
      parts.push(`C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`);
    }
  }
  if (closePath && n >= 3) parts.push("Z");
  return parts.join(" ");
}

/** Full shape path `d` including subpaths. */
export function shapeToPathD(shape: ShapeElement): string {
  const primary = pointsToPathD(shape.points ?? [], !!shape.closePath);
  const subs = (shape.subpaths ?? [])
    .filter((sp) => sp.length >= 2)
    .map((sp) => pointsToPathD(sp, true))
    .join(" ");
  return `${primary} ${subs}`.trim();
}

/** Sample entire path to polyline (for hit-test / morph / export fallback). */
export function samplePathPoints(
  points: PathPoint[],
  closePath: boolean,
  stepsPerSeg = 8,
): Pt[] {
  if (points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: Pt[] = [{ x: points[0]!.x, y: points[0]!.y }];
  const n = points.length;
  const segCount = closePath && n >= 3 ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const { c1, c2, curved } = segmentControls(a, b);
    if (!curved) {
      out.push({ x: b.x, y: b.y });
    } else {
      for (let s = 1; s <= stepsPerSeg; s++) {
        out.push(cubicAt(a, c1, c2, b, s / stepsPerSeg));
      }
    }
  }
  return out;
}

/**
 * Auto-generate smooth handles (Catmull-Rom → cubic style).
 * `tension` 0 = straighter, 1 = default-ish.
 */
export function smoothPathPoints(
  points: PathPoint[],
  closePath: boolean,
  tension = 0.35,
): PathPoint[] {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ ...p }));

  const get = (i: number): PathPoint => {
    if (closePath) {
      const j = ((i % n) + n) % n;
      return points[j]!;
    }
    return points[Math.max(0, Math.min(n - 1, i))]!;
  };

  return points.map((p, i) => {
    const prev = get(i - 1);
    const next = get(i + 1);
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const handleOut = { x: dx * tension, y: dy * tension };
    const handleIn = { x: -dx * tension, y: -dy * tension };
    // Open path ends: no outward handle past ends
    if (!closePath && i === 0) {
      return {
        x: p.x,
        y: p.y,
        handleOut: {
          x: (next.x - p.x) * tension,
          y: (next.y - p.y) * tension,
        },
        smooth: true,
      };
    }
    if (!closePath && i === n - 1) {
      return {
        x: p.x,
        y: p.y,
        handleIn: {
          x: (prev.x - p.x) * tension,
          y: (prev.y - p.y) * tension,
        },
        smooth: true,
      };
    }
    return {
      x: p.x,
      y: p.y,
      handleIn,
      handleOut,
      smooth: true,
    };
  });
}

/** Clear all handles → pure polyline. */
export function flattenPathPoints(points: PathPoint[]): PathPoint[] {
  return points.map((p) => ({ x: p.x, y: p.y }));
}

/** Move vertex; keep relative handles attached. */
export function movePathVertex(
  points: PathPoint[],
  index: number,
  local: Pt,
): PathPoint[] {
  const next = points.map((p) => ({
    ...p,
    handleIn: p.handleIn ? { ...p.handleIn } : undefined,
    handleOut: p.handleOut ? { ...p.handleOut } : undefined,
  }));
  if (index < 0 || index >= next.length) return next;
  next[index] = { ...next[index]!, x: local.x, y: local.y };
  return next;
}

/**
 * Set handle (local absolute position of control point).
 * `mirror` forces opposite handle when vertex is smooth.
 */
export function setHandleAbsolute(
  points: PathPoint[],
  index: number,
  which: "in" | "out",
  abs: Pt,
  opts?: { breakSmooth?: boolean },
): PathPoint[] {
  const next = points.map((p) => ({
    ...p,
    handleIn: p.handleIn ? { ...p.handleIn } : undefined,
    handleOut: p.handleOut ? { ...p.handleOut } : undefined,
  }));
  const v = next[index];
  if (!v) return next;
  const rel = { x: abs.x - v.x, y: abs.y - v.y };
  const smooth = opts?.breakSmooth ? false : v.smooth !== false;
  if (which === "out") {
    v.handleOut = rel;
    if (smooth && (v.handleIn || v.smooth)) {
      const lenIn = v.handleIn
        ? Math.hypot(v.handleIn.x, v.handleIn.y)
        : Math.hypot(rel.x, rel.y);
      const lenOut = Math.hypot(rel.x, rel.y) || EPS;
      v.handleIn = {
        x: (-rel.x / lenOut) * lenIn,
        y: (-rel.y / lenOut) * lenIn,
      };
      v.smooth = true;
    } else if (opts?.breakSmooth) {
      v.smooth = false;
    }
  } else {
    v.handleIn = rel;
    if (smooth && (v.handleOut || v.smooth)) {
      const lenOut = v.handleOut
        ? Math.hypot(v.handleOut.x, v.handleOut.y)
        : Math.hypot(rel.x, rel.y);
      const lenIn = Math.hypot(rel.x, rel.y) || EPS;
      v.handleOut = {
        x: (-rel.x / lenIn) * lenOut,
        y: (-rel.y / lenIn) * lenOut,
      };
      v.smooth = true;
    } else if (opts?.breakSmooth) {
      v.smooth = false;
    }
  }
  next[index] = v;
  return next;
}

/** Ensure a vertex has editable handles (create defaults if missing). */
export function ensureHandles(
  points: PathPoint[],
  index: number,
  closePath: boolean,
): PathPoint[] {
  const next = points.map((p) => ({
    ...p,
    handleIn: p.handleIn ? { ...p.handleIn } : undefined,
    handleOut: p.handleOut ? { ...p.handleOut } : undefined,
  }));
  const n = next.length;
  const v = next[index];
  if (!v || n < 2) return next;
  const prev = next[(index - 1 + n) % n]!;
  const nxt = next[(index + 1) % n]!;
  const tension = 0.3;
  if (!v.handleOut && (closePath || index < n - 1)) {
    v.handleOut = {
      x: (nxt.x - v.x) * tension,
      y: (nxt.y - v.y) * tension,
    };
  }
  if (!v.handleIn && (closePath || index > 0)) {
    v.handleIn = {
      x: (prev.x - v.x) * tension,
      y: (prev.y - v.y) * tension,
    };
  }
  if (v.handleIn && v.handleOut && v.smooth === undefined) v.smooth = true;
  next[index] = v;
  return next;
}
