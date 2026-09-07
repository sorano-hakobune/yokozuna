import { useEffect, type RefObject } from "react";
import { useProjectStore } from "@/stores/projectStore";

/** Cursor-centered wheel zoom (non-passive native listener, no native scroll). */
export function useStagePanZoom(
  stageCanvasRef: RefObject<HTMLDivElement | null>,
  svgRef: RefObject<SVGSVGElement | null>,
) {
  useEffect(() => {
    const el = stageCanvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;
      const state = useProjectStore.getState();
      const current = state.canvasZoom;
      const pan = state.canvasPan;
      const nextZoom = Math.max(
        0.1,
        Math.min(8, current * Math.pow(1.0015, -e.deltaY)),
      );
      if (Math.abs(nextZoom - current) < 1e-6) return;

      const svgRect = svg.getBoundingClientRect();
      const cx = svgRect.left + svgRect.width / 2;
      const cy = svgRect.top + svgRect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;

      const factor = 1 / nextZoom - 1 / current;
      const nextPan = {
        x: pan.x + dx * factor,
        y: pan.y + dy * factor,
      };

      state.setCanvasZoom(nextZoom);
      state.setCanvasPan(nextPan);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [stageCanvasRef, svgRef]);
}
