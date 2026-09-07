import type { ToolType } from "@/types/project";

type DrawPreviewProps = {
  isDrawing: boolean;
  previewPoints: { x: number; y: number }[];
  selectedTool: ToolType;
  drawingStroke: string;
  drawingStrokeWidth: number;
};

/** Live shape preview while drawing (rectangle/circle/line/freehand/eraser). */
export function DrawPreview(p: DrawPreviewProps) {
  if (!p.isDrawing || p.previewPoints.length === 0) return null;
  if (p.selectedTool === "select" || p.selectedTool === "eraser") {
    if (p.selectedTool !== "eraser" || p.previewPoints.length < 2) return null;
    return (
      <path
        d={p.previewPoints
          .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
          .join(" ")}
        fill="none"
        stroke="#ef4444"
        strokeWidth={Math.max(2, p.drawingStrokeWidth)}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.45}
        pointerEvents="none"
      />
    );
  }
  const start = p.previewPoints[0]!;
  const end = p.previewPoints[p.previewPoints.length - 1]!;
  if (p.selectedTool === "freehand")
    return (
      <path
        d={p.previewPoints
          .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
          .join(" ")}
        fill="none"
        stroke={p.drawingStroke}
        strokeWidth={p.drawingStrokeWidth}
        strokeLinecap="round"
        opacity={0.75}
      />
    );
  if (p.selectedTool === "rectangle")
    return (
      <rect
        x={Math.min(start.x, end.x)}
        y={Math.min(start.y, end.y)}
        width={Math.max(4, Math.abs(end.x - start.x))}
        height={Math.max(4, Math.abs(end.y - start.y))}
        fill="none"
        stroke={p.drawingStroke}
        strokeWidth={p.drawingStrokeWidth}
        opacity={0.75}
      />
    );
  if (p.selectedTool === "circle")
    return (
      <circle
        cx={start.x}
        cy={start.y}
        r={Math.max(4, Math.hypot(end.x - start.x, end.y - start.y))}
        fill="none"
        stroke={p.drawingStroke}
        strokeWidth={p.drawingStrokeWidth}
        opacity={0.75}
      />
    );
  return (
    <line
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      stroke={p.drawingStroke}
      strokeWidth={p.drawingStrokeWidth}
      opacity={0.75}
    />
  );
}
