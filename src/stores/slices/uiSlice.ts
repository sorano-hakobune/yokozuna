import type { StateCreator } from "zustand";
import type { ProjectState, UiSlice } from "./types";
import type { TextOrientation } from "@/types/project";
import { normalizeFrame, selectionState } from "./shared";
import { toHex6 } from "@/lib/color";

export const createUiSlice: StateCreator<ProjectState, [], [], UiSlice> = (
  set,
) => ({
    currentFrame: 0,
    canvasZoom: 1,
    canvasPan: { x: 0, y: 0 },
    selectedTool: "select",
    drawingStroke: "#111111",
    drawingStrokeWidth: 2,
    drawingFill: "#0066cc",
    textOrientation: "horizontal" as TextOrientation,
    pathEditMode: false,
    pointerPos: null,
    editingSymbolId: undefined,
    onionSkinEnabled: false,
    onionSkinBefore: 2,
    onionSkinAfter: 2,
    enterSymbolEdit: (symbolId) => {
      set((state) => {
        const symbol = state.project.symbols[symbolId];
        if (!symbol) return state;
        return {
          editingSymbolId: symbolId,
          currentFrame: 0,
          selectedLayerId: symbol.layers[0]?.id,
          ...selectionState([]),
        };
      });
    },

    exitSymbolEdit: () => {
      set((state) => {
        if (!state.editingSymbolId) return state;
        const comp =
          state.project.compositions[state.project.activeCompositionId];
        return {
          editingSymbolId: undefined,
          currentFrame: 0,
          selectedLayerId: comp?.layers[0]?.id,
          ...selectionState([]),
        };
      });
    },
    setSelectedTool: (tool) =>
      set({ selectedTool: tool, pathEditMode: false }),
    setDrawingStroke: (drawingStroke) =>
      set({ drawingStroke: toHex6(drawingStroke, "#111111") }),
    setDrawingFill: (drawingFill) =>
      set({ drawingFill: toHex6(drawingFill, "#0066cc") }),
    setTextOrientation: (textOrientation) => set({ textOrientation }),
    setDrawingStrokeWidth: (drawingStrokeWidth) =>
      set({
        drawingStrokeWidth: Math.max(1, Math.min(100, drawingStrokeWidth)),
      }),
    setPathEditMode: (pathEditMode) => set({ pathEditMode }),
    setPointerPos: (pointerPos) =>
      set((state) => {
        if (pointerPos === state.pointerPos) return state;
        if (pointerPos === null && state.pointerPos === null) return state;
        if (
          pointerPos &&
          state.pointerPos &&
          pointerPos.x === state.pointerPos.x &&
          pointerPos.y === state.pointerPos.y
        ) {
          return state;
        }
        return { pointerPos };
      }),
    setCurrentFrame: (frame) =>
      set((state) => {
        const duration =
          (state.editingSymbolId
            ? state.project.symbols[state.editingSymbolId]?.duration
            : state.project.compositions[state.project.activeCompositionId]
                ?.duration) ?? state.project.settings.duration;
        const next = Math.max(0, normalizeFrame(frame, duration));
        return state.currentFrame === next ? state : { currentFrame: next };
      }),
    setOnionSkinEnabled: (enabled) =>
      set((state) =>
        state.onionSkinEnabled === enabled
          ? state
          : { onionSkinEnabled: enabled },
      ),
    setOnionSkinBefore: (count) =>
      set((state) => {
        const next = Math.max(0, Math.min(10, Math.round(count)));
        return state.onionSkinBefore === next
          ? state
          : { onionSkinBefore: next };
      }),
    setOnionSkinAfter: (count) =>
      set((state) => {
        const next = Math.max(0, Math.min(10, Math.round(count)));
        return state.onionSkinAfter === next ? state : { onionSkinAfter: next };
      }),
    toggleOnionSkin: () =>
      set((state) => ({ onionSkinEnabled: !state.onionSkinEnabled })),

    setCanvasZoom: (zoom) =>
      set((state) => (state.canvasZoom === zoom ? state : { canvasZoom: zoom })),
    zoomCanvas: (zoom) =>
      set((state) => {
        const next = Math.max(0.1, Math.min(8, zoom));
        return state.canvasZoom === next ? state : { canvasZoom: next };
      }),
    setCanvasPan: (pan) =>
      set((state) =>
        state.canvasPan.x === pan.x && state.canvasPan.y === pan.y
          ? state
          : { canvasPan: pan },
      ),
});
