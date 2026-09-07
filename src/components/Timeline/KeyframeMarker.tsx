import type { Keyframe } from "@/types/project";
import { useProjectStore } from "@/stores/projectStore";

interface KeyframeMarkerProps {
  layerId: string;
  keyframe: Keyframe;
  zoom: number;
  isCurrent?: boolean;
}

export function KeyframeMarker({
  layerId,
  keyframe,
  zoom,
  isCurrent,
}: KeyframeMarkerProps) {
  const removeKeyframe = useProjectStore((s) => s.removeKeyframe);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    // ドラッグ開始（簡易）
    // 本格実装では useKeyframeDrag フックに切り出す
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 右クリックで削除などのメニューを出す想定
    if (keyframe.frame !== 0) {
      removeKeyframe(layerId, keyframe.frame);
    }
  };

  return (
    <div
      className={`keyframe ${keyframe.tween !== "none" ? "has-tween" : ""} ${
        isCurrent ? "current" : ""
      }`}
      style={{ left: keyframe.frame * zoom }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      title={`Frame ${keyframe.frame} (${keyframe.tween})`}
    />
  );
}
