import React from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useSelectedLayer } from "@/stores/projectSelectors";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import type { ShapeElement } from "@/types/project";

export const Inspector: React.FC = () => {
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const selectedElementId = useProjectStore((s) => s.selectedElementId);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const updateElement = useProjectStore((s) => s.updateElement);
  const removeElement = useProjectStore((s) => s.removeElement);

  const activeLayer = useSelectedLayer();

  if (!activeLayer) {
    return (
      <aside style={panelStyle}>
        <div style={headerStyle}>Inspector</div>
        <div style={{ padding: "16px", color: "#71717a", fontSize: "12px" }}>
          レイヤーが選択されていません
        </div>
      </aside>
    );
  }

  const elements = getElementsAtFrame(activeLayer.keyframes, currentFrame);
  const selectedElement = elements.find(
    (el) => el.id === selectedElementId
  ) as ShapeElement | undefined;

  const handleElementPropertyChange = (
    key: string,
    value: number | string
  ) => {
    if (!selectedElementId) return;
    updateElement(activeLayer.id, currentFrame, selectedElementId, {
      [key]: value,
    } as any);
  };

  const handleDeleteElement = () => {
    if (!selectedElementId) return;
    removeElement(activeLayer.id, currentFrame, selectedElementId);
  };

  return (
    <aside style={panelStyle}>
      <div style={headerStyle}>Inspector</div>

      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <section>
          <div style={sectionTitleStyle}>Layer Info</div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={activeLayer.name || ""}
              onChange={(e) =>
                updateLayer(activeLayer.id, { name: e.target.value })
              }
              style={inputTextStyle}
            />
          </div>
        </section>

        {selectedElement ? (
          <section>
            <div style={sectionTitleStyle}>
              Element (Frame: {currentFrame})
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Type</label>
              <div style={inputStyle}>
                {selectedElement.type}
                {selectedElement.type === "shape"
                  ? ` / ${selectedElement.shapeType}`
                  : ""}
              </div>
            </div>

            <div style={{ ...gridStyle, marginTop: "8px" }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>X</label>
                <input
                  type="number"
                  value={Math.round(selectedElement.x ?? 0)}
                  onChange={(e) =>
                    handleElementPropertyChange("x", Number(e.target.value))
                  }
                  style={inputStyle}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Y</label>
                <input
                  type="number"
                  value={Math.round(selectedElement.y ?? 0)}
                  onChange={(e) =>
                    handleElementPropertyChange("y", Number(e.target.value))
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ ...gridStyle, marginTop: "8px" }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Scale X</label>
                <input
                  type="number"
                  step="0.1"
                  value={selectedElement.scaleX ?? 1}
                  onChange={(e) =>
                    handleElementPropertyChange(
                      "scaleX",
                      Number(e.target.value)
                    )
                  }
                  style={inputStyle}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Scale Y</label>
                <input
                  type="number"
                  step="0.1"
                  value={selectedElement.scaleY ?? 1}
                  onChange={(e) =>
                    handleElementPropertyChange(
                      "scaleY",
                      Number(e.target.value)
                    )
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ ...gridStyle, marginTop: "8px" }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Rotation</label>
                <input
                  type="number"
                  value={Math.round(selectedElement.rotation ?? 0)}
                  onChange={(e) =>
                    handleElementPropertyChange(
                      "rotation",
                      Number(e.target.value)
                    )
                  }
                  style={inputStyle}
                />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Opacity</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedElement.opacity ?? 1}
                  onChange={(e) =>
                    handleElementPropertyChange(
                      "opacity",
                      Number(e.target.value)
                    )
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            {selectedElement.type === "shape" &&
              selectedElement.shapeType === "rectangle" && (
                <div style={{ ...gridStyle, marginTop: "8px" }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Width</label>
                    <input
                      type="number"
                      value={selectedElement.width ?? 100}
                      onChange={(e) =>
                        handleElementPropertyChange(
                          "width",
                          Number(e.target.value)
                        )
                      }
                      style={inputStyle}
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Height</label>
                    <input
                      type="number"
                      value={selectedElement.height ?? 100}
                      onChange={(e) =>
                        handleElementPropertyChange(
                          "height",
                          Number(e.target.value)
                        )
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

            {selectedElement.type === "shape" &&
              selectedElement.shapeType === "circle" && (
                <div style={{ marginTop: "8px" }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Radius</label>
                    <input
                      type="number"
                      value={selectedElement.radius ?? 50}
                      onChange={(e) =>
                        handleElementPropertyChange(
                          "radius",
                          Number(e.target.value)
                        )
                      }
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

            {selectedElement.type === "shape" && (
              <div style={{ ...gridStyle, marginTop: "8px" }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Fill</label>
                  <input
                    type="color"
                    value={selectedElement.fill ?? "#3b82f6"}
                    onChange={(e) =>
                      handleElementPropertyChange("fill", e.target.value)
                    }
                    style={{ ...inputStyle, padding: 0, height: 28 }}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Stroke</label>
                  <input
                    type="color"
                    value={selectedElement.stroke ?? "#1d4ed8"}
                    onChange={(e) =>
                      handleElementPropertyChange("stroke", e.target.value)
                    }
                    style={{ ...inputStyle, padding: 0, height: 28 }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleDeleteElement}
              style={{
                marginTop: 12,
                background: "#7f1d1d",
                border: "1px solid #991b1b",
                color: "#fff",
                borderRadius: 4,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Delete Element
            </button>
          </section>
        ) : (
          <div style={{ color: "#71717a", fontSize: 12 }}>
            要素が選択されていません。キャンバス上で図形をクリックしてください。
          </div>
        )}
      </div>
    </aside>
  );
};

const panelStyle: React.CSSProperties = {
  width: 260,
  backgroundColor: "#18181b",
  borderLeft: "1px solid #27272a",
  color: "#f4f4f5",
  overflowY: "auto",
  flexShrink: 0,
};

const headerStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid #27272a",
  fontWeight: "bold",
  fontSize: 13,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#a1a1aa",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#71717a",
};

const inputStyle: React.CSSProperties = {
  backgroundColor: "#27272a",
  border: "1px solid #3f3f46",
  borderRadius: 4,
  color: "#fff",
  padding: "4px 8px",
  fontSize: 12,
};

const inputTextStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};
