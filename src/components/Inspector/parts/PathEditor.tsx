import { flattenPathPoints, smoothPathPoints } from "@/lib/draw/pathBezier";
import type { InspectorModel } from "../hooks/useInspectorModel";

export function PathEditor({ m }: { m: InspectorModel }) {
  const el = m.selectedElement;
  if (
    el?.type !== "shape" ||
    (el.shapeType !== "path" && el.shapeType !== "line")
  ) {
    return null;
  }
  const { pathEditMode, setPathEditMode, handleElementPropertyChange } = m;
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        className="prop-readonly"
        style={{ fontSize: 11, opacity: 0.75, marginBottom: 6 }}
      >
        {pathEditMode
          ? "頂点編集中（Esc で終了）"
          : "ダブルクリック、または下のボタンで頂点を編集"}
      </div>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => setPathEditMode(!pathEditMode)}
      >
        {pathEditMode ? "頂点編集を終了" : "頂点を編集"}
      </button>
      {pathEditMode && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          <button
            type="button"
            className="ghost-btn"
            title="全頂点にスムースハンドルを付与"
            onClick={() => {
              if (el.type !== "shape") return;
              const pts = el.points ?? [];
              if (pts.length < 2) return;
              handleElementPropertyChange(
                "points",
                smoothPathPoints(pts, !!el.closePath, 0.35),
              );
            }}
          >
            曲線を滑らかに
          </button>
          <button
            type="button"
            className="ghost-btn"
            title="ハンドルを削除して折れ線に戻す"
            onClick={() => {
              if (el.type !== "shape") return;
              const pts = el.points ?? [];
              handleElementPropertyChange("points", flattenPathPoints(pts));
            }}
          >
            直線化
          </button>
        </div>
      )}
      {pathEditMode && (
        <div
          className="prop-readonly"
          style={{ fontSize: 10, opacity: 0.65, marginTop: 6 }}
        >
          頂点ダブルクリックでハンドル追加 · ハンドルドラッグで曲線調整 · Alt+ドラッグでコーナー
        </div>
      )}
    </div>
  );
}
