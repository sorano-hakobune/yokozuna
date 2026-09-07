import type { MenuItemEntry } from "../menuTypes";

export type EditMenuDeps = {
  pastLength: number;
  futureLength: number;
  clipboardLength: number;
  hasSelection: boolean;
  selectedLayerId: string | undefined;
  currentFrame: number;
  undo: () => void;
  redo: () => void;
  cutSelection: () => void;
  copySelection: () => void;
  pasteClipboard: (layerId: string | undefined, frame: number) => void;
  duplicateSelection: () => void;
  removeElement: (layerId: string, frame: number, elementId: string) => void;
  selectedElementId: string | undefined;
};

export function buildEditItems(d: EditMenuDeps): MenuItemEntry[] {
  return [
    { label: "元に戻す", kicker: "Ctrl+Z", disabled: d.pastLength === 0, onClick: () => d.undo() },
    { label: "やり直す", kicker: "Ctrl+Shift+Z", disabled: d.futureLength === 0, onClick: () => d.redo() },
    "sep",
    { label: "切り取り", kicker: "Ctrl+X", disabled: !d.hasSelection, onClick: () => d.cutSelection() },
    { label: "コピー", kicker: "Ctrl+C", disabled: !d.hasSelection, onClick: () => d.copySelection() },
    {
      label: "貼り付け",
      kicker: "Ctrl+V",
      disabled: d.clipboardLength === 0,
      onClick: () => d.pasteClipboard(d.selectedLayerId, d.currentFrame),
    },
    { label: "複製", kicker: "Ctrl+D", disabled: !d.hasSelection, onClick: () => d.duplicateSelection() },
    {
      label: "選択オブジェクトを削除",
      kicker: "Del",
      disabled: !d.hasSelection,
      onClick: () => {
        if (d.selectedLayerId && d.selectedElementId) {
          d.removeElement(d.selectedLayerId, d.currentFrame, d.selectedElementId);
        }
      },
    },
  ];
}
