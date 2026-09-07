import type { StateCreator } from "zustand";
import type { ProjectState, AssetSlice } from "./types";
import type { Element, Layer } from "@/types/project";
import { prepareHistoryPatch, touchMeta } from "./shared";
import { generateId } from "@/lib/project";

export const createAssetSlice: StateCreator<ProjectState, [], [], AssetSlice> = (
  set,
) => ({
    addAsset: (assetData) => {
      const id = generateId("asset");
      set((state) => ({
        ...prepareHistoryPatch(state),
        project: {
          ...state.project,
          assets: { ...state.project.assets, [id]: { ...assetData, id } },
          meta: touchMeta(state.project),
        },
      }));
      return id;
    },

    addSymbol: (symbolData) => {
      const id = generateId("sym");
      set((state) => ({
        ...prepareHistoryPatch(state),
        project: {
          ...state.project,
          symbols: { ...state.project.symbols, [id]: { ...symbolData, id } },
          meta: touchMeta(state.project),
        },
      }));
      return id;
    },

    renameAsset: (assetId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      set((state) => {
        const asset = state.project.assets[assetId];
        if (!asset || asset.name === trimmed) return state;
        return {
          ...prepareHistoryPatch(state),
          project: {
            ...state.project,
            assets: {
              ...state.project.assets,
              [assetId]: { ...asset, name: trimmed },
            },
            meta: touchMeta(state.project),
          },
        };
      });
    },

    deleteAsset: (assetId) => {
      set((state) => {
        if (!state.project.assets[assetId]) return state;
        const { [assetId]: _removed, ...restAssets } = state.project.assets;
        // Strip bitmap elements that reference this asset
        const stripElements = (elements: Element[]) =>
          elements.filter(
            (el) => !(el.type === "bitmap" && el.assetId === assetId),
          );
        const stripLayers = (layers: Layer[]) =>
          layers.map((layer) => ({
            ...layer,
            keyframes: layer.keyframes.map((kf) => ({
              ...kf,
              elements: stripElements(kf.elements),
            })),
          }));

        const compositions = { ...state.project.compositions };
        for (const id of Object.keys(compositions)) {
          const c = compositions[id]!;
          compositions[id] = {
            ...c,
            layers: stripLayers(c.layers),
            sounds: (c.sounds ?? []).filter((s) => s.assetId !== assetId),
          };
        }
        const symbols = { ...state.project.symbols };
        for (const id of Object.keys(symbols)) {
          const s = symbols[id]!;
          symbols[id] = { ...s, layers: stripLayers(s.layers) };
        }

        return {
          ...prepareHistoryPatch(state),
          project: {
            ...state.project,
            assets: restAssets,
            compositions,
            symbols,
            meta: touchMeta(state.project),
          },
          selectedSoundId:
            state.selectedSoundId &&
            (state.project.assets[assetId]
              ? // clear if selected sound used this asset
                (Object.values(state.project.compositions)
                  .flatMap((c) => c.sounds ?? [])
                  .find((s) => s.id === state.selectedSoundId)?.assetId ===
                assetId
                  ? undefined
                  : state.selectedSoundId)
              : state.selectedSoundId),
        };
      });
    },
});
