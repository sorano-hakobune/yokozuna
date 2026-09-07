import { useEffect, useState } from "react";
import { Dialog, DialogField } from "./Dialog";

export type SymbolTypeChoice = "graphic" | "movieClip";

export type SymbolDialogSettings = {
  name: string;
  symbolType: SymbolTypeChoice;
};

type Props = {
  open: boolean;
  mode: "create" | "convert";
  defaultName: string;
  onClose: () => void;
  onConfirm: (settings: SymbolDialogSettings) => void;
};

export function SymbolDialog({
  open,
  mode,
  defaultName,
  onClose,
  onConfirm,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [symbolType, setSymbolType] = useState<SymbolTypeChoice>("graphic");

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setSymbolType("graphic");
    }
  }, [open, defaultName]);

  const valid = name.trim().length > 0;

  return (
    <Dialog
      open={open}
      title={mode === "convert" ? "シンボルに変換" : "新規シンボル"}
      onClose={onClose}
      confirmLabel={mode === "convert" ? "変換" : "作成"}
      confirmDisabled={!valid}
      onConfirm={() => onConfirm({ name: name.trim(), symbolType })}
      size="sm"
    >
      <DialogField label="シンボル名" full>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </DialogField>
      <DialogField label="種類" full>
        <select
          value={symbolType}
          onChange={(e) => setSymbolType(e.target.value as SymbolTypeChoice)}
        >
          <option value="graphic">グラフィック (graphic)</option>
          <option value="movieClip">ムービークリップ (movieClip)</option>
        </select>
      </DialogField>
      <p className="yo-dialog-hint">
        {mode === "convert"
          ? "選択中のオブジェクトをシンボルに変換し、インスタンスに置き換えます。"
          : "空のシンボルをライブラリに追加します。ダブルクリックで編集できます。"}
      </p>
    </Dialog>
  );
}
