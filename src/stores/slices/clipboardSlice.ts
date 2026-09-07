import type { StateCreator } from "zustand";
import type { ProjectState, ClipboardSlice } from "./types";
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
import { resolveSelection } from "@/lib/selection/selectionBounds";
import {
  computeAlignPatches,
  computeDistributePatches,
} from "@/lib/selection/alignDistribute";
import { generateId } from "@/lib/project";

export const createClipboardSlice: StateCreator<
  ProjectState,
  [],
  [],
  ClipboardSlice
> = (set, get) => ({
    clipboard: null,
    keyframeClipboard: null,
    _clipboardPasteGen: 0,
    copyElement: (layerId, frame, elementId) => {
      // Legacy single-id API 竊・multi clipboard
      const state = get();
      const target = getTimelineTarget(state);
      if (!target) return;
      const layer = target.layers.find((l) => l.id === layerId);
      if (!layer) return;
      const elements = getElementsAtFrame(layer.keyframes, frame);
      const el = elements.find((e) => e.id === elementId);
      if (!el) return;
      set({
        clipboard: [JSON.parse(JSON.stringify(el)) as Element],
        _clipboardPasteGen: 0,
      });
    },

    pasteElement: (layerId, frame) => {
      get().pasteClipboard(layerId, frame);
    },

    copySelection: () => {
      const state = get();
      const ids = state.selectedElementIds;
      if (ids.length === 0 && state.selectedElementId) {
        // fallback single
      }
      const selectedIds =
        ids.length > 0
          ? ids
          : state.selectedElementId
            ? [state.selectedElementId]
            : [];
      if (selectedIds.length === 0) return;

      const target = getTimelineTarget(state);
      if (!target) return;
      const idSet = new Set(selectedIds);
      const collected: Element[] = [];
      // Preserve selection order
      const order = new Map(selectedIds.map((id, i) => [id, i]));
      for (const layer of target.layers) {
        for (const el of getElementsAtFrame(
          layer.keyframes,
          state.currentFrame,
        )) {
          if (idSet.has(el.id)) {
            collected.push(JSON.parse(JSON.stringify(el)) as Element);
          }
        }
      }
      collected.sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
      if (collected.length === 0) return;
      set({ clipboard: collected, _clipboardPasteGen: 0 });
    },

    cutSelection: () => {
      const state = get();
      const selectedIds =
        state.selectedElementIds.length > 0
          ? [...state.selectedElementIds]
          : state.selectedElementId
            ? [state.selectedElementId]
            : [];
      if (selectedIds.length === 0) return;
      get().copySelection();

      set((s) => {
        const target = getTimelineTarget(s);
        if (!target) return s;
        const frame = normalizeFrame(s.currentFrame, target.duration);
        const idSet = new Set(selectedIds);

        const newLayers = target.layers.map((layer) => {
          if (layer.locked) return layer;
          const existing = layer.keyframes.find((kf) => kf.frame === frame);
          const elements = existing
            ? existing.elements
            : getElementsAtFrame(layer.keyframes, frame);
          if (!elements.some((el) => idSet.has(el.id))) return layer;
          return replaceLayerKeyframe(
            layer,
            frame,
            elements.filter((el) => !idSet.has(el.id)),
          );
        });

        return {
          ...prepareHistoryPatch(s),
          project: projectWithLayers(s.project, target, newLayers),
          ...selectionState([]),
        };
      });
    },

    pasteClipboard: (layerId, frame) => {
      const state = get();
      const clipboard = state.clipboard;
      if (!clipboard || clipboard.length === 0) return;

      const target = getTimelineTarget(state);
      if (!target) return;
      const destLayerId = layerId ?? state.selectedLayerId ?? target.layers[0]?.id;
      if (!destLayerId) return;
      const destLayer = target.layers.find((l) => l.id === destLayerId);
      if (!destLayer || destLayer.locked) return;

      const destFrame = normalizeFrame(
        frame ?? state.currentFrame,
        target.duration,
      );
      const gen = state._clipboardPasteGen + 1;
      const offset = 20 * gen;

      const newElements: Element[] = clipboard.map((el) => ({
        ...(JSON.parse(JSON.stringify(el)) as Element),
        id: generateId("el"),
        x: (el.x ?? 0) + offset,
        y: (el.y ?? 0) + offset,
      }));

      set((s) => {
        const t = getTimelineTarget(s);
        if (!t) return s;
        return {
          ...prepareHistoryPatch(s),
          project: projectWithLayers(
            s.project,
            t,
            t.layers.map((layer) => {
              if (layer.id !== destLayerId) return layer;
              const existing = layer.keyframes.find((kf) => kf.frame === destFrame);
              if (existing) {
                return {
                  ...layer,
                  keyframes: layer.keyframes.map((kf) =>
                    kf.frame === destFrame
                      ? { ...kf, elements: [...kf.elements, ...newElements] }
                      : kf,
                  ),
                };
              }
              const base = getPreviousKeyframeElements(layer.keyframes, destFrame);
              const newKf: Keyframe = {
                frame: destFrame,
                tween: "none",
                elements: [...base, ...newElements],
              };
              return {
                ...layer,
                keyframes: [...layer.keyframes, newKf].sort(
                  (a, b) => a.frame - b.frame,
                ),
              };
            }),
          ),
          _clipboardPasteGen: gen,
          ...selectionState(newElements.map((e) => e.id)),
          selectedLayerId: destLayerId,
          currentFrame: destFrame,
        };
      });
    },

    duplicateSelection: () => {
      const state = get();
      const selectedIds =
        state.selectedElementIds.length > 0
          ? state.selectedElementIds
          : state.selectedElementId
            ? [state.selectedElementId]
            : [];
      if (selectedIds.length === 0) return;
      // Copy without resetting paste gen mid-flight: inline collect + paste once
      get().copySelection();
      get().pasteClipboard();
    },

    alignSelection: (mode) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const ids =
          state.selectedElementIds.length > 0
            ? state.selectedElementIds
            : state.selectedElementId
              ? [state.selectedElementId]
              : [];
        if (ids.length < 2) return state;
        const items = resolveSelection(
          target.layers,
          state.currentFrame,
          ids,
          state.project,
        ).filter(({ layerId }) => {
          const layer = target.layers.find((l) => l.id === layerId);
          return layer && !layer.locked;
        });
        const patches = computeAlignPatches(items, mode, state.project);
        if (patches.length === 0) return state;

        const byLayer = new Map<string, Map<string, { x: number; y: number }>>();
        for (const p of patches) {
          if (!byLayer.has(p.layerId)) byLayer.set(p.layerId, new Map());
          byLayer.get(p.layerId)!.set(p.elementId, { x: p.x, y: p.y });
        }
        const frame = normalizeFrame(state.currentFrame, target.duration);

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            target.layers.map((layer) => {
              const layerPatches = byLayer.get(layer.id);
              if (!layerPatches) return layer;
              const existing = layer.keyframes.find((kf) => kf.frame === frame);
              const elements = existing
                ? existing.elements
                : getElementsAtFrame(layer.keyframes, frame);
              const nextElements = elements.map((el) => {
                const pos = layerPatches.get(el.id);
                return pos ? { ...el, x: pos.x, y: pos.y } : el;
              });
              return replaceLayerKeyframe(layer, frame, nextElements);
            }),
          ),
        };
      });
    },

    distributeSelection: (axis) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const ids =
          state.selectedElementIds.length > 0
            ? state.selectedElementIds
            : state.selectedElementId
              ? [state.selectedElementId]
              : [];
        if (ids.length < 3) return state;
        const items = resolveSelection(
          target.layers,
          state.currentFrame,
          ids,
          state.project,
        ).filter(({ layerId }) => {
          const layer = target.layers.find((l) => l.id === layerId);
          return layer && !layer.locked;
        });
        const patches = computeDistributePatches(items, axis, state.project);
        if (patches.length === 0) return state;

        const byLayer = new Map<string, Map<string, { x: number; y: number }>>();
        for (const p of patches) {
          if (!byLayer.has(p.layerId)) byLayer.set(p.layerId, new Map());
          byLayer.get(p.layerId)!.set(p.elementId, { x: p.x, y: p.y });
        }
        const frame = normalizeFrame(state.currentFrame, target.duration);

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(
            state.project,
            target,
            target.layers.map((layer) => {
              const layerPatches = byLayer.get(layer.id);
              if (!layerPatches) return layer;
              const existing = layer.keyframes.find((kf) => kf.frame === frame);
              const elements = existing
                ? existing.elements
                : getElementsAtFrame(layer.keyframes, frame);
              const nextElements = elements.map((el) => {
                const pos = layerPatches.get(el.id);
                return pos ? { ...el, x: pos.x, y: pos.y } : el;
              });
              return replaceLayerKeyframe(layer, frame, nextElements);
            }),
          ),
        };
      });
    },
});
