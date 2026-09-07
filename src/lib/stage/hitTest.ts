import { getElementsAtFrame } from "@/lib/animation/interpolate";
import type { Element, Layer, Project, ShapeElement } from "@/types/project";
import {
  isPointInBitmap,
  isPointInInstance,
  isPointInShape,
} from "@/components/Stage/stageGeometry";

export type HitTarget = {
  layerId: string;
  elementId: string;
  locked: boolean;
};

type HitDeps = {
  layers: Layer[];
  project: Project;
  currentFrame: number;
  /** Skip locked layers (selection tools must not target them) */
  skipLocked?: boolean;
  /** Only consider shape elements (paint bucket must see through bitmaps) */
  shapesOnly?: boolean;
};

/**
 * Single unified hit-test: topmost element at canvas coords (front → back).
 * Replaces the four near-duplicate inline implementations in Stage.tsx
 * (select / eyedropper / paintbucket / context-menu).
 */
export function hitTestTopElement(
  coords: { x: number; y: number },
  deps: HitDeps,
): HitTarget | null {
  const { layers, project, currentFrame, skipLocked, shapesOnly } = deps;
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (skipLocked && layer.locked) continue;
    const elements = getElementsAtFrame(layer.keyframes, currentFrame);
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]!;
      if (shapesOnly && el.type !== "shape") continue;
      const hit =
        el.type === "shape"
          ? isPointInShape(coords.x, coords.y, el as ShapeElement)
          : el.type === "bitmap"
            ? isPointInBitmap(
                coords.x,
                coords.y,
                el,
                project.assets[el.assetId],
              )
            : el.type === "instance"
              ? isPointInInstance(
                  coords.x,
                  coords.y,
                  el,
                  project.symbols[el.symbolId],
                )
              : false;
      if (hit) {
        return { layerId: layer.id, elementId: el.id, locked: layer.locked };
      }
    }
  }
  return null;
}

/** Resolve a hit target back to its layer + element (for tool handlers). */
export function findHitElement(
  layers: Layer[],
  currentFrame: number,
  hit: HitTarget,
): { layer: Layer; element: Element } | null {
  const layer = layers.find((l) => l.id === hit.layerId);
  if (!layer) return null;
  const element = getElementsAtFrame(layer.keyframes, currentFrame).find(
    (e) => e.id === hit.elementId,
  );
  if (!element) return null;
  return { layer, element };
}
