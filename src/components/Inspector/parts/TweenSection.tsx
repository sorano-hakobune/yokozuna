import { useProjectStore } from "@/stores/projectStore";
import type { EasingType, TweenType } from "@/types/project";
import { EASING_GROUPS, DEFAULT_CUBIC_BEZIER } from "@/lib/animation/easing";
import {
  createDefaultMotionPath,
  motionPathFromShapePoints,
} from "@/lib/animation/motionPath";
import { BezierPreview } from "./BezierPreview";
import type { InspectorModel } from "../hooks/useInspectorModel";

export function TweenSection({ m }: { m: InspectorModel }) {
  const {
    activeLayer,
    currentFrame,
    currentKeyframe,
    hasNextKeyframe,
    selectedElement,
    setKeyframeTween,
    setKeyframeMotionPath,
  } = m;
  if (!activeLayer || !currentKeyframe) return null;
  return (
    <div className="prop-group">
      <div className="prop-label">トゥイーン · F{currentFrame}</div>
      <label className="prop-field">
        <span>種類</span>
        <select
          value={currentKeyframe.tween}
          disabled={!hasNextKeyframe && currentKeyframe.tween === "none"}
          onChange={(e) => {
            const tween = e.target.value as TweenType;
            setKeyframeTween(
              activeLayer.id,
              currentFrame,
              tween,
              tween === "none" ? undefined : (currentKeyframe.easing ?? "linear"),
            );
          }}
        >
          <option value="none">なし</option>
          <option value="motion" disabled={!hasNextKeyframe}>
            モーション
          </option>
          <option value="shape" disabled={!hasNextKeyframe}>
            シェイプ
          </option>
        </select>
      </label>
      {currentKeyframe.tween !== "none" && (
        <>
          <label className="prop-field">
            <span>イージング</span>
            <select
              value={currentKeyframe.easing ?? "linear"}
              onChange={(e) => {
                setKeyframeTween(
                  activeLayer.id,
                  currentFrame,
                  currentKeyframe.tween,
                  e.target.value as EasingType,
                );
              }}
            >
              {EASING_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          {(currentKeyframe.easing ?? "linear") === "custom" && (
            <div className="prop-group" style={{ marginTop: 6 }}>
              <div className="prop-label" style={{ fontSize: 11 }}>
                cubic-bezier
              </div>
              <BezierPreview
                bezier={currentKeyframe.easingBezier ?? DEFAULT_CUBIC_BEZIER}
              />
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}
              >
                {(["x1", "y1", "x2", "y2"] as const).map((key, idx) => {
                  const bezier =
                    currentKeyframe.easingBezier ?? DEFAULT_CUBIC_BEZIER;
                  return (
                    <label className="prop-field" key={key}>
                      <span>{key}</span>
                      <input
                        type="number"
                        step={0.01}
                        min={key.startsWith("x") ? 0 : -2}
                        max={key.startsWith("x") ? 1 : 2}
                        value={bezier[idx]}
                        onChange={(e) => {
                          const next: [number, number, number, number] = [
                            ...bezier,
                          ] as [number, number, number, number];
                          let v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          if (key.startsWith("x")) {
                            v = Math.max(0, Math.min(1, v));
                          }
                          next[idx] = v;
                          useProjectStore
                            .getState()
                            .updateKeyframe(activeLayer.id, currentFrame, {
                              easing: "custom",
                              easingBezier: next,
                            });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {(
                  [
                    ["ease", [0.25, 0.1, 0.25, 1] as const],
                    ["ease-in", [0.42, 0, 1, 1] as const],
                    ["ease-out", [0, 0, 0.58, 1] as const],
                    ["ease-in-out", [0.42, 0, 0.58, 1] as const],
                  ] as const
                ).map(([label, vals]) => (
                  <button
                    key={label}
                    type="button"
                    className="ghost-btn"
                    style={{ fontSize: 10, padding: "2px 6px" }}
                    onClick={() =>
                      useProjectStore.getState().updateKeyframe(
                        activeLayer.id,
                        currentFrame,
                        {
                          easing: "custom",
                          easingBezier: [...vals] as [
                            number, number, number, number,
                          ],
                        },
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {currentKeyframe.tween === "motion" && (
        <div style={{ marginTop: 8 }}>
          <div className="prop-label" style={{ fontSize: 11 }}>
            モーションパス
          </div>
          {currentKeyframe.motionPath ? (
            <>
              <label className="prop-field">
                <span>パスに沿って回転</span>
                <input
                  type="checkbox"
                  checked={!!currentKeyframe.motionPath.orientToPath}
                  onChange={(e) =>
                    setKeyframeMotionPath(activeLayer.id, currentFrame, {
                      ...currentKeyframe.motionPath!,
                      orientToPath: e.target.checked,
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="ghost-btn"
                onClick={() =>
                  setKeyframeMotionPath(activeLayer.id, currentFrame, undefined)
                }
              >
                パスを削除
              </button>
            </>
          ) : (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                const sorted = [...(activeLayer.keyframes ?? [])].sort(
                  (a, b) => a.frame - b.frame,
                );
                const idx = sorted.findIndex(
                  (k) => k.frame === currentKeyframe.frame,
                );
                const next = sorted[idx + 1];
                const elA = currentKeyframe.elements[0];
                const elB =
                  next?.elements.find((e) => e.id === elA?.id) ?? next?.elements[0];
                if (!elA) return;
                const from = { x: elA.x, y: elA.y };
                const to = elB
                  ? { x: elB.x, y: elB.y }
                  : { x: elA.x + 120, y: elA.y - 40 };
                setKeyframeMotionPath(
                  activeLayer.id,
                  currentFrame,
                  createDefaultMotionPath(from, to),
                );
              }}
            >
              パスを作成
            </button>
          )}
          {selectedElement &&
            selectedElement.type === "shape" &&
            (selectedElement.shapeType === "path" ||
              selectedElement.shapeType === "line") &&
            (selectedElement.points?.length ?? 0) >= 2 && (
              <button
                type="button"
                className="ghost-btn"
                style={{ marginTop: 4 }}
                onClick={() => {
                  const pts = selectedElement.points ?? [];
                  setKeyframeMotionPath(
                    activeLayer.id,
                    currentFrame,
                    motionPathFromShapePoints(
                      pts,
                      { x: selectedElement.x, y: selectedElement.y },
                      selectedElement.rotation ?? 0,
                      selectedElement.scaleX ?? 1,
                      selectedElement.scaleY ?? 1,
                      selectedElement.pivot
                        ? { x: selectedElement.pivot.x, y: selectedElement.pivot.y }
                        : undefined,
                    ),
                  );
                  if (currentKeyframe.tween !== "motion") {
                    setKeyframeTween(
                      activeLayer.id,
                      currentFrame,
                      "motion",
                      currentKeyframe.easing ?? "linear",
                    );
                  }
                }}
              >
                選択パスをモーションパスに
              </button>
            )}
        </div>
      )}
    </div>
  );
}

export function NoKeyframeNotice({ m }: { m: InspectorModel }) {
  if (!m.activeLayer || m.currentKeyframe) return null;
  return (
    <div className="prop-group prop-group-selection">
      <div className="prop-label">トゥイーン</div>
      <div className="prop-readonly" style={{ fontSize: 11, opacity: 0.7 }}>
        このフレームにはまだキーフレームがありません。ダブルクリックか F6 で追加できます。
      </div>
    </div>
  );
}

export function MultiSelectionSummary({ m }: { m: InspectorModel }) {
  if (m.selectedElementIds.length <= 1) return null;
  return (
    <div className="prop-group">
      <div className="prop-label">選択</div>
      <div className="prop-readonly">
        {m.selectedElementIds.length} 個のオブジェクトを選択中
      </div>
      <div className="prop-readonly" style={{ fontSize: 11, opacity: 0.7 }}>
        ドラッグで一括移動 · Delete で削除 · Esc で解除
      </div>
    </div>
  );
}
