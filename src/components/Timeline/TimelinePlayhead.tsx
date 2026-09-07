import { useRef, useCallback } from "react";

interface TimelinePlayheadProps {
  frame: number;
  zoom: number;
  maxFrame: number;
  onChange: (frame: number) => void;
}

export function TimelinePlayhead({
  frame,
  zoom,
  maxFrame,
  onChange,
}: TimelinePlayheadProps) {
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        // 簡易実装: 親のtracksエリアからの相対位置で計算する想定
        // 本格実装時は tracksRef を渡して正確に計算する
        const x = ev.clientX;
        // ここでは仮の計算。実際は tracks の getBoundingClientRect を使う
        const newFrame = Math.max(
          0,
          Math.min(maxFrame, Math.round(x / zoom))
        );
        onChange(newFrame);
      };

      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [zoom, maxFrame, onChange]
  );

  return (
    <div
      className="playhead"
      style={{ left: frame * zoom }}
      onMouseDown={handleMouseDown}
    >
      <div className="playhead-head" />
      <div className="playhead-line" />
    </div>
  );
}
