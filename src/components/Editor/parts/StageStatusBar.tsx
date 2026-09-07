import { useProjectStore } from "@/stores/projectStore";

/** Isolated so pointer-move updates do not re-render the whole editor/stage. */
export function StageStatusBar() {
  const pointerPos = useProjectStore((s) => s.pointerPos);
  return (
    <div className="stage-status">
      <span>● 準備完了</span>
      <span>
        位置: {pointerPos ? `${pointerPos.x}, ${pointerPos.y}` : "—"}
      </span>
    </div>
  );
}
