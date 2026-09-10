import type { StateCreator } from "zustand";
import type { ProjectState, LayerSlice } from "./types";
import type { Layer } from "@/types/project";
import {
  getTimelineTarget,
  normalizeFrame,
  prepareHistoryPatch,
  projectWithLayers,
  selectionState,
} from "./shared";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { cascadeFolderFlags, reparentLayer } from "@/lib/layers";
import { generateId } from "@/lib/project";

export const createLayerSlice: StateCreator<ProjectState, [], [], LayerSlice> = (
  set,
) => ({
    addLayer: (name = "新規レイヤー", parentId) => {
      const id = generateId("layer");
      const newLayer: Layer = {
        id,
        name,
        type: "normal",
        visible: true,
        locked: false,
        keyframes: [{ frame: 0, tween: "none", elements: [] }],
        ...(parentId ? { parentId } : {}),
      };

      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        let layers = [...target.layers, newLayer];
        // If parent is a folder, reparent into contiguous block
        if (parentId) {
          const parent = target.layers.find((l) => l.id === parentId);
          if (parent?.type === "folder") {
            layers = reparentLayer(
              [...target.layers, { ...newLayer }],
              id,
              parentId,
            );
          }
        } else if (state.selectedLayerId) {
          // If selection is a folder, add as child by default
          const sel = target.layers.find((l) => l.id === state.selectedLayerId);
          if (sel?.type === "folder") {
            newLayer.parentId = sel.id;
            layers = reparentLayer(
              [...target.layers, { ...newLayer, parentId: sel.id }],
              id,
              sel.id,
            );
          }
        }
        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, layers),
          selectedLayerId: id,
        };
      });

      return id;
    },

    addFolder: (name = "新規フォルダ") => {
      const id = generateId("folder");
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const folder: Layer = {
          id,
          name,
          type: "folder",
          visible: true,
          locked: false,
          keyframes: [],
          expanded: true,
        };
        // Insert above current selection (or at top)
        const selIdx = state.selectedLayerId
          ? target.layers.findIndex((l) => l.id === state.selectedLayerId)
          : 0;
        const next = [...target.layers];
        const at = selIdx >= 0 ? selIdx : 0;
        next.splice(at, 0, folder);
        // Optionally parent the selected layer into the new folder
        let layers = next;
        if (state.selectedLayerId && state.selectedLayerId !== id) {
          const sel = target.layers.find((l) => l.id === state.selectedLayerId);
          if (sel && sel.type !== "folder") {
            layers = reparentLayer(next, state.selectedLayerId, id);
          }
        }
        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, layers),
          selectedLayerId: id,
        };
      });
      return id;
    },

    toggleFolderExpanded: (folderId) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const folder = target.layers.find((l) => l.id === folderId);
        if (!folder || folder.type !== "folder") return state;
        // expanded === undefined means open; toggle closed
        const nextExpanded = folder.expanded === false ? true : false;
        const nextLayers = target.layers.map((l) =>
          l.id === folderId ? { ...l, expanded: nextExpanded } : l,
        );
        return {
          project: projectWithLayers(state.project, target, nextLayers),
        };
      });
    },

    setLayerParent: (layerId, parentId) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const next = reparentLayer(target.layers, layerId, parentId);
        if (next === target.layers) return state;
        // detect no-op by ids order + parent
        const same =
          next.length === target.layers.length &&
          next.every(
            (l, i) =>
              l.id === target.layers[i]?.id &&
              (l.parentId ?? "") === (target.layers[i]?.parentId ?? ""),
          );
        if (same) return state;
        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, next),
        };
      });
    },

    updateLayer: (layerId, partial) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const layer = target.layers.find((l) => l.id === layerId);
        let nextLayers = target.layers.map((l) =>
          l.id === layerId ? { ...l, ...partial } : l,
        );
        // Cascade visibility/lock from folders to descendants
        if (
          layer?.type === "folder" &&
          (partial.visible !== undefined || partial.locked !== undefined)
        ) {
          nextLayers = cascadeFolderFlags(nextLayers, layerId, {
            visible: partial.visible,
            locked: partial.locked,
          });
        }
        const patch: Record<string, unknown> = {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, nextLayers),
        };
        // Locking a layer: drop its elements from the current selection so
        // transform/delete cannot keep targeting locked content.
        if (partial.locked === true) {
          const lockedLayer = nextLayers.find((l) => l.id === layerId);
          if (lockedLayer) {
            const frame = normalizeFrame(state.currentFrame, target.duration);
            const lockedIds = new Set(
              getElementsAtFrame(lockedLayer.keyframes, frame).map((el) => el.id),
            );
            // Also strip ids that appear on any keyframe of this layer
            for (const kf of lockedLayer.keyframes) {
              for (const el of kf.elements) lockedIds.add(el.id);
            }
            const remaining = state.selectedElementIds.filter(
              (id) => !lockedIds.has(id),
            );
            Object.assign(patch, selectionState(remaining));
          }
        }
        return patch;
      });
    },

    duplicateLayer: (layerId) => {
      let newId: string | undefined;
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const src = target.layers.find((l) => l.id === layerId);
        if (!src) return state;
        newId = generateId("layer");
        const cloned: Layer = {
          ...JSON.parse(JSON.stringify(src)),
          id: newId,
          name: `${src.name} のコピー`,
        };
        // Re-id elements inside keyframes to avoid selection/id collisions
        cloned.keyframes = cloned.keyframes.map((kf) => ({
          ...kf,
          elements: kf.elements.map((el) => ({
            ...el,
            id: generateId(el.type === "shape" ? "shape" : el.type),
          })),
        }));
        const idx = target.layers.findIndex((l) => l.id === layerId);
        const next = [...target.layers];
        next.splice(idx + 1, 0, cloned);
        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, next),
          selectedLayerId: newId,
          ...selectionState([]),
        };
      });
      return newId;
    },

    removeLayer: (layerId) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const removing = target.layers.find((l) => l.id === layerId);
        if (!removing) return state;

        // Folder delete: unparent children (keep them), remove folder only
        if (removing.type === "folder") {
          const newLayers = target.layers
            .filter((l) => l.id !== layerId)
            .map((l) =>
              l.parentId === layerId
                ? { ...l, parentId: removing.parentId }
                : l,
            );
          if (newLayers.length === 0) return state;
          return {
            ...prepareHistoryPatch(state),
            project: projectWithLayers(state.project, target, newLayers),
            selectedLayerId:
              state.selectedLayerId === layerId
                ? newLayers[0]?.id
                : state.selectedLayerId,
            ...(state.selectedLayerId === layerId
              ? selectionState([])
              : {}),
          };
        }

        // Don't allow removing the last content layer
        const contentCount = target.layers.filter((l) => l.type !== "folder")
          .length;
        if (contentCount <= 1) return state;

        const newLayers = target.layers.filter((l) => l.id !== layerId);
        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, newLayers),
          selectedLayerId:
            state.selectedLayerId === layerId
              ? newLayers.find((l) => l.type !== "folder")?.id ??
                newLayers[0]?.id
              : state.selectedLayerId,
          ...(state.selectedLayerId === layerId
            ? selectionState([])
            : {}),
        };
      });
    },

    reorderLayers: (layerIds) => {
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;

        const map = new Map(target.layers.map((l) => [l.id, l]));
        const seen = new Set<string>();
        const newLayers: Layer[] = [];
        for (const id of layerIds) {
          const layer = map.get(id);
          if (!layer || seen.has(id)) continue;
          seen.add(id);
          newLayers.push(layer);
        }
        // Keep any layers omitted from the payload (safety)
        for (const layer of target.layers) {
          if (!seen.has(layer.id)) newLayers.push(layer);
        }
        if (
          newLayers.length === target.layers.length &&
          newLayers.every((l, i) => l.id === target.layers[i]?.id)
        ) {
          return state;
        }

        return {
          ...prepareHistoryPatch(state),
          project: projectWithLayers(state.project, target, newLayers),
        };
      });
    },
});
