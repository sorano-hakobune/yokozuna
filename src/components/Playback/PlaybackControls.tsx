import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
  Repeat,
  Layers2,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { usePlayback } from "@/hooks/usePlayback";
import { useFps, useCompositionDuration } from "@/stores/projectSelectors";

export function PlaybackControls() {
  const currentFrame = useProjectStore((state) => state.currentFrame);
  const setCurrentFrame = useProjectStore((state) => state.setCurrentFrame);
  const maxFrames = useCompositionDuration();
  const fps = useFps();
  const { isPlaying, isLooping, togglePlay, toggleLoop } = usePlayback();

  const onionSkinEnabled = useProjectStore((s) => s.onionSkinEnabled);
  const onionSkinBefore = useProjectStore((s) => s.onionSkinBefore);
  const onionSkinAfter = useProjectStore((s) => s.onionSkinAfter);
  const toggleOnionSkin = useProjectStore((s) => s.toggleOnionSkin);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const setOnionSkinBefore = useProjectStore((s) => s.setOnionSkinBefore);
  const setOnionSkinAfter = useProjectStore((s) => s.setOnionSkinAfter);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if ((e.code === "Space" || e.key === "Enter") && !isEditing) {
        e.preventDefault();
        togglePlay();
      }
      // O — toggle onion skin
      if (
        !isEditing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "o" || e.key === "O")
      ) {
        e.preventDefault();
        toggleOnionSkin();
      }
      // G — toggle grid
      if (
        !isEditing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "g" || e.key === "G")
      ) {
        e.preventDefault();
        const s = useProjectStore.getState().project.settings;
        updateSettings({ showGrid: !s.showGrid });
      }
      // Shift+L — toggle loop (plain L is line tool)
      if (
        !isEditing &&
        e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === "l" || e.key === "L")
      ) {
        e.preventDefault();
        toggleLoop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleOnionSkin, toggleLoop, updateSettings]);

  const lastFrame = Math.max(0, maxFrames - 1);

  return (
    <div className="flash-playback">
      <div className="play-group">
        <button
          type="button"
          onClick={() => setCurrentFrame(0)}
          title="最初のフレームへ"
        >
          <ChevronsLeft size={12} />
        </button>
        <button
          type="button"
          onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
          title="前フレーム"
        >
          <ChevronLeft size={12} />
        </button>
        <button
          type="button"
          className={isPlaying ? "is-playing" : "is-play"}
          onClick={togglePlay}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          {isPlaying ? "一時停止" : "再生"}
        </button>
        <button
          type="button"
          onClick={() => setCurrentFrame(Math.min(lastFrame, currentFrame + 1))}
          title="次フレーム"
        >
          <ChevronRight size={12} />
        </button>
        <button
          type="button"
          onClick={() => setCurrentFrame(lastFrame)}
          title="最後のフレームへ"
        >
          <ChevronsRight size={12} />
        </button>
      </div>

      <div className="info-group">
        <button
          type="button"
          className={isLooping ? "loop-btn is-on" : "loop-btn is-off"}
          onClick={() => toggleLoop()}
          title="ループ再生 (Shift+L)"
        >
          <Repeat size={12} />
          ループ
        </button>

        <div className="onion-controls" title="オニオンスキン（前後フレームのゴースト表示）">
          <button
            type="button"
            className={onionSkinEnabled ? "onion-btn is-on" : "onion-btn"}
            onClick={() => toggleOnionSkin()}
            title="オニオンスキン切替 (O)"
          >
            <Layers2 size={12} />
            オニオンスキン
          </button>
          {onionSkinEnabled && (
            <>
              <label className="onion-step">
                <span className="onion-past-label">←</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={onionSkinBefore}
                  onChange={(e) =>
                    setOnionSkinBefore(Number(e.target.value) || 0)
                  }
                  title="過去フレーム数"
                />
              </label>
              <label className="onion-step">
                <span className="onion-future-label">→</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={onionSkinAfter}
                  onChange={(e) =>
                    setOnionSkinAfter(Number(e.target.value) || 0)
                  }
                  title="未来フレーム数"
                />
              </label>
            </>
          )}
        </div>

        <label
          className="frame-jump"
          title={`フレーム番号（0始まり）· 最終 F${lastFrame} · 全${lastFrame + 1}フレーム`}
        >
          フレーム
          <input
            type="number"
            min={0}
            max={lastFrame}
            value={currentFrame}
            onChange={(e) => {
              const v = Math.max(
                0,
                Math.min(lastFrame, Math.round(Number(e.target.value) || 0)),
              );
              setCurrentFrame(v);
            }}
          />
          <span className="frame-jump-sep">/</span>
          <strong>F{lastFrame}</strong>
        </label>
        <span className="fps-label">{fps} FPS</span>
      </div>
    </div>
  );
}
