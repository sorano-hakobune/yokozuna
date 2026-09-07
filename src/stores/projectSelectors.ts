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

export const useCompositions = () =>
  useProjectStore((s) => Object.values(s.project.compositions));

export const useComposition = (compositionId: string) =>
  useProjectStore((s) => s.project.compositions[compositionId] ?? null);

export const useActiveLayers = (): Layer[] =>
  useProjectStore((s) => {
    const comp = s.project.compositions[s.project.activeCompositionId];
    return comp?.layers ?? [];
  });

export const useSelectedLayer = (): Layer | null =>
  useProjectStore((s) => {
    const comp = s.project.compositions[s.project.activeCompositionId];
    if (!comp) return null;
    if (s.selectedLayerId) {
      return comp.layers.find((l) => l.id === s.selectedLayerId) ?? null;
    }
    return comp.layers[0] ?? null;
  });

export const useCurrentFrame = () => useProjectStore((s) => s.currentFrame);

export const useElementsAtCurrentFrame = (layerId: string): Element[] =>
  useProjectStore((s) => {
    const comp = s.project.compositions[s.project.activeCompositionId];
    if (!comp) return [];
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return [];
    return getElementsAtFrame(layer.keyframes, s.currentFrame);
  });

export const useAssets = (): Asset[] =>
  useProjectStore((s) => Object.values(s.project.assets));

export const useSymbols = (): Symbol[] =>
  useProjectStore((s) => Object.values(s.project.symbols));

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
    const comp = s.project.compositions[s.project.activeCompositionId];
    return comp?.duration ?? s.project.settings.duration;
  });
