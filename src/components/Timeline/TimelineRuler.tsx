import type { FrameLabel } from "@/types/project";

interface TimelineRulerProps {
  duration: number;
  fps?: number;
  zoom: number;
  scrollX: number;
  width?: number;
  onSeek?: (frame: number) => void;
  labels?: FrameLabel[];
  onAddLabel?: (frame: number) => void;
  onEditLabel?: (label: FrameLabel) => void;
  onRemoveLabel?: (id: string) => void;
}

export function TimelineRuler({
  duration,
  zoom,
  scrollX,
  width,
  onSeek,
  labels = [],
  onAddLabel,
  onEditLabel,
  onRemoveLabel,
}: TimelineRulerProps) {
  const majorStep = zoom < 8 ? 24 : zoom < 16 ? 12 : 6;
  const marks: number[] = [];
  for (let f = 0; f <= duration; f += majorStep) {
    marks.push(f);
  }

  const frameFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollX;
    return Math.max(0, Math.min(duration - 1, Math.round(x / zoom)));
  };

  return (
    <div
      className="timeline-ruler"
      style={{ width, minWidth: width, transform: `translateX(-${scrollX}px)` }}
      onMouseDown={(e) => {
        if (!onSeek) return;
        if ((e.target as HTMLElement).closest(".ruler-frame-label")) return;
        onSeek(frameFromEvent(e));
      }}
      onDoubleClick={(e) => {
        if (!onAddLabel) return;
        if ((e.target as HTMLElement).closest(".ruler-frame-label")) return;
        e.preventDefault();
        onAddLabel(frameFromEvent(e));
      }}
      title="ダブルクリックでフレームラベルを追加"
    >
      {marks.map((frame) => (
        <div key={frame} className="ruler-mark" style={{ left: frame * zoom }}>
          <span className="ruler-label">
            {frame}
            <small>f</small>
          </span>
        </div>
      ))}
      {labels.map((lab) => (
        <div
          key={lab.id}
          className="ruler-frame-label"
          style={{
            left: lab.frame * zoom,
            borderColor: lab.color || "#e05a3c",
            background: lab.color
              ? `${lab.color}33`
              : "rgba(224, 90, 60, 0.2)",
          }}
          title={`${lab.name} (F${lab.frame}) — クリックで移動 / ダブルクリックで編集`}
          onMouseDown={(e) => {
            e.stopPropagation();
            onSeek?.(lab.frame);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onEditLabel?.(lab);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (
              onRemoveLabel &&
              window.confirm(`ラベル「${lab.name}」を削除しますか？`)
            ) {
              onRemoveLabel(lab.id);
            }
          }}
        >
          <span className="ruler-frame-label-text">{lab.name}</span>
        </div>
      ))}
    </div>
  );
}
