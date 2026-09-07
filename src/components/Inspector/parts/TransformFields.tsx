import type { InspectorModel } from "../hooks/useInspectorModel";

export function elementTypeLabel(m: InspectorModel): string {
  const el = m.selectedElement;
  if (!el) return "";
  const typeLabel =
    el.type === "shape" ? "図形" : el.type === "instance" ? "シンボル" : el.type === "bitmap" ? "ビットマップ" : el.type;
  const shapeLabels: Record<string, string> = {
    rectangle: "長方形",
    circle: "円",
    line: "線",
    path: "パス",
    text: "テキスト",
  };
  const shape =
    el.type === "shape" ? (shapeLabels[el.shapeType] ?? el.shapeType) : "";
  return shape ? `${typeLabel} · ${shape}` : typeLabel;
}

export function TransformFields({ m }: { m: InspectorModel }) {
  const el = m.selectedElement;
  if (!el) return null;
  const on = m.handleElementPropertyChange;
  return (
    <>
      <label className="prop-field">
        <span>X</span>
        <input
          type="number"
          value={Math.round(el.x ?? 0)}
          onChange={(e) => on("x", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>Y</span>
        <input
          type="number"
          value={Math.round(el.y ?? 0)}
          onChange={(e) => on("y", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>拡大 X</span>
        <input
          type="number"
          step="0.1"
          value={el.scaleX ?? 1}
          onChange={(e) => on("scaleX", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>拡大 Y</span>
        <input
          type="number"
          step="0.1"
          value={el.scaleY ?? 1}
          onChange={(e) => on("scaleY", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>回転</span>
        <input
          type="number"
          value={Math.round(el.rotation ?? 0)}
          onChange={(e) => on("rotation", Number(e.target.value))}
        />
      </label>
      <label className="prop-field">
        <span>不透明度</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={el.opacity ?? 1}
          onChange={(e) => on("opacity", Number(e.target.value))}
        />
      </label>
    </>
  );
}
