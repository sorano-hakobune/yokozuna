import { useProjectStore } from "@/stores/projectStore";

export function StageZoomControls() {
  const canvasZoom = useProjectStore((s) => s.canvasZoom);
  const setCanvasZoom = useProjectStore((s) => s.setCanvasZoom);
  const setCanvasPan = useProjectStore((s) => s.setCanvasPan);

  const zoomIn = () => setCanvasZoom(Math.min(8, canvasZoom * 1.25));
  const zoomOut = () => setCanvasZoom(Math.max(0.1, canvasZoom / 1.25));
  const zoomReset = () => {
    setCanvasZoom(1);
    setCanvasPan({ x: 0, y: 0 });
  };

  return (
    <div className="stage-zoom-controls">
      <button type="button" className="stage-zoom-btn" onClick={zoomOut} title="ズームアウト">
        −
      </button>
      <button
        type="button"
        className="stage-zoom-btn stage-zoom-pct"
        onClick={zoomReset}
        title="100%"
      >
        {Math.round(canvasZoom * 100)}%
      </button>
      <button type="button" className="stage-zoom-btn" onClick={zoomIn} title="ズームイン">
        ＋
      </button>
      <button type="button" className="stage-zoom-btn stage-zoom-fit" onClick={zoomReset} title="ステージ全体を表示">
        全体
      </button>
    </div>
  );
}
