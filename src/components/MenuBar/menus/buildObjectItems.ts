import type { MenuItemEntry } from "../menuTypes";

export type ObjectMenuDeps = {
  hasSelection: boolean;
  onConvertToSymbol: () => void;
  onNewSymbol: () => void;
  alignSelection: (mode: "left" | "centerH" | "right" | "top" | "middleV" | "bottom") => void;
  distributeSelection: (axis: "horizontal" | "vertical") => void;
};

export function buildObjectItems(d: ObjectMenuDeps): MenuItemEntry[] {
  return [
    { label: "シンボルに変換…", kicker: "F8", onClick: d.onConvertToSymbol },
    { label: "新規シンボル…", onClick: d.onNewSymbol },
    "sep",
    { label: "左揃え", disabled: !d.hasSelection, onClick: () => d.alignSelection("left") },
    { label: "左右中央揃え", disabled: !d.hasSelection, onClick: () => d.alignSelection("centerH") },
    { label: "右揃え", disabled: !d.hasSelection, onClick: () => d.alignSelection("right") },
    { label: "上揃え", disabled: !d.hasSelection, onClick: () => d.alignSelection("top") },
    { label: "上下中央揃え", disabled: !d.hasSelection, onClick: () => d.alignSelection("middleV") },
    { label: "下揃え", disabled: !d.hasSelection, onClick: () => d.alignSelection("bottom") },
    "sep",
    { label: "横方向に分布", disabled: !d.hasSelection, onClick: () => d.distributeSelection("horizontal") },
    { label: "縦方向に分布", disabled: !d.hasSelection, onClick: () => d.distributeSelection("vertical") },
  ];
}
