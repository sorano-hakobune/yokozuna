import { useState, useCallback, useRef, useEffect } from "react";
import {
  Eye,
  EyeOff,
  GripVertical,
  Copy,
  Lock,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  useActiveComposition,
  useActiveLayers,
  useActiveCompositionId,
  useProjectSettings,
  useCompositionDuration,
} from "@/stores/projectSelectors";
import { useProjectStore } from "@/stores/projectStore";
import {
  cycleLayerType,
  getLayerDepth,
  getTimelineVisibleLayers,
  isLayerMasked,
  layerTypeLabel,
} from "@/lib/layers";
import type { LayerType } from "@/types/project";
import { TimelineRuler } from "./TimelineRuler";
import type { FrameLabel } from "@/types/project";

const EMPTY_FRAME_LABELS: FrameLabel[] = [];
import { TimelinePlayhead } from "./TimelinePlayhead";
import { LayerRow } from "./LayerRow";
import { LayerNameEditor } from "./LayerNameEditor";
import { AudioTrack } from "./AudioTrack";
import { PlaybackControls } from "@/components/Playback";
import "./timeline.css";

export function Timeline() {
  const composition = useActiveComposition();
  const layers = useActiveLayers();
  const compositionId = useActiveCompositionId();
  const settings = useProjectSettings();
  const compositionDuration = useCompositionDuration();

  const currentFrame = useProjectStore((s) => s.currentFrame);
  const setCurrentFrame = useProjectStore((s) => s.setCurrentFrame);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const setSelectedLayerId = useProjectStore((s) => s.setSelectedLayerId);
  const editingSymbolId = useProjectStore((s) => s.editingSymbolId);
  const addLayer = useProjectStore((s) => s.addLayer);
  const addFolder = useProjectStore((s) => s.addFolder);
  const toggleFolderExpanded = useProjectStore((s) => s.toggleFolderExpanded);
  const updateLayer = useProjectStore((s) => s.updateLayer);
  const removeLayer = useProjectStore((s) => s.removeLayer);
  const duplicateLayer = useProjectStore((s) => s.duplicateLayer);
  const reorderLayers = useProjectStore((s) => s.reorderLayers);
  const addFrameLabel = useProjectStore((s) => s.addFrameLabel);
  const updateFrameLabel = useProjectStore((s) => s.updateFrameLabel);
  const removeFrameLabel = useProjectStore((s) => s.removeFrameLabel);

  const [zoom, setZoom] = useState(12);
  const [scrollX, setScrollX] = useState(0);

  /** Layer id being dragged for reorder */
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** Insert index in the layers array (0 = top). Drop before this index. */
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.min(40, Math.max(4, z - e.deltaY * 0.05)));
    }
  }, []);

  const clearDrag = () => {
    dragIdRef.current = null;
    setDraggingId(null);
    setDropIndex(null);
  };

  useEffect(() => {
    if (!draggingId) return;

    const handlePointerMove = (e: PointerEvent) => {
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-layer-index]");
      if (!target) return;

      const index = Number(target.dataset.layerIndex);
      const rect = target.getBoundingClientRect();
      setDropIndex(e.clientY < rect.top + rect.height / 2 ? index : index + 1);
    };

    const handlePointerUp = (e: PointerEvent) => {
      const fromId = dragIdRef.current;
      if (fromId) {
        const target = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>("[data-layer-index]");
        const index = target ? Number(target.dataset.layerIndex) : null;
        const insertAt =
          index === null
            ? layers.length
            : e.clientY <
                target!.getBoundingClientRect().top +
                  target!.getBoundingClientRect().height / 2
              ? index
              : index + 1;
        applyReorder(fromId, insertAt);
      }
      clearDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggingId, layers.length]);

  const applyReorder = (fromId: string, insertIndex: number) => {
    // Prefer live store state so reorder works even if the drag spanned a re-render
    const state = useProjectStore.getState();
    const liveLayers = state.editingSymbolId
      ? state.project.symbols[state.editingSymbolId]?.layers
      : state.project.compositions[state.project.activeCompositionId]?.layers;
    const current = liveLayers ?? layers;
    const from = current.findIndex((l) => l.id === fromId);
    if (from < 0) return;
    let to = insertIndex;
    // Adjust when removing the source shifts indices after it
    if (to > from) to -= 1;
    if (to === from) return;
    if (to < 0) to = 0;
    if (to > current.length - 1) to = current.length - 1;

    const ids = current.map((l) => l.id);
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    reorderLayers(ids);
  };

  if (!composition || !compositionId) {
    return <div className="timeline empty">コンポジションを開くとタイムラインが表示されます</div>;
  }

  const duration = compositionDuration || composition.duration;
  const totalWidth = duration * zoom;
  const hasDrawnContent = layers.some((layer) =>
    layer.keyframes.some((kf) => (kf.elements?.length ?? 0) > 0),
  );

  return (
    <div className="timeline-fill" onWheel={handleWheel}>
      <PlaybackControls />
      <div className="timeline">
        <div className="layer-list">
          <div className="layer-list-header">
            <span>名称</span>
            <span className="layer-col">種別</span>
            <button
              type="button"
              onClick={() => addLayer()}
              title="レイヤーを追加"
            >
              <Plus size={11} />
            </button>
            <button
              type="button"
              onClick={() => addFolder()}
              title="フォルダを追加"
            >
              📁
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedLayerId) removeLayer(selectedLayerId);
              }}
              title="レイヤーを削除"
            >
              <Trash2 size={11} />
            </button>
          </div>
          {getTimelineVisibleLayers(layers).map((layer) => {
            const index = layers.findIndex((l) => l.id === layer.id);
            const masked = isLayerMasked(layers, layer.id);
            const isDragging = draggingId === layer.id;
            const depth = getLayerDepth(layers, layer.id);
            const showDropBefore =
              dropIndex === index &&
              draggingId !== null &&
              draggingId !== layer.id;
            const isFolder = layer.type === "folder";
            return (
              <div key={layer.id} className="layer-row-wrap">
                {showDropBefore && <div className="layer-drop-line" />}
                <div
                  data-layer-index={index}
                  className={`layer-header-row ${
                    layer.id === selectedLayerId ? "selected" : ""
                  } layer-type-${layer.type} ${masked ? "is-masked" : ""} ${
                    isDragging ? "is-dragging" : ""
                  }`}
                  style={{ paddingLeft: 4 + depth * 10 }}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  {isFolder ? (
                    <button
                      type="button"
                      className="layer-icon-btn layer-folder-toggle"
                      title={
                        layer.expanded === false ? "展開" : "折りたたむ"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolderExpanded(layer.id);
                      }}
                    >
                      {layer.expanded === false ? "▶" : "▼"}
                    </button>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      className="layer-icon-btn layer-grip"
                      title="ドラッグで並び替え（上が前面）"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dragIdRef.current = layer.id;
                        setDraggingId(layer.id);
                        setSelectedLayerId(layer.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                          e.preventDefault();
                      }}
                    >
                      <GripVertical
                        size={12}
                        style={{ pointerEvents: "none" }}
                      />
                    </span>
                  )}
                  <button
                    type="button"
                    className="layer-icon-btn"
                    title={
                      isFolder
                        ? layer.visible
                          ? "フォルダ内を非表示"
                          : "フォルダ内を表示"
                        : layer.visible
                          ? "非表示"
                          : "表示"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { visible: !layer.visible });
                    }}
                  >
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    type="button"
                    className="layer-icon-btn"
                    title={layer.locked ? "ロック解除" : "ロック"}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { locked: !layer.locked });
                    }}
                  >
                    {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  {!isFolder && (
                    <button
                      type="button"
                      className="layer-icon-btn"
                      title="レイヤーを複製"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLayer(layer.id);
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  )}
                  <LayerNameEditor
                    name={layer.name}
                    masked={masked}
                    onSelect={() => setSelectedLayerId(layer.id)}
                    onRename={(next) => updateLayer(layer.id, { name: next })}
                  />
                  {isFolder ? (
                    <span className="layer-type-btn type-folder">フォルダ</span>
                  ) : (
                    <button
                      type="button"
                      className={`layer-type-btn type-${layer.type}`}
                      title="クリックで種別を切替（通常 → マスク → ガイド）"
                      onClick={(e) => {
                        e.stopPropagation();
                        const next: LayerType = cycleLayerType(layer.type);
                        updateLayer(layer.id, { type: next });
                      }}
                    >
                      {layerTypeLabel(layer.type)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {/* Drop zone after last layer */}
          {draggingId && (
            <div
              className={`layer-drop-tail ${
                dropIndex === layers.length ? "is-active" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setDropIndex(layers.length);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const fromId =
                  dragIdRef.current ||
                  e.dataTransfer.getData("text/layer-id") ||
                  e.dataTransfer.getData("text/plain");
                if (fromId) applyReorder(fromId, layers.length);
                clearDrag();
              }}
            >
              {dropIndex === layers.length && (
                <div className="layer-drop-line" />
              )}
            </div>
          )}
          {!editingSymbolId && (
            <div className="audio-track-header-slot" title="コンポジション音声">
              <span className="audio-track-label">♪ 音声</span>
            </div>
          )}
        </div>

        <div className="tracks-area">
          <TimelineRuler
            duration={duration}
            fps={settings.fps}
            zoom={zoom}
            scrollX={scrollX}
            width={totalWidth}
            onSeek={setCurrentFrame}
            labels={composition?.labels ?? EMPTY_FRAME_LABELS}
            onAddLabel={(frame) => {
              const name = window.prompt(
                `フレーム ${frame} のラベル名`,
                `ラベル ${frame}`,
              );
              if (name == null) return;
              addFrameLabel(frame, name);
            }}
            onEditLabel={(lab) => {
              const name = window.prompt("ラベル名を変更", lab.name);
              if (name == null) return;
              updateFrameLabel(lab.id, { name });
            }}
            onRemoveLabel={(id) => removeFrameLabel(id)}
          />

          <div
            className="tracks-scroll"
            onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
          >
            <div
              className="tracks-content"
              style={{ width: Math.max(totalWidth, 1), minWidth: totalWidth }}
            >
              {getTimelineVisibleLayers(layers).map((layer) =>
                layer.type === "folder" ? (
                  <div
                    key={layer.id}
                    className="folder-track-spacer"
                    title={layer.name}
                  />
                ) : (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    zoom={zoom}
                    currentFrame={currentFrame}
                  />
                ),
              )}
              <AudioTrack zoom={zoom} duration={duration} />
            </div>
            {!hasDrawnContent && (
              <div className="timeline-empty-guide" role="note">
                <strong>タイムラインの使い方</strong>
                <span>グレーのマスは空きフレームです。ダブルクリックまたは F6 でキーフレームを追加できます。</span>
                <span>図形を描くと、現在フレームに自動でキーフレームが作られます。</span>
              </div>
            )}
          </div>

          <TimelinePlayhead
            frame={currentFrame}
            zoom={zoom}
            scrollX={scrollX}
            onChange={setCurrentFrame}
            maxFrame={Math.max(0, duration - 1)}
          />
        </div>
      </div>
    </div>
  );
}
