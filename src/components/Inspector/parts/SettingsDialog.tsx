import type { RefObject } from "react";
import type { InspectorModel } from "../hooks/useInspectorModel";

export function SettingsDialog({
  m,
  dialogRef,
}: {
  m: InspectorModel;
  dialogRef: RefObject<HTMLDialogElement | null>;
}) {
  const { settings, updateSettings } = m;
  return (
    <dialog
      ref={dialogRef}
      id="document-settings"
      className="settings-dialog"
    >
      <form method="dialog" className="settings-dialog-form">
        <div className="settings-dialog-title">ドキュメント設定</div>
        <div className="settings-grid">
          <label className="prop-field">
            <span>ステージ幅</span>
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
            <span>ステージ高さ</span>
            <input
              type="number"
              min={1}
              value={settings.height}
              onChange={(e) =>
                updateSettings({
                  height: Math.max(1, Number(e.target.value)),
                })
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
            <span>フレーム数</span>
            <input
              type="number"
              min={1}
              value={settings.duration}
              onChange={(e) =>
                updateSettings({ duration: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="prop-field" style={{ marginTop: 12 }}>
          <span>背景色</span>
          <input
            type="color"
            value={settings.backgroundColor}
            onChange={(e) =>
              updateSettings({ backgroundColor: e.target.value })
            }
          />
        </label>
        <div className="settings-dialog-actions">
          <button value="cancel">閉じる</button>
        </div>
      </form>
    </dialog>
  );
}
