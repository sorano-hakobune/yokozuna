interface TimelineRulerProps {
  duration: number;
  fps?: number;
  zoom: number;
  scrollX: number;
}

export function TimelineRuler({
  duration,
  zoom,
  scrollX,
}: TimelineRulerProps) {
  const majorStep = zoom < 8 ? 24 : zoom < 16 ? 12 : 6;
  const marks: number[] = [];
  for (let f = 0; f <= duration; f += majorStep) {
    marks.push(f);
  }

  return (
    <div
      className="timeline-ruler"
      style={{ transform: `translateX(-${scrollX}px)` }}
    >
      {marks.map((frame) => (
        <div
          key={frame}
          className="ruler-mark"
          style={{ left: frame * zoom }}
        >
          <span className="ruler-label">
            {frame}
            <small>f</small>
          </span>
        </div>
      ))}
    </div>
  );
}
