import type { StateCreator } from "zustand";
import type { ProjectState, ElementSlice } from "./types";
import type { Element, Keyframe } from "@/types/project";
import {
  getPreviousKeyframeElements,
  getTimelineTarget,
  normalizeFrame,
  prepareHistoryPatch,
  projectWithLayers,
  replaceLayerKeyframe,
  selectionState,
} from "./shared";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { generateId } from "@/lib/project";

export const createElementSlice: StateCreator<
  ProjectState,
  [],
  [],
  ElementSlice
> = (set, get) => ({
    ensureKeyframeAndAddElement: (layerId, frame, element) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };
        frame = normalizeFrame(frame, comp.duration);

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
              if (layer.id !== layerId) return layer;

              const exists = layer.keyframes.some((kf) => kf.frame === frame);
              if (exists) {
                return {
                  ...layer,
                  keyframes: layer.keyframes.map((kf) =>
                    kf.frame === frame
                      ? { ...kf, elements: [...kf.elements, element] }
                      : kf,
                  ),
                };
              }

              // 逶ｴ蜑阪・繧ｭ繝ｼ繝輔Ξ繝ｼ繝縺ｮ隕∫ｴ繧偵さ繝斐・縺励※譁ｰ繧ｭ繝ｼ繝輔Ξ繝ｼ繝繧剃ｽ懊ｋ
              const baseElements = getPreviousKeyframeElements(
                layer.keyframes,
                frame,
              );

              const newKf: Keyframe = {
                frame,
                tween: "none",
                elements: [...baseElements, element],
              };

              return {
                ...layer,
                keyframes: [...layer.keyframes, newKf].sort(
                  (a, b) => a.frame - b.frame,
                ),
              };
            }),
          ),
        };
      });
      // Select outside the project mutation to avoid cascading updates mid-set.
      queueMicrotask(() => {
        get().setSelectedElementId(element.id);
      });
    },

    updateElement: (layerId, frame, elementId, partial) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.locked) return layer;
                  const existingKeyframe = layer.keyframes.find(
                    (kf) => kf.frame === frame,
                  );
                  const elements = existingKeyframe
                    ? existingKeyframe.elements
                    : getElementsAtFrame(layer.keyframes, frame);
                  if (!elements.some((el) => el.id === elementId)) {
                    return layer;
                  }

                  return replaceLayerKeyframe(
                    layer,
                    frame,
                    elements.map((el) =>
                      el.id === elementId
                        ? ({ ...el, ...partial } as Element)
                        : el,
                    ),
                  );
                }),
          ),
        };
      });
    },

    addShapeToLayer: (layerId, frame, shape) => {
      get().ensureKeyframeAndAddElement(layerId, frame, shape);
    },

    removeElement: (layerId, frame, elementId) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };
        frame = normalizeFrame(frame, comp.duration);

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId) return layer;
                  if (layer.locked) return layer;
                  const existingKeyframe = layer.keyframes.find(
                    (kf) => kf.frame === frame,
                  );
                  const elements = existingKeyframe
                    ? existingKeyframe.elements
                    : getElementsAtFrame(layer.keyframes, frame);
                  if (!elements.some((el) => el.id === elementId)) {
                    return layer;
                  }

                  return replaceLayerKeyframe(
                    layer,
                    frame,
                    elements.filter((el) => el.id !== elementId),
                  );
                }),
          ),
          ...selectionState(
            state.selectedElementIds.filter((id) => id !== elementId),
          ),
        };
      });
    },

    reorderSelectionZ: (direction) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const ids =
          state.selectedElementIds.length > 0
            ? state.selectedElementIds
            : state.selectedElementId
              ? [state.selectedElementId]
              : [];
        if (ids.length === 0) return state;
        const idSet = new Set(ids);
        const frame = normalizeFrame(state.currentFrame, target.duration);
        let changed = false;
        const newLayers = target.layers.map((layer) => {
          if (layer.locked) return layer;
          const existing = layer.keyframes.find((kf) => kf.frame === frame);
          const elements = existing
            ? existing.elements
            : getElementsAtFrame(layer.keyframes, frame);
          const selected = elements.filter((el) => idSet.has(el.id));
          if (selected.length === 0) return layer;
          const rest = elements.filter((el) => !idSet.has(el.id));
          const next =
            direction === "front" ? [...rest, ...selected] : [...selected, ...rest];
          if (next.every((el, i) => el.id === elements[i]?.id)) return layer;
          changed = true;
          return replaceLayerKeyframe(layer, frame, next);
        });
        if (!changed) return state;
        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, newLayers),
        };
      });
    },

    replaceShapeWithFragments: (layerId, frame, elementId, fragments) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const comp = { layers: target.layers, duration: target.duration };

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            comp.layers.map((layer) => {
                  if (layer.id !== layerId || layer.locked) return layer;
                  const existingKeyframe = layer.keyframes.find(
                    (kf) => kf.frame === frame,
                  );
                  const elements = existingKeyframe
                    ? existingKeyframe.elements
                    : getElementsAtFrame(layer.keyframes, frame);
                  if (!elements.some((element) => element.id === elementId)) {
                    return layer;
                  }
                  const replacement = elements.flatMap((element) =>
                    element.id === elementId ? fragments : [element],
                  );
                  return replaceLayerKeyframe(layer, frame, replacement);
                }),
          ),
          ...selectionState(
            state.selectedElementIds.filter((id) => id !== elementId),
          ),
        };
      });
    },

    addBitmapElement: (layerId, frame, assetId, x, y) => {
      const bitmap: Element = {
        id: generateId("el"),
        type: "bitmap",
        assetId,
        x,
        y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
      };
      get().ensureKeyframeAndAddElement(layerId, frame, bitmap);
    },
});
