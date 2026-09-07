import type { Layer } from "@/types/project";
import { useProjectStore } from "@/stores/projectStore";
import { KeyframeMarker } from "./KeyframeMarker";

interface LayerRowProps {
  layer: Layer;
  zoom: number;
  currentFrame: number;
}

export function LayerRow({ layer, zoom, currentFrame }: LayerRowProps) {
  const addKeyframe = useProjectStore((s) => s.addKeyframe);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (layer.locked) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.round(x / zoom);

    addKeyframe(layer.id, frame);
  };

  return (
    <div
      className={`track ${layer.locked ? "locked" : ""}`}
      onClick={handleTrackClick}
    >
      {layer.keyframes.map((kf) => (
        <KeyframeMarker
          key={`${layer.id}-${kf.frame}`}
          layerId={layer.id}
          keyframe={kf}
          zoom={zoom}
          isCurrent={kf.frame === currentFrame}
        />
      ))}
    </div>
  );
}
