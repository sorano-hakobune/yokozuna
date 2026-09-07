import type { StateCreator } from "zustand";
import type { ProjectState, SymbolSlice } from "./types";
import type { Element, Layer, Symbol } from "@/types/project";
import {
  getActiveComp,
  normalizeFrame,
  prepareHistoryPatch,
  replaceLayerKeyframe,
  touchMeta,
} from "./shared";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import {
  buildSymbolFromElements,
  createEmptySymbolData,
  estimateElementBounds,
  unionBounds,
} from "@/lib/project/symbolUtils";
import { generateId } from "@/lib/project";

export const createSymbolSlice: StateCreator<
  ProjectState,
  [],
  [],
  SymbolSlice
> = (set, get) => ({
    createSymbol: (name = "Symbol 1", type = "graphic") => {
      const data = createEmptySymbolData(name, type);
      return get().addSymbol(data);
    },

    convertSelectionToSymbol: (name = "Symbol 1", type = "graphic") => {
      const state = get();
      const comp = getActiveComp(state);
      if (!comp) return null;
      const layerId = state.selectedLayerId;
      const elementId = state.selectedElementId;
      if (!layerId || !elementId) return null;

      const layer = comp.layers.find((l) => l.id === layerId);
      if (!layer || layer.locked) return null;

      const frame = normalizeFrame(
        state.currentFrame,
        comp.duration,
      );
      const existingKf = layer.keyframes.find((kf) => kf.frame === frame);
      const elements = existingKf
        ? existingKf.elements
        : getElementsAtFrame(layer.keyframes, frame);
      const selected = elements.find((el) => el.id === elementId);
      if (!selected) return null;

      // Currently single selection; collect just the selected element
      const sourceElements = [selected];
      const assetSizes: Record<string, { width?: number; height?: number }> =
        {};
      for (const el of sourceElements) {
        if (el.type === "bitmap") {
          const asset = state.project.assets[el.assetId];
          if (asset) assetSizes[el.assetId] = asset;
        }
      }

      const symbolData = buildSymbolFromElements({
        name,
        type,
        elements: sourceElements,
        assetSizes,
      });
      const symbolId = generateId("sym");

      // Instance sits at former selection center (use shared bounds helper)
      const union = unionBounds(
        sourceElements.map((el) =>
          estimateElementBounds(
            el,
            el.type === "bitmap"
              ? state.project.assets[el.assetId]
              : el.type === "instance"
                ? state.project.symbols[el.symbolId]
                : undefined,
          ),
        ),
      );
      const cx = Number.isFinite(union.cx) ? union.cx : selected.x;
      const cy = Number.isFinite(union.cy) ? union.cy : selected.y;

      const instance: Element = {
        id: generateId("el"),
        type: "instance",
        symbolId,
        x: cx,
        y: cy,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        name: name,
      };

      set((s) => {
        const compositionId = s.project.activeCompositionId;
        const c = s.project.compositions[compositionId];
        if (!c) return s;

        return {
          ...prepareHistoryPatch(s),
          project: {
            ...s.project,
            symbols: {
              ...s.project.symbols,
              [symbolId]: { ...symbolData, id: symbolId },
            },
            compositions: {
              ...s.project.compositions,
              [compositionId]: {
                ...c,
                layers: c.layers.map((l) => {
                  if (l.id !== layerId) return l;
                  const kfElements = existingKf
                    ? existingKf.elements
                    : getElementsAtFrame(l.keyframes, frame);
                  const nextElements = [
                    ...kfElements.filter((el) => el.id !== elementId),
                    instance,
                  ];
                  return replaceLayerKeyframe(l, frame, nextElements);
                }),
              },
            },
            meta: touchMeta(s.project),
          },
        };
      });
      queueMicrotask(() => {
        get().setSelectedElementId(instance.id);
      });

      return symbolId;
    },

    addInstanceElement: (layerId, frame, symbolId, x, y) => {
      const symbol = get().project.symbols[symbolId];
      if (!symbol) return;
      const instance: Element = {
        id: generateId("el"),
        type: "instance",
        symbolId,
        x,
        y,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        name: symbol.name,
      };
      get().ensureKeyframeAndAddElement(layerId, frame, instance);
    },

    renameSymbol: (symbolId, name) => {
      set((state) => {
        const symbol = state.project.symbols[symbolId];
        if (!symbol) return state;
        return {
          ...prepareHistoryPatch(state),
          project: {
            ...state.project,
            symbols: {
              ...state.project.symbols,
              [symbolId]: { ...symbol, name },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    deleteSymbol: (symbolId) => {
      set((state) => {
        if (!state.project.symbols[symbolId]) return state;
        const { [symbolId]: _removed, ...rest } = state.project.symbols;
        return {
          ...prepareHistoryPatch(state),
          project: {
            ...state.project,
            symbols: rest,
            meta: touchMeta(state.project),
          },
        };
      });
    },

    duplicateSymbol: (symbolId) => {
      const state = get();
      const source = state.project.symbols[symbolId];
      if (!source) return null;
      const newId = generateId("sym");
      // Deep clone layers/keyframes/elements with new element ids
      const layers: Layer[] = JSON.parse(JSON.stringify(source.layers)).map(
        (layer: Layer) => ({
          ...layer,
          id: generateId("layer"),
          keyframes: layer.keyframes.map((kf) => ({
            ...kf,
            elements: kf.elements.map((el) => ({
              ...el,
              id: generateId("el"),
            })),
          })),
        }),
      );
      const copy: Symbol = {
        ...JSON.parse(JSON.stringify(source)),
        id: newId,
        name: `${source.name} 縺ｮ繧ｳ繝斐・`,
        layers,
      };
      set((s) => ({
        ...prepareHistoryPatch(s),
        project: {
          ...s.project,
          symbols: {
            ...s.project.symbols,
            [newId]: copy,
          },
          meta: touchMeta(s.project),
        },
      }));
      return newId;
    },
});
