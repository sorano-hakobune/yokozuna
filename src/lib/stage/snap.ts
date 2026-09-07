import type { GuideLine } from "@/types/project";

export type SnapOptions = {
  gridSize: number;
  snapToGrid: boolean;
  guides?: GuideLine[];
  snapToGuides: boolean;
  /** Pixel threshold for guide magnetism (stage space). */
  guideThreshold?: number;
};

export function snapScalar(
  value: number,
  gridSize: number,
  enabled: boolean,
): number {
  if (!enabled || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap a stage-space point to grid and/or guides.
 * Guides win over grid when both attract (closer guide within threshold).
 */
export function snapPoint(
  point: { x: number; y: number },
  opts: SnapOptions,
): { x: number; y: number } {
  const threshold = opts.guideThreshold ?? 6;
  let { x, y } = point;

  if (opts.snapToGuides && opts.guides?.length) {
    let bestDx = threshold + 1;
    let bestDy = threshold + 1;
    let snapX: number | null = null;
    let snapY: number | null = null;
    for (const g of opts.guides) {
      if (g.orientation === "vertical") {
        const d = Math.abs(x - g.position);
        if (d < bestDx && d <= threshold) {
          bestDx = d;
          snapX = g.position;
        }
      } else {
        const d = Math.abs(y - g.position);
        if (d < bestDy && d <= threshold) {
          bestDy = d;
          snapY = g.position;
        }
      }
    }
    if (snapX != null) x = snapX;
    if (snapY != null) y = snapY;
  }

  if (opts.snapToGrid && opts.gridSize > 0) {
    // Only grid-snap axes that were not guide-snapped
    const guideSnappedX =
      opts.snapToGuides &&
      opts.guides?.some(
        (g) =>
          g.orientation === "vertical" &&
          Math.abs(x - g.position) < 0.001,
      );
    const guideSnappedY =
      opts.snapToGuides &&
      opts.guides?.some(
        (g) =>
          g.orientation === "horizontal" &&
          Math.abs(y - g.position) < 0.001,
      );
    if (!guideSnappedX) x = snapScalar(x, opts.gridSize, true);
    if (!guideSnappedY) y = snapScalar(y, opts.gridSize, true);
  }

  return { x, y };
}

export function defaultGridSize(settingsGrid?: number): number {
  const n = settingsGrid ?? 20;
  return n > 0 ? n : 20;
}
