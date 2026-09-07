import type { ElementFilter } from "@/types/project";
import { FILTER_TYPE_LABELS, defaultFilter } from "@/lib/filters";
import { toHex6 } from "@/lib/color";
import type { InspectorModel } from "../hooks/useInspectorModel";

export function FilterSection({ m }: { m: InspectorModel }) {
  const el = m.selectedElement;
  if (!el) return null;
  const { setElementFilters } = m;
  return (
    <>
      <div className="prop-label" style={{ marginTop: 10 }}>
        フィルター
      </div>
      {(el.filters ?? []).map((f, idx) => {
        const list = el.filters ?? [];
        const patch = (next: ElementFilter) => {
          const copy = list.map((x, i) => (i === idx ? next : x));
          setElementFilters(copy);
        };
        const remove = () => {
          setElementFilters(list.filter((_, i) => i !== idx));
        };
        return (
          <div
            key={`${f.type}-${idx}`}
            style={{
              border: "1px solid #2a353c",
              borderRadius: 6,
              padding: "6px 8px",
              marginBottom: 6,
              background: "#1a2228",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
                fontSize: 11,
              }}
            >
              <span>{FILTER_TYPE_LABELS[f.type]}</span>
              <button
                type="button"
                className="ghost-btn"
                style={{ padding: "0 6px", fontSize: 11 }}
                onClick={remove}
              >
                ×
              </button>
            </div>
            {f.type === "blur" && (
              <label className="prop-field">
                <span>量</span>
                <input
                  type="number"
                  min={0}
                  max={40}
                  step={0.5}
                  value={f.amount}
                  onChange={(e) =>
                    patch({ type: "blur", amount: Number(e.target.value) })
                  }
                />
              </label>
            )}
            {f.type === "dropShadow" && (
              <>
                <label className="prop-field">
                  <span>X</span>
                  <input
                    type="number"
                    value={f.dx}
                    onChange={(e) => patch({ ...f, dx: Number(e.target.value) })}
                  />
                </label>
                <label className="prop-field">
                  <span>Y</span>
                  <input
                    type="number"
                    value={f.dy}
                    onChange={(e) => patch({ ...f, dy: Number(e.target.value) })}
                  />
                </label>
                <label className="prop-field">
                  <span>ぼかし</span>
                  <input
                    type="number"
                    min={0}
                    value={f.blur}
                    onChange={(e) => patch({ ...f, blur: Number(e.target.value) })}
                  />
                </label>
                <label className="prop-field">
                  <span>色</span>
                  <input
                    type="color"
                    value={toHex6(f.color, "#000000")}
                    onChange={(e) => patch({ ...f, color: e.target.value })}
                  />
                </label>
                <label className="prop-field">
                  <span>不透明度</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={f.opacity}
                    onChange={(e) =>
                      patch({ ...f, opacity: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            )}
            {f.type === "glow" && (
              <>
                <label className="prop-field">
                  <span>量</span>
                  <input
                    type="number"
                    min={0}
                    value={f.amount}
                    onChange={(e) =>
                      patch({ ...f, amount: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="prop-field">
                  <span>色</span>
                  <input
                    type="color"
                    value={toHex6(f.color, "#e05a3c")}
                    onChange={(e) => patch({ ...f, color: e.target.value })}
                  />
                </label>
                <label className="prop-field">
                  <span>不透明度</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={f.opacity}
                    onChange={(e) =>
                      patch({ ...f, opacity: Number(e.target.value) })
                    }
                  />
                </label>
              </>
            )}
            {(f.type === "brightness" ||
              f.type === "contrast" ||
              f.type === "saturate") && (
              <label className="prop-field">
                <span>量</span>
                <input
                  type="number"
                  min={0}
                  max={3}
                  step={0.05}
                  value={f.amount}
                  onChange={(e) =>
                    patch({ ...f, amount: Number(e.target.value) })
                  }
                />
              </label>
            )}
            {f.type === "hueRotate" && (
              <label className="prop-field">
                <span>角度</span>
                <input
                  type="number"
                  step={1}
                  value={f.degrees}
                  onChange={(e) =>
                    patch({
                      type: "hueRotate",
                      degrees: Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
          </div>
        );
      })}
      <label className="prop-field">
        <span>追加</span>
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value as ElementFilter["type"] | "";
            if (!v) return;
            const list = el.filters ?? [];
            setElementFilters([...list, defaultFilter(v)]);
            e.target.value = "";
          }}
        >
          <option value="">＋ フィルター…</option>
          {(Object.keys(FILTER_TYPE_LABELS) as ElementFilter["type"][]).map(
            (k) => (
              <option key={k} value={k}>
                {FILTER_TYPE_LABELS[k]}
              </option>
            ),
          )}
        </select>
      </label>
    </>
  );
}
