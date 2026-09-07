import type { RefObject } from "react";
import type { InspectorModel } from "../hooks/useInspectorModel";

export function DocumentSection({
  m,
  dialogRef,
}: {
  m: InspectorModel;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const { settings, updateSettings } = m;
  return (
    <div className="prop-group">
      <div className="prop-label">ドキュメント</div>
      <label className="prop-field">
        <span>幅</span>
        <input
          type="number"
          min={1}
          value={settings.width}
          onChange={(e) =>
            updateSettings({ width: Math.max(1, Number(e.target.value)) })
          }
        />
      </label>
      <label className="prop-field">
        <span>高さ</span>
        <input
          type="number"
          min={1}
          value={settings.height}
          onChange={(e) =>
            updateSettings({ height: Math.max(1, Number(e.target.value)) })
          }
        />
      </label>
      <label className="prop-field">
        <span>FPS</span>
        <input
          type="number"
          min={1}
          max={240}
          value={settings.fps}
          onChange={(e) =>
            updateSettings({
              fps: Math.max(1, Math.min(240, Number(e.target.value))),
            })
          }
        />
      </label>
      <label className="prop-field">
        <span>フレーム</span>
        <input
          type="number"
          min={1}
          value={settings.duration}
          onChange={(e) =>
            updateSettings({ duration: Number(e.target.value) })
          }
        />
      </label>
      <label className="prop-field">
        <span>背景</span>
        <input
          type="color"
          value={settings.backgroundColor}
          onChange={(e) =>
            updateSettings({ backgroundColor: e.target.value })
          }
        />
      </label>
      <label className="prop-field">
        <span>グリッド</span>
        <input
          type="checkbox"
          checked={!!settings.showGrid}
          onChange={(e) => updateSettings({ showGrid: e.target.checked })}
        />
      </label>
      <label className="prop-field">
        <span>グリッド幅</span>
        <input
          type="number"
          min={1}
          value={settings.gridSize ?? 20}
          onChange={(e) =>
            updateSettings({
              gridSize: Math.max(1, Number(e.target.value) || 20),
            })
          }
        />
      </label>
      <label className="prop-field">
        <span>スナップ</span>
        <input
          type="checkbox"
          checked={!!settings.snapToGrid}
          onChange={(e) =>
            updateSettings({ snapToGrid: e.target.checked })
          }
        />
      </label>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => dialogRef.current?.showModal()}
      >
        詳細…
      </button>
    </div>
  );
}
