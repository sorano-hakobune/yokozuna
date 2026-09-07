import { toHex6 } from "@/lib/color";
import {
  defaultLinearGradient,
  defaultRadialGradient,
} from "@/lib/draw/gradient";
import type { GradientFill } from "@/types/project";
import type { InspectorModel } from "../hooks/useInspectorModel";

export function FillSection({ m }: { m: InspectorModel }) {
  const el = m.selectedElement;
  if (el?.type !== "shape" || el.shapeType === "text") return null;
  const on = m.handleElementPropertyChange;
  return (
    <>
      <label className="prop-field">
        <span>塗り</span>
        <input
          type="color"
          value={toHex6(el.fill, "#0066cc")}
          onChange={(e) => on("fill", e.target.value)}
        />
      </label>
      <label className="prop-field">
        <span>塗り種別</span>
        <select
          value={el.fillGradient ? el.fillGradient.type : "solid"}
          onChange={(e) => {
            if (el.type !== "shape") return;
            const v = e.target.value;
            if (v === "solid") {
              on("fillGradient", undefined);
            } else if (v === "linear") {
              on(
                "fillGradient",
                defaultLinearGradient(el.fill ?? "#e05a3c", "#3d7eb8"),
              );
            } else {
              on(
                "fillGradient",
                defaultRadialGradient(el.fill ?? "#e8eef2", "#e05a3c"),
              );
            }
          }}
        >
          <option value="solid">単色</option>
          <option value="linear">線形グラデーション</option>
          <option value="radial">放射グラデーション</option>
        </select>
      </label>
      {el.fillGradient && (
        <div className="prop-group" style={{ marginTop: 4 }}>
          {(el.fillGradient.stops ?? []).map((stop, i) => (
            <label className="prop-field" key={i}>
              <span>停止 {i + 1}</span>
              <input
                type="color"
                value={toHex6(stop.color, "#000000")}
                onChange={(e) => {
                  const g = { ...el.fillGradient! } as GradientFill;
                  const stops = [...g.stops];
                  stops[i] = { ...stops[i]!, color: e.target.value };
                  on("fillGradient", { ...g, stops });
                }}
              />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(stop.offset * 100)}
                title="位置 %"
                onChange={(e) => {
                  const g = { ...el.fillGradient! } as GradientFill;
                  const stops = [...g.stops];
                  stops[i] = {
                    ...stops[i]!,
                    offset: Math.max(
                      0,
                      Math.min(1, Number(e.target.value) / 100),
                    ),
                  };
                  on("fillGradient", { ...g, stops });
                }}
              />
            </label>
          ))}
          {el.fillGradient.type === "linear" && (
            <label className="prop-field">
              <span>角度</span>
              <input
                type="number"
                min={0}
                max={360}
                value={
                  Math.round(
                    (Math.atan2(
                      el.fillGradient.y2 - el.fillGradient.y1,
                      el.fillGradient.x2 - el.fillGradient.x1,
                    ) *
                      180) /
                      Math.PI +
                      (el.fillGradient.y2 - el.fillGradient.y1 < 0 &&
                      el.fillGradient.x2 - el.fillGradient.x1 < 0
                        ? 360
                        : 0),
                  ) || 0
                }
                onChange={(e) => {
                  const deg = Number(e.target.value) || 0;
                  const rad = (deg * Math.PI) / 180;
                  const cx = 0.5;
                  const cy = 0.5;
                  const dx = Math.cos(rad) * 0.5;
                  const dy = Math.sin(rad) * 0.5;
                  on("fillGradient", {
                    ...el.fillGradient!,
                    type: "linear",
                    x1: cx - dx,
                    y1: cy - dy,
                    x2: cx + dx,
                    y2: cy + dy,
                  });
                }}
              />
            </label>
          )}
        </div>
      )}
    </>
  );
}

export function StrokeFields({ m }: { m: InspectorModel }) {
  const el = m.selectedElement;
  if (el?.type !== "shape" || el.shapeType === "text") return null;
  const on = m.handleElementPropertyChange;
  return (
    <>
      <label className="prop-field">
        <span>線色</span>
        <input
          type="color"
          value={toHex6(el.stroke, "#111111")}
          onChange={(e) => on("stroke", e.target.value)}
        />
      </label>
      <label className="prop-field">
        <span>線幅</span>
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={el.strokeWidth ?? 1}
          onChange={(e) =>
            on("strokeWidth", Math.max(0, Number(e.target.value)))
          }
        />
      </label>
    </>
  );
}
