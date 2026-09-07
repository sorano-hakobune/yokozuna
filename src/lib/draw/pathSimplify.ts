/**
 * Douglas–Peucker path simplification.
 * Preserves overall shape while reducing vertex count for freehand strokes.
 */

export type Point2 = { x: number; y: number };

function perpendicularDistance(
  p: Point2,
  a: Point2,
  b: Point2,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function douglasPeucker(
  points: Point2[],
  epsilon: number,
): Point2[] {
  if (points.length <= 2) return points.slice();

  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIndex = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIndex), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}

/**
 * Simplify a freehand polyline.
 * epsilon is in the same units as the points (stage pixels).
 * Keeps at least 2 points; never expands the path.
 */
export function simplifyPath(
  points: Point2[],
  epsilon: number = 1.25,
): Point2[] {
  if (points.length <= 2) return points.slice();

  // Adaptive: slightly higher tolerance for very dense strokes
  const density = points.length;
  let eps = epsilon;
  if (density > 200) eps = Math.max(epsilon, 1.6);
  if (density > 500) eps = Math.max(epsilon, 2.2);

  const simplified = douglasPeucker(points, eps);

  // Safety: if over-simplified to a near-straight line but original had
  // meaningful curvature, fall back to a milder pass.
  if (simplified.length < 3 && points.length > 8) {
    return douglasPeucker(points, Math.max(0.6, eps * 0.4));
  }

  return simplified.length >= 2 ? simplified : points.slice(0, 2);
}
