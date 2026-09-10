import type { Element, Layer, Project } from "@/types/project";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import {
  elementWorldTransform,
  getLocalBounds,
  localToWorld,
  type LocalBounds,
} from "@/components/Stage/transformGeometry";

export type SelectionItem = {
  layerId: string;
  element: Element;
};

export type AxisAlignedBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
};

/** Find all selected elements on the current frame (ids are unique project-wide). */
export function resolveSelection(
  layers: Layer[],
  frame: number,
  selectedIds: string[],
  _project: Project,
): SelectionItem[] {
  if (selectedIds.length === 0) return [];
  const idSet = new Set(selectedIds);
  const found: SelectionItem[] = [];
  for (const layer of layers) {
    if (!layer.visible || layer.locked) continue;
    for (const el of getElementsAtFrame(layer.keyframes, frame)) {
      if (idSet.has(el.id)) {
        found.push({ layerId: layer.id, element: el });
      }
    }
  }
  // Preserve selection order
  const order = new Map(selectedIds.map((id, i) => [id, i]));
  found.sort(
    (a, b) => (order.get(a.element.id) ?? 0) - (order.get(b.element.id) ?? 0),
  );
  return found;
}

function assetFor(el: Element, project: Project) {
  if (el.type === "bitmap") return project.assets[el.assetId];
  if (el.type === "instance") return project.symbols[el.symbolId];
  return undefined;
}

/** World-space AABB of one element (handles rotation via corner transform). */
export function elementWorldAABB(
  el: Element,
  project: Project,
): AxisAlignedBounds {
  const bounds = getLocalBounds(el, assetFor(el, project));
  return localBoundsToWorldAABB(bounds, elementWorldTransform(el));
}

export function localBoundsToWorldAABB(
  bounds: LocalBounds,
  t: {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    pivotX?: number;
    pivotY?: number;
  },
): AxisAlignedBounds {
  const minLX = bounds.cx - bounds.halfW;
  const maxLX = bounds.cx + bounds.halfW;
  const minLY = bounds.cy - bounds.halfH;
  const maxLY = bounds.cy + bounds.halfH;
  const corners = [
    { x: minLX, y: minLY },
    { x: maxLX, y: minLY },
    { x: maxLX, y: maxLY },
    { x: minLX, y: maxLY },
  ].map((p) => localToWorld(p, t));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Union AABB of many selection items. */
export function unionSelectionBounds(
  items: SelectionItem[],
  project: Project,
): AxisAlignedBounds | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { element } of items) {
    const b = elementWorldAABB(element, project);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

/** Axis-aligned rect intersection test (inclusive). */
export function aabbIntersects(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/** Normalize marquee corners into min/max rect. */
export function normalizeRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(x0, x1),
    minY: Math.min(y0, y1),
    maxX: Math.max(x0, x1),
    maxY: Math.max(y0, y1),
  };
}

/** Elements whose world AABB intersects the marquee (top → bottom hit order not required). */
export function hitTestMarquee(
  layers: Layer[],
  frame: number,
  project: Project,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): SelectionItem[] {
  const hits: SelectionItem[] = [];
  for (const layer of layers) {
    if (!layer.visible || layer.locked) continue;
    for (const el of getElementsAtFrame(layer.keyframes, frame)) {
      const aabb = elementWorldAABB(el, project);
      if (aabbIntersects(aabb, rect)) {
        hits.push({ layerId: layer.id, element: el });
      }
    }
  }
  return hits;
}
