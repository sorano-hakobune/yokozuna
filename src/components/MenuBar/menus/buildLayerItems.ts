import type { Layer } from "@/types/project";
import type { MenuItemEntry } from "../menuTypes";

export type LayerMenuDeps = {
  selectedLayerId: string | undefined;
  layers: Layer[];
  addLayer: () => void;
  addFolder: () => void;
  setLayerParent: (id: string, parentId: string | undefined) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>) => void;
  reorderLayers: (ids: string[]) => void;
  onRename: () => void;
};

export function buildLayerItems(d: LayerMenuDeps): MenuItemEntry[] {
  const moveSelected = (dir: -1 | 1) => {
    if (!d.selectedLayerId || d.layers.length < 2) return;
    const ids = d.layers.map((l) => l.id);
    const i = ids.indexOf(d.selectedLayerId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j]!, next[i]!];
    d.reorderLayers(next);
  };

  return [
    { label: "新規レイヤー", onClick: () => d.addLayer() },
    { label: "新規フォルダ", onClick: () => d.addFolder() },
    {
      label: "選択をフォルダから出す",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.setLayerParent(d.selectedLayerId, undefined);
      },
    },
    {
      label: "選択レイヤーを削除",
      disabled: !d.selectedLayerId || d.layers.length <= 1,
      onClick: () => {
        if (d.selectedLayerId) d.removeLayer(d.selectedLayerId);
      },
    },
    {
      label: "選択レイヤー名を変更…",
      kicker: "F2",
      disabled: !d.selectedLayerId,
      onClick: d.onRename,
    },
    "sep",
    {
      label: "レイヤー種別：通常",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.updateLayer(d.selectedLayerId, { type: "normal" });
      },
    },
    {
      label: "レイヤー種別：マスク",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.updateLayer(d.selectedLayerId, { type: "mask" });
      },
    },
    {
      label: "レイヤー種別：ガイド",
      disabled: !d.selectedLayerId,
      onClick: () => {
        if (d.selectedLayerId) d.updateLayer(d.selectedLayerId, { type: "guide" });
      },
    },
    "sep",
    {
      label: "前面へ（上へ）",
      disabled: !d.selectedLayerId || d.layers.length < 2,
      onClick: () => moveSelected(-1),
    },
    {
      label: "背面へ（下へ）",
      disabled: !d.selectedLayerId || d.layers.length < 2,
      onClick: () => moveSelected(1),
    },
  ];
}
