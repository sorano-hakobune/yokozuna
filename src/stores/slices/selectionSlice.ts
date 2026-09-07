import type { StateCreator } from "zustand";
import type { ProjectState, SelectionSlice } from "./types";
import { getTimelineTarget, initialLayerId, selectionState } from "./shared";
import { getElementsAtFrame } from "@/lib/animation/interpolate";

export const createSelectionSlice: StateCreator<
  ProjectState,
  [],
  [],
  SelectionSlice
> = (set) => ({
    selectedLayerId: initialLayerId,
    selectedElementId: undefined,
    selectedElementIds: [],
    setSelectedLayerId: (layerId) =>
      set((state) =>
        state.selectedLayerId === layerId ? state : { selectedLayerId: layerId },
      ),
    setSelectedElementId: (elementId) =>
      set((state) => {
        const next = selectionState(elementId ? [elementId] : []);
        if (
          state.selectedElementId === next.selectedElementId &&
          state.selectedElementIds.length === next.selectedElementIds.length &&
          state.selectedElementIds.every((id, i) => id === next.selectedElementIds[i])
        ) {
          return state;
        }
        // Leaving path edit when selection changes
        return { ...next, pathEditMode: false };
      }),
    setSelectedElementIds: (ids) =>
      set((state) => {
        const next = selectionState(ids);
        if (
          state.selectedElementId === next.selectedElementId &&
          state.selectedElementIds.length === next.selectedElementIds.length &&
          state.selectedElementIds.every((id, i) => id === next.selectedElementIds[i])
        ) {
          return state;
        }
        return { ...next, pathEditMode: false };
      }),
    toggleSelectedElementId: (elementId) =>
      set((state) => {
        const has = state.selectedElementIds.includes(elementId);
        const nextIds = has
          ? state.selectedElementIds.filter((id) => id !== elementId)
          : [...state.selectedElementIds, elementId];
        return selectionState(nextIds);
      }),
    clearSelection: () =>
      set((state) =>
        state.selectedElementIds.length === 0 &&
        !state.selectedElementId &&
        !state.pathEditMode
          ? state
          : { ...selectionState([]), pathEditMode: false },
      ),
    selectAllOnFrame: () =>
      set((state) => {
        const target = getTimelineTarget(state);
        if (!target) return state;
        const ids: string[] = [];
        for (const layer of target.layers) {
          if (!layer.visible || layer.locked) continue;
          for (const el of getElementsAtFrame(
            layer.keyframes,
            state.currentFrame,
          )) {
            ids.push(el.id);
          }
        }
        return selectionState(ids);
      }),
});
