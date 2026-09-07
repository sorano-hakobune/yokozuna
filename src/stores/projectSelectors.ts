import { useMemo } from "react";
import { useProjectStore } from "./projectStore";
import type {
  Composition,
  Layer,
  ProjectSettings,
  Asset,
  Symbol,
  Element,
} from "@/types/project";
import { getElementsAtFrame } from "@/lib/animation/interpolate";

const EMPTY_LAYERS: Layer[] = [];
const EMPTY_ASSETS: Asset[] = [];
const EMPTY_SYMBOLS: Symbol[] = [];
const EMPTY_ELEMENTS: Element[] = [];
const EMPTY_COMPOSITIONS: Composition[] = [];

export const useProject = () => useProjectStore((s) => s.project);

export const useProjectMeta = () => useProjectStore((s) => s.project.meta);

export const useProjectSettings = (): ProjectSettings =>
  useProjectStore((s) => s.project.settings);

export const useActiveCompositionId = () =>
  useProjectStore((s) => s.project.activeCompositionId);

export const useActiveComposition = (): Composition | null =>
  useProjectStore((s) => {
    const id = s.project.activeCompositionId;
    return s.project.compositions[id] ?? null;
  });

export const useEditingSymbolId = () =>
  useProjectStore((s) => s.editingSymbolId);

export const useEditingSymbol = (): Symbol | null =>
  useProjectStore((s) =>
    s.editingSymbolId ? (s.project.symbols[s.editingSymbolId] ?? null) : null,
  );

export const useCompositions = () =>
  useProjectStore((s) => {
    const list = Object.values(s.project.compositions);
    return list.length === 0 ? EMPTY_COMPOSITIONS : list;
  });

export const useComposition = (compositionId: string) =>
  useProjectStore((s) => s.project.compositions[compositionId] ?? null);

/** Layers of the active composition OR the symbol being edited. */
export const useActiveLayers = (): Layer[] =>
  useProjectStore((s) => {
    if (s.editingSymbolId) {
      return s.project.symbols[s.editingSymbolId]?.layers ?? EMPTY_LAYERS;
    }
    const comp = s.project.compositions[s.project.activeCompositionId];
    return comp?.layers ?? EMPTY_LAYERS;
  });

export const useSelectedLayer = (): Layer | null =>
  useProjectStore((s) => {
    const layers = s.editingSymbolId
      ? (s.project.symbols[s.editingSymbolId]?.layers ?? EMPTY_LAYERS)
      : (s.project.compositions[s.project.activeCompositionId]?.layers ??
        EMPTY_LAYERS);
    if (s.selectedLayerId) {
      return layers.find((l) => l.id === s.selectedLayerId) ?? null;
    }
    return layers[0] ?? null;
  });

export const useCurrentFrame = () => useProjectStore((s) => s.currentFrame);

export const useCanUndo = () => useProjectStore((s) => s.past.length > 0);

export const useCanRedo = () => useProjectStore((s) => s.future.length > 0);

export const useElementsAtCurrentFrame = (layerId: string): Element[] =>
  useProjectStore((s) => {
    const layers = s.editingSymbolId
      ? (s.project.symbols[s.editingSymbolId]?.layers ?? EMPTY_LAYERS)
      : (s.project.compositions[s.project.activeCompositionId]?.layers ??
        EMPTY_LAYERS);
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return EMPTY_ELEMENTS;
    return getElementsAtFrame(layer.keyframes, s.currentFrame);
  });

export const useAssetsMap = () => useProjectStore((s) => s.project.assets);

export const useAssets = (): Asset[] => {
  const assets = useProjectStore((s) => s.project.assets);
  return useMemo(() => {
    const values = Object.values(assets);
    return values.length === 0 ? EMPTY_ASSETS : values;
  }, [assets]);
};

export const useSymbols = (): Symbol[] => {
  const symbols = useProjectStore((s) => s.project.symbols);
  return useMemo(() => {
    const values = Object.values(symbols);
    return values.length === 0 ? EMPTY_SYMBOLS : values;
  }, [symbols]);
};

export const useAsset = (assetId: string) =>
  useProjectStore((s) => s.project.assets[assetId] ?? null);

export const useSymbol = (symbolId: string) =>
  useProjectStore((s) => s.project.symbols[symbolId] ?? null);

export const useFps = () => useProjectStore((s) => s.project.settings.fps);

export const useStageSize = () =>
  useProjectStore((s) => ({
    width: s.project.settings.width,
    height: s.project.settings.height,
  }));

export const useCompositionDuration = () =>
  useProjectStore((s) => {
    if (s.editingSymbolId) {
      const symbol = s.project.symbols[s.editingSymbolId];
      return symbol?.duration ?? 1;
    }
    const comp = s.project.compositions[s.project.activeCompositionId];
    return comp?.duration ?? s.project.settings.duration;
  });
