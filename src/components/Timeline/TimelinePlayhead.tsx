import { useRef, useCallback } from "react";

interface TimelinePlayheadProps {
  frame: number;
  zoom: number;
  maxFrame: number;
  scrollX?: number;
  onChange: (frame: number) => void;
}

export function TimelinePlayhead({
  frame,
  zoom,
  maxFrame,
  scrollX = 0,
  onChange,
}: TimelinePlayheadProps) {
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;

      const tracksArea = (
        e.currentTarget.parentElement ?? e.currentTarget
      ).getBoundingClientRect();
      const scrollElement =
        e.currentTarget.parentElement?.querySelector(".tracks-scroll");

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const scrollLeft =
          scrollElement instanceof HTMLElement ? scrollElement.scrollLeft : 0;
        const newFrame = Math.max(
          0,
          Math.min(
            maxFrame,
            Math.round((ev.clientX - tracksArea.left + scrollLeft) / zoom),
          ),
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
    [zoom, maxFrame, onChange],
  );

  return (
    <div
      className="playhead"
      style={{ left: frame * zoom - scrollX }}
      onMouseDown={handleMouseDown}
    >
      <div className="playhead-head" />
      <div className="playhead-line" />
    </div>
  );
}
