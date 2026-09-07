import type { ShapeElement } from "@/types/project";
import { generateId } from "@/lib/id";
import polygonClipping from "polygon-clipping";

type Point = { x: number; y: number };

const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const parameter = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
        ),
      )
    : 0;
  return Math.hypot(
    point.x - (start.x + parameter * dx),
    point.y - (start.y + parameter * dy),
  );
};

const toLocalPoint = (point: Point, shape: ShapeElement): Point => {
  const dx = point.x - shape.x;
  const dy = point.y - shape.y;
  const angle = ((shape.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: (dx * cos + dy * sin) / (shape.scaleX || 1),
    y: (-dx * sin + dy * cos) / (shape.scaleY || 1),
  };
};

const getShapeOutline = (shape: ShapeElement): Point[] | null => {
  if (shape.shapeType === "line" || shape.shapeType === "path") {
    if (!shape.points || shape.points.length < 2) return null;
    return shape.closePath ? [...shape.points, shape.points[0]] : shape.points;
  }
  if (shape.shapeType === "rectangle") {
    const width = shape.width ?? 100;
    const height = shape.height ?? 100;
    return [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 },
      { x: -width / 2, y: -height / 2 },
    ];
  }
  if (shape.shapeType === "circle") {
    const radius = shape.radius ?? 50;
    return Array.from({ length: 97 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
  }
  return null;
};

const getClosedShapeOutline = (shape: ShapeElement): Point[] | null => {
  if (shape.shapeType === "rectangle" || shape.shapeType === "circle") {
    return getShapeOutline(shape);
  }
  if (shape.shapeType === "path" && shape.closePath && shape.points) {
    return shape.points;
  }
  return null;
};

const createEraserPolygon = (
  start: Point,
  end: Point,
  radius: number,
): Point[] => {
  const direction = Math.atan2(end.y - start.y, end.x - start.x);
  const normal = {
    x: -Math.sin(direction) * radius,
    y: Math.cos(direction) * radius,
  };
  const points: Point[] = [
    { x: start.x + normal.x, y: start.y + normal.y },
    { x: end.x + normal.x, y: end.y + normal.y },
  ];
  for (let index = 0; index <= 12; index += 1) {
    const angle = direction + Math.PI / 2 - (Math.PI * index) / 12;
    points.push({
      x: end.x + Math.cos(angle) * radius,
      y: end.y + Math.sin(angle) * radius,
    });
  }
  for (let index = 0; index <= 12; index += 1) {
    const angle = direction - Math.PI / 2 - (Math.PI * index) / 12;
    points.push({
      x: start.x + Math.cos(angle) * radius,
      y: start.y + Math.sin(angle) * radius,
    });
  }
  return points;
};

const asRing = (points: Point[]) => {
  if (points.length === 0) return [];
  return [
    ...points.map((point) => [point.x, point.y] as [number, number]),
    [points[0]!.x, points[0]!.y] as [number, number],
  ];
};

const polygonArea = (ring: readonly (readonly number[])[]) => {
  let area = 0;
  for (let index = 1; index < ring.length; index += 1) {
    area += ring[index - 1][0] * ring[index][1];
    area -= ring[index][0] * ring[index - 1][1];
  }
  return Math.abs(area) / 2;
};

const eraseFilledShape = (
  shape: ShapeElement,
  outline: Point[],
  brushStart: Point,
  brushEnd: Point,
  radius: number,
): ShapeElement[] => {
  const eraserPolygons = [
    [asRing(createEraserPolygon(brushStart, brushEnd, radius))],
  ];
  return eraseFilledShapeWithPolygons(shape, outline, eraserPolygons, radius);
};

const eraseFilledShapeWithPolygons = (
  shape: ShapeElement,
  outline: Point[],
  eraserPolygons: [number, number][][][],
  radius: number,
): ShapeElement[] => {
  const ring = asRing(outline);
  if (ring.length === 0) return [shape];
  type Geom = Parameters<typeof polygonClipping.difference>[0];
  let current = [
    ring,
    ...(shape.subpaths ?? []).map((subpath) => asRing(subpath)),
  ] as unknown as Geom;
  let touched = false;
  for (const eraser of eraserPolygons) {
    if (!eraser) continue;
    const hit = polygonClipping.intersection(
      current,
      eraser as unknown as Parameters<typeof polygonClipping.intersection>[1],
    );
    if (hit.length === 0) continue;
    touched = true;
    current = polygonClipping.difference(
      current,
      eraser as unknown as Parameters<typeof polygonClipping.difference>[1],
    );
    if (current.length === 0) return [];
  }
  if (!touched) return [shape];
  const result = current as unknown as [number, number][][][];
  return result.flatMap((polygon) => {
    const outer = polygon[0];
    const minimumFragmentArea = Math.max(128, radius * radius * 8);
    if (
      !outer ||
      outer.length < 4 ||
      polygonArea(outer) < minimumFragmentArea
    ) {
      return [];
    }
    const points = outer.slice(0, -1).map(([x, y]) => ({ x, y }));
    const subpaths = polygon
      .slice(1)
      .filter(
        (ring) => ring.length >= 4 && polygonArea(ring) >= minimumFragmentArea,
      )
      .map((ring) => ring.slice(0, -1).map(([x, y]) => ({ x, y })));
    return [
      {
        ...shape,
        id: generateId("shape"),
        shapeType: "path" as const,
        points,
        subpaths,
        fillRule: "evenodd" as const,
        closePath: true,
      },
    ];
  });
};

export function erasePathSegment(
  shape: ShapeElement,
  brushStart: Point,
  brushEnd: Point,
  brushSize: number,
): ShapeElement[] {
  const sourcePoints = getShapeOutline(shape);
  if (!sourcePoints) return [shape];

  const localBrushStart = toLocalPoint(brushStart, shape);
  const localBrushEnd = toLocalPoint(brushEnd, shape);
  const maxScale = Math.max(
    Math.abs(shape.scaleX || 1),
    Math.abs(shape.scaleY || 1),
  );
  const eraserRadius =
    Math.max(0.5, brushSize / (2 * maxScale)) +
    (shape.strokeWidth ?? 1) / (2 * maxScale);

  const closedOutline = getClosedShapeOutline(shape);
  if (closedOutline) {
    return eraseFilledShape(
      shape,
      closedOutline,
      localBrushStart,
      localBrushEnd,
      eraserRadius,
    );
  }

  const fragments: Point[][] = [];
  let current: Point[] = [];
  let erased = false;

  const flush = () => {
    if (current.length >= 2) fragments.push(current);
    current = [];
  };

  for (let index = 1; index < sourcePoints.length; index += 1) {
    const start = sourcePoints[index - 1];
    const end = sourcePoints[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(length / 1.5));

    for (let step = 0; step <= steps; step += 1) {
      if (index > 1 && step === 0) continue;
      const parameter = step / steps;
      const point = {
        x: start.x + (end.x - start.x) * parameter,
        y: start.y + (end.y - start.y) * parameter,
      };
      const isErased =
        distanceToSegment(point, localBrushStart, localBrushEnd) <=
        eraserRadius;
      if (isErased) {
        flush();
        erased = true;
      } else {
        current.push(point);
      }
    }
  }
  flush();

  if (!erased) return [shape];
  return fragments.map((points) => ({
    ...shape,
    id: generateId("shape"),
    shapeType: "path",
    fill: "none",
    closePath: false,
    points,
  }));
}

export function erasePathStroke(
  shape: ShapeElement,
  brushPoints: Point[],
  brushSize: number,
): ShapeElement[] {
  if (brushPoints.length < 2) return [shape];
  const sourcePoints = getShapeOutline(shape);
  if (!sourcePoints) return [shape];

  const localBrushPoints = brushPoints.map((point) =>
    toLocalPoint(point, shape),
  );
  const maxScale = Math.max(
    Math.abs(shape.scaleX || 1),
    Math.abs(shape.scaleY || 1),
  );
  const eraserRadius =
    Math.max(0.5, brushSize / (2 * maxScale)) +
    (shape.strokeWidth ?? 1) / (2 * maxScale);
  const closedOutline = getClosedShapeOutline(shape);
  if (closedOutline) {
    const eraserPolygons = localBrushPoints
      .slice(1)
      .map((point, index) => [
        asRing(
          createEraserPolygon(localBrushPoints[index], point, eraserRadius),
        ),
      ]);
    return eraseFilledShapeWithPolygons(
      shape,
      closedOutline,
      eraserPolygons,
      eraserRadius,
    );
  }

  const fragments: Point[][] = [];
  let current: Point[] = [];
  let erased = false;
  const flush = () => {
    if (current.length >= 2) fragments.push(current);
    current = [];
  };
  for (let index = 1; index < sourcePoints.length; index += 1) {
    const start = sourcePoints[index - 1];
    const end = sourcePoints[index];
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 1.5),
    );
    for (let step = 0; step <= steps; step += 1) {
      if (index > 1 && step === 0) continue;
      const parameter = step / steps;
      const point = {
        x: start.x + (end.x - start.x) * parameter,
        y: start.y + (end.y - start.y) * parameter,
      };
      const isErased = localBrushPoints
        .slice(1)
        .some(
          (brushPoint, brushIndex) =>
            distanceToSegment(
              point,
              localBrushPoints[brushIndex],
              brushPoint,
            ) <= eraserRadius,
        );
      if (isErased) {
        flush();
        erased = true;
      } else {
        current.push(point);
      }
    }
  }
  flush();
  if (!erased) return [shape];
  return fragments
    .filter((points) => points.length >= 2)
    .map((points) => ({
      ...shape,
      id: generateId("shape"),
      shapeType: "path" as const,
      fill: "none",
      closePath: false,
      points,
    }));
}
