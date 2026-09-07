import type { InspectorModel } from "../hooks/useInspectorModel";

export function LayerSection({ m }: { m: InspectorModel }) {
  const { activeLayer, updateLayer } = m;
  if (!activeLayer) return null;
  return (
    <div className="prop-group">
      <div className="prop-label">レイヤー</div>
      <label className="prop-field">
        <span>名称</span>
        <input
          type="text"
          value={activeLayer.name || ""}
          onChange={(e) =>
            updateLayer(activeLayer.id, { name: e.target.value })
          }
        />
      </label>
      <div className="prop-field">
        <span>種別</span>
        <div className="prop-readonly">
          {activeLayer.type === "normal"
            ? "通常"
            : activeLayer.type === "mask"
              ? "マスク"
              : activeLayer.type === "guide"
                ? "ガイド"
                : activeLayer.type}
        </div>
      </div>
    </div>
  );
}
