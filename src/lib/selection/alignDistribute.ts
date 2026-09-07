import type { Element, Project } from "@/types/project";
import {
  elementWorldAABB,
  type AxisAlignedBounds,
  type SelectionItem,
} from "./selectionBounds";

export type AlignMode =
  | "left"
  | "centerH"
  | "right"
  | "top"
  | "middleV"
  | "bottom";

export type DistributeAxis = "horizontal" | "vertical";

export type PositionPatch = {
  layerId: string;
  elementId: string;
  x: number;
  y: number;
};

type ItemBounds = {
  item: SelectionItem;
  aabb: AxisAlignedBounds;
};

function withBounds(items: SelectionItem[], project: Project): ItemBounds[] {
  return items.map((item) => ({
    item,
    aabb: elementWorldAABB(item.element, project),
  }));
}

function unionOf(list: ItemBounds[]): AxisAlignedBounds | null {
  if (list.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { aabb } of list) {
    minX = Math.min(minX, aabb.minX);
    minY = Math.min(minY, aabb.minY);
    maxX = Math.max(maxX, aabb.maxX);
    maxY = Math.max(maxY, aabb.maxY);
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

function patchFromDelta(
  el: Element,
  layerId: string,
  dx: number,
  dy: number,
): PositionPatch {
  return {
    layerId,
    elementId: el.id,
    x: Math.round((el.x ?? 0) + dx),
    y: Math.round((el.y ?? 0) + dy),
  };
}

/** Align selected items to a shared edge / center of the group bounds. */
export function computeAlignPatches(
  items: SelectionItem[],
  mode: AlignMode,
  project: Project,
): PositionPatch[] {
  if (items.length < 2) return [];
  const list = withBounds(items, project);
  const group = unionOf(list);
  if (!group) return [];

  const patches: PositionPatch[] = [];
  for (const { item, aabb } of list) {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left":
        dx = group.minX - aabb.minX;
        break;
      case "centerH":
        dx = group.cx - aabb.cx;
        break;
      case "right":
        dx = group.maxX - aabb.maxX;
        break;
      case "top":
        dy = group.minY - aabb.minY;
        break;
      case "middleV":
        dy = group.cy - aabb.cy;
        break;
      case "bottom":
        dy = group.maxY - aabb.maxY;
        break;
    }
    if (dx === 0 && dy === 0) continue;
    patches.push(patchFromDelta(item.element, item.layerId, dx, dy));
  }
  return patches;
}

/**
 * Distribute items with equal gaps between consecutive AABBs.
 * First and last stay put; needs 3+ items.
 */
export function computeDistributePatches(
  items: SelectionItem[],
  axis: DistributeAxis,
  project: Project,
): PositionPatch[] {
  if (items.length < 3) return [];
  const list = withBounds(items, project);

  if (axis === "horizontal") {
    const sorted = [...list].sort((a, b) => a.aabb.minX - b.aabb.minX);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const sumW = sorted.reduce((s, x) => s + x.aabb.width, 0);
    const span = last.aabb.maxX - first.aabb.minX;
    const gap = (span - sumW) / (sorted.length - 1);
    let cursor = first.aabb.minX;
    const patches: PositionPatch[] = [];
    for (const entry of sorted) {
      const dx = cursor - entry.aabb.minX;
      if (dx !== 0) {
        patches.push(
          patchFromDelta(entry.item.element, entry.item.layerId, dx, 0),
        );
      }
      cursor += entry.aabb.width + gap;
    }
    return patches;
  }

  const sorted = [...list].sort((a, b) => a.aabb.minY - b.aabb.minY);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const sumH = sorted.reduce((s, x) => s + x.aabb.height, 0);
  const span = last.aabb.maxY - first.aabb.minY;
  const gap = (span - sumH) / (sorted.length - 1);
  let cursor = first.aabb.minY;
  const patches: PositionPatch[] = [];
  for (const entry of sorted) {
    const dy = cursor - entry.aabb.minY;
    if (dy !== 0) {
      patches.push(
        patchFromDelta(entry.item.element, entry.item.layerId, 0, dy),
      );
    }
    cursor += entry.aabb.height + gap;
  }
  return patches;
}
