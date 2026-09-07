import {
  Circle,
  Droplet,
  Eraser,
  Hand,
  Minus,
  MousePointer2,
  Pencil,
  Pipette,
  Square,
  Type,
} from "lucide-react";
import type { ToolType } from "@/types/project";
import { useProjectStore } from "@/stores/projectStore";
import { toHex6 } from "@/lib/color";

const TOOLS: {
  id: ToolType;
  label: string;
  shortcut: string;
  Icon: typeof Square;
}[] = [
  { id: "select", label: "選択", shortcut: "V", Icon: MousePointer2 },
  { id: "hand", label: "ハンド", shortcut: "H", Icon: Hand },
  { id: "rectangle", label: "矩形", shortcut: "R", Icon: Square },
  { id: "circle", label: "円", shortcut: "C", Icon: Circle },
  { id: "line", label: "線", shortcut: "L", Icon: Minus },
  { id: "freehand", label: "ペン", shortcut: "B", Icon: Pencil },
  { id: "text", label: "文字", shortcut: "T", Icon: Type },
  { id: "paintbucket", label: "塗りつぶし", shortcut: "K", Icon: Droplet },
  { id: "eyedropper", label: "スポイト", shortcut: "I", Icon: Pipette },
  { id: "eraser", label: "消しゴム", shortcut: "E", Icon: Eraser },
];

export function ToolsPanel() {
  const selectedTool = useProjectStore((s) => s.selectedTool);
  const setSelectedTool = useProjectStore((s) => s.setSelectedTool);
  const drawingFill = useProjectStore((s) => s.drawingFill);
  const drawingStroke = useProjectStore((s) => s.drawingStroke);
  const drawingStrokeWidth = useProjectStore((s) => s.drawingStrokeWidth);
  const setDrawingFill = useProjectStore((s) => s.setDrawingFill);
  const setDrawingStroke = useProjectStore((s) => s.setDrawingStroke);
  const setDrawingStrokeWidth = useProjectStore((s) => s.setDrawingStrokeWidth);
  const textOrientation = useProjectStore((s) => s.textOrientation);
  const setTextOrientation = useProjectStore((s) => s.setTextOrientation);

  return (
    <aside className="tools-dock" aria-label="ツール">
      <div className="tool-grid">
        {TOOLS.map(({ id, label, shortcut, Icon }) => (
          <button
            key={id}
            type="button"
            className={`tool-btn ${selectedTool === id ? "is-active" : ""}`}
            title={`${label} (${shortcut})`}
            aria-pressed={selectedTool === id}
            aria-label={label}
            onClick={() => setSelectedTool(id)}
          >
            <Icon size={13} strokeWidth={selectedTool === id ? 2.25 : 1.75} />
          </button>
        ))}
      </div>
      {selectedTool === "text" && (
        <div className="text-orient-stack" title="横書き / 縦書き">
          <button
            type="button"
            className={
              textOrientation === "horizontal"
                ? "tool-btn is-active"
                : "tool-btn"
            }
            title="横書き"
            onClick={() => setTextOrientation("horizontal")}
          >
            横
          </button>
          <button
            type="button"
            className={
              textOrientation === "vertical" ? "tool-btn is-active" : "tool-btn"
            }
            title="縦書き"
            onClick={() => setTextOrientation("vertical")}
          >
            縦
          </button>
        </div>
      )}
      {/* Drawing style group: always visible for quick access */}
      <div className="tool-style-group" title="描画スタイル">
        <div className="tool-style-caption">スタイル</div>
        <div className="color-chips" aria-label="塗りと線">
          <label
            className="color-chip fill"
            style={{ background: toHex6(drawingFill, "#0066cc") }}
            title="塗り色"
          >
            <span className="color-chip-tag">塗</span>
            <input
              type="color"
              value={toHex6(drawingFill, "#0066cc")}
              onChange={(e) => setDrawingFill(e.target.value)}
            />
          </label>
          <label
            className="color-chip stroke"
            style={{ background: toHex6(drawingStroke, "#111111") }}
            title="線色"
          >
            <span className="color-chip-tag">線</span>
            <input
              type="color"
              value={toHex6(drawingStroke, "#111111")}
              onChange={(e) => setDrawingStroke(e.target.value)}
            />
          </label>
        </div>
        <label className="stroke-width-control" title="線幅">
          <span className="stroke-width-label">線幅</span>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={drawingStrokeWidth}
            onChange={(e) =>
              setDrawingStrokeWidth(Math.max(1, Number(e.target.value) || 1))
            }
          />
        </label>
      </div>
    </aside>
  );
}
