import React, { useEffect } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { usePlayback } from "@/hooks/usePlayback";
import { useFps, useCompositionDuration } from "@/stores/projectSelectors";

export const PlaybackControls: React.FC = () => {
  const currentFrame = useProjectStore((state) => state.currentFrame);
  const setCurrentFrame = useProjectStore((state) => state.setCurrentFrame);
  const maxFrames = useCompositionDuration();
  const fps = useFps();

  const { isPlaying, isLooping, togglePlay, setIsLooping } = usePlayback();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  const lastFrame = Math.max(0, maxFrames - 1);

  return (
    <div style={containerStyle}>
      <div style={buttonGroupStyle}>
        <button
          style={buttonStyle}
          onClick={() => setCurrentFrame(0)}
          title="最初のフレームへ"
        >
          ⏮
        </button>
        <button
          style={buttonStyle}
          onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
          title="前フレーム"
        >
          ◀
        </button>
        <button
          style={{
            ...buttonStyle,
            minWidth: "60px",
            backgroundColor: isPlaying ? "#ef4444" : "#3b82f6",
          }}
          onClick={togglePlay}
        >
          {isPlaying ? "PAUSE" : "PLAY"}
        </button>
        <button
          style={buttonStyle}
          onClick={() =>
            setCurrentFrame(Math.min(lastFrame, currentFrame + 1))
          }
          title="次フレーム"
        >
          ▶
        </button>
        <button
          style={buttonStyle}
          onClick={() => setCurrentFrame(lastFrame)}
          title="最後のフレームへ"
        >
          ⏭
        </button>
      </div>

      <div style={infoGroupStyle}>
        <button
          style={{ ...buttonStyle, opacity: isLooping ? 1 : 0.4 }}
          onClick={() => setIsLooping(!isLooping)}
          title="ループ再生"
        >
          🔁 Loop
        </button>
        <span style={textStyle}>
          Frame: <strong>{currentFrame}</strong> / {lastFrame} ({fps} FPS)
        </span>
      </div>
    </div>
  );
};

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 16px",
  backgroundColor: "#18181b",
  borderTop: "1px solid #27272a",
  borderBottom: "1px solid #27272a",
  color: "#f4f4f5",
  fontSize: "12px",
  userSelect: "none",
};

const buttonGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: "6px",
  alignItems: "center",
};

const infoGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#27272a",
  border: "1px solid #3f3f46",
  color: "#ffffff",
  borderRadius: "4px",
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: "bold",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const textStyle: React.CSSProperties = {
  color: "#a1a1aa",
};
