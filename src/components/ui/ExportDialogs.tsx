import { useEffect, useState } from "react";
import { Dialog, DialogCheck, DialogField, DialogRow } from "./Dialog";

export type PngExportSettings = {
  startFrame: number;
  endFrame: number;
  scale: number;
  transparent: boolean;
  asZip: boolean;
  filePrefix: string;
};

export type WebmExportSettings = {
  startFrame: number;
  endFrame: number;
  scale: number;
  fps: number;
  fileName: string;
};

type PngProps = {
  open: boolean;
  lastFrame: number;
  defaultPrefix: string;
  onClose: () => void;
  onExport: (settings: PngExportSettings) => void | Promise<void>;
  busy?: boolean;
};

export function PngExportDialog({
  open,
  lastFrame,
  defaultPrefix,
  onClose,
  onExport,
  busy = false,
}: PngProps) {
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(lastFrame);
  const [scale, setScale] = useState(1);
  const [transparent, setTransparent] = useState(false);
  const [asZip, setAsZip] = useState(true);
  const [filePrefix, setFilePrefix] = useState(defaultPrefix);

  useEffect(() => {
    if (open) {
      setStartFrame(0);
      setEndFrame(lastFrame);
      setScale(1);
      setTransparent(false);
      setAsZip(true);
      setFilePrefix(defaultPrefix);
    }
  }, [open, lastFrame, defaultPrefix]);

  const valid =
    startFrame >= 0 &&
    endFrame >= startFrame &&
    endFrame <= lastFrame &&
    scale > 0 &&
    filePrefix.trim().length > 0;

  return (
    <Dialog
      open={open}
      title="PNG 連番を書き出し"
      onClose={onClose}
      confirmLabel={busy ? "書き出し中…" : "書き出し"}
      confirmDisabled={!valid || busy}
      busyText={busy ? "フレームをレンダリングしています…" : null}
      onConfirm={() =>
        onExport({
          startFrame,
          endFrame,
          scale,
          transparent,
          asZip,
          filePrefix: filePrefix.trim(),
        })
      }
      size="md"
    >
      <DialogRow>
        <DialogField label="開始フレーム">
          <input
            type="number"
            min={0}
            max={lastFrame}
            value={startFrame}
            onChange={(e) => setStartFrame(Number(e.target.value))}
          />
        </DialogField>
        <DialogField label="終了フレーム">
          <input
            type="number"
            min={0}
            max={lastFrame}
            value={endFrame}
            onChange={(e) => setEndFrame(Number(e.target.value))}
          />
        </DialogField>
      </DialogRow>
      <DialogRow>
        <DialogField label="スケール">
          <input
            type="number"
            min={0.1}
            max={8}
            step={0.1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
        </DialogField>
        <DialogField label="ファイル名プレフィックス">
          <input
            type="text"
            value={filePrefix}
            onChange={(e) => setFilePrefix(e.target.value)}
          />
        </DialogField>
      </DialogRow>
      <p className="yo-dialog-hint">
        フレーム範囲: 0 〜 {lastFrame}（計 {Math.max(0, endFrame - startFrame + 1)} 枚）
        ・出力先は書き出し開始時に選択します
      </p>
      <DialogCheck
        label="背景を透明にする（透明 PNG）"
        checked={transparent}
        onChange={setTransparent}
      />
      <DialogCheck
        label="ZIP にまとめてダウンロード"
        checked={asZip}
        onChange={setAsZip}
      />
    </Dialog>
  );
}

type WebmProps = {
  open: boolean;
  lastFrame: number;
  defaultFps: number;
  defaultName: string;
  onClose: () => void;
  onExport: (settings: WebmExportSettings) => void | Promise<void>;
  busy?: boolean;
};

export function WebmExportDialog({
  open,
  lastFrame,
  defaultFps,
  defaultName,
  onClose,
  onExport,
  busy = false,
}: WebmProps) {
  const [startFrame, setStartFrame] = useState(0);
  const [endFrame, setEndFrame] = useState(lastFrame);
  const [scale, setScale] = useState(1);
  const [fps, setFps] = useState(defaultFps);
  const [fileName, setFileName] = useState(defaultName);

  useEffect(() => {
    if (open) {
      setStartFrame(0);
      setEndFrame(lastFrame);
      setScale(1);
      setFps(defaultFps);
      setFileName(defaultName);
    }
  }, [open, lastFrame, defaultFps, defaultName]);

  const valid =
    startFrame >= 0 &&
    endFrame >= startFrame &&
    endFrame <= lastFrame &&
    scale > 0 &&
    fps > 0 &&
    fileName.trim().length > 0;

  return (
    <Dialog
      open={open}
      title="WebM 動画を書き出し"
      onClose={onClose}
      confirmLabel={busy ? "書き出し中…" : "書き出し"}
      confirmDisabled={!valid || busy}
      busyText={busy ? "動画をエンコードしています…" : null}
      onConfirm={() =>
        onExport({
          startFrame,
          endFrame,
          scale,
          fps,
          fileName: fileName.trim(),
        })
      }
      size="md"
    >
      <DialogRow>
        <DialogField label="開始フレーム">
          <input
            type="number"
            min={0}
            max={lastFrame}
            value={startFrame}
            onChange={(e) => setStartFrame(Number(e.target.value))}
          />
        </DialogField>
        <DialogField label="終了フレーム">
          <input
            type="number"
            min={0}
            max={lastFrame}
            value={endFrame}
            onChange={(e) => setEndFrame(Number(e.target.value))}
          />
        </DialogField>
      </DialogRow>
      <DialogRow>
        <DialogField label="FPS">
          <input
            type="number"
            min={1}
            max={120}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
          />
        </DialogField>
        <DialogField label="スケール">
          <input
            type="number"
            min={0.1}
            max={8}
            step={0.1}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          />
        </DialogField>
      </DialogRow>
      <DialogField label="ファイル名" full>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
        />
      </DialogField>
      <p className="yo-dialog-hint">
        フレーム範囲: 0 〜 {lastFrame} ・ 出力先は書き出し開始時に選択します。
        音声がある場合は自動でミックスされます。
      </p>
    </Dialog>
  );
}
