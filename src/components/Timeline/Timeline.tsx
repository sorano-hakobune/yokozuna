import { useState, useCallback } from "react";
import {
  useActiveComposition,
  useActiveLayers,
  useActiveCompositionId,
  useProjectSettings,
} from "@/stores/projectSelectors";
import { useProjectStore } from "@/stores/projectStore";
import { TimelineRuler } from "./TimelineRuler";
import { TimelinePlayhead } from "./TimelinePlayhead";
import { LayerRow } from "./LayerRow";
import "./timeline.css";

export function Timeline() {
  const composition = useActiveComposition();
  const layers = useActiveLayers();
  const compositionId = useActiveCompositionId();
  const settings = useProjectSettings();

  const currentFrame = useProjectStore((s) => s.currentFrame);
  const setCurrentFrame = useProjectStore((s) => s.setCurrentFrame);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const setSelectedLayerId = useProjectStore((s) => s.setSelectedLayerId);
  const addLayer = useProjectStore((s) => s.addLayer);
  const updateLayer = useProjectStore((s) => s.updateLayer);

  const [zoom, setZoom] = useState(12);
  const [scrollX, setScrollX] = useState(0);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.min(40, Math.max(4, z - e.deltaY * 0.05)));
    }
  }, []);

  if (!composition || !compositionId) {
    return <div className="timeline empty">No active composition</div>;
  }

  const totalWidth = composition.duration * zoom;

  return (
    <div className="timeline" onWheel={handleWheel}>
      <div className="layer-list">
        <div className="layer-list-header">
          <button onClick={() => addLayer()}>＋ Layer</button>
        </div>
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={`layer-header-row ${
              layer.id === selectedLayerId ? "selected" : ""
            }`}
            onClick={() => setSelectedLayerId(layer.id)}
          >
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) =>
                updateLayer(layer.id, { visible: e.target.checked })
              }
              onClick={(e) => e.stopPropagation()}
            />
            <span className="layer-name">{layer.name}</span>
          </div>
        ))}
      </div>

      <div className="tracks-area">
        <TimelineRuler
          duration={composition.duration}
          fps={settings.fps}
          zoom={zoom}
          scrollX={scrollX}
        />

        <div
          className="tracks-scroll"
          style={{ width: totalWidth }}
          onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
        >
          {layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              zoom={zoom}
              currentFrame={currentFrame}
            />
          ))}
        </div>

        <TimelinePlayhead
          frame={currentFrame}
          zoom={zoom}
          onChange={setCurrentFrame}
          maxFrame={composition.duration}
        />
      </div>
    </div>
  );
}
