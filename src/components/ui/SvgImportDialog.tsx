import { useEffect, useState } from "react";
import { Dialog, DialogField, DialogRow } from "./Dialog";

export type SvgImportMode = "vector" | "bitmap" | "both";

export type SvgImportSettings = {
  mode: SvgImportMode;
  scale: number;
};

type Props = {
  open: boolean;
  fileName: string;
  onClose: () => void;
  onImport: (settings: SvgImportSettings) => void | Promise<void>;
};

export function SvgImportDialog({ open, fileName, onClose, onImport }: Props) {
  const [mode, setMode] = useState<SvgImportMode>("vector");
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (open) {
      setMode("vector");
      setScale(1);
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      title="SVG を読み込み"
      onClose={onClose}
      confirmLabel="読み込み"
      onConfirm={() => onImport({ mode, scale })}
      size="sm"
    >
      <p className="yo-dialog-hint" style={{ marginTop: 0 }}>
        ファイル: <strong>{fileName || "（未選択）"}</strong>
      </p>
      <DialogField label="読み込み方法" full>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="radio"
              value="vector"
              checked={mode === "vector"}
              onChange={() => setMode("vector")}
              style={{ accentColor: "var(--yo-accent)" }}
            />
            <span>ベクター（パス・図形に変換）</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="radio"
              value="bitmap"
              checked={mode === "bitmap"}
              onChange={() => setMode("bitmap")}
              style={{ accentColor: "var(--yo-accent)" }}
            />
            <span>ビットマップ（画像として配置）</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <input
              type="radio"
              value="both"
              checked={mode === "both"}
              onChange={() => setMode("both")}
              style={{ accentColor: "var(--yo-accent)" }}
            />
            <span>両方（ベクター + ビットマップ）</span>
          </label>
        </div>
      </DialogField>
      <DialogRow>
        <DialogField label="スケール">
          <input
            type="number"
            min={0.01}
            max={20}
            step={0.1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value) || 1)}
          />
        </DialogField>
      </DialogRow>
      <p className="yo-dialog-hint">
        ベクターは現在のレイヤー・フレームに図形として追加されます。配置はステージ中央基準です。
      </p>
    </Dialog>
  );
}
