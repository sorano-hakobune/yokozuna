import { useProjectStore } from "@/stores/projectStore";
import { useActiveComposition } from "@/stores/projectSelectors";

/** Current edit target summary — layer / frame / selection linkage. */
export function EditTargetBar() {
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const selectedElementIds = useProjectStore((s) => s.selectedElementIds);
  const composition = useActiveComposition();
  const duration = composition?.duration ?? 1;
  const layers = composition?.layers ?? [];
  const layer = layers.find((l) => l.id === selectedLayerId);
  const layerName = layer?.name ?? "（レイヤー未選択）";
  const selCount = selectedElementIds.length;

  return (
    <div className="edit-target-bar" title="現在の編集対象">
      <span className="edit-target-item">
        <span className="edit-target-label">レイヤー</span>
        <strong>{layerName}</strong>
      </span>
      <span className="edit-target-sep">/</span>
      <span className="edit-target-item">
        <span className="edit-target-label">フレーム</span>
        <strong title={`0始まり · 最終フレーム ${Math.max(0, duration - 1)} · 全${duration}フレーム`}>
          F{currentFrame} / F{Math.max(0, duration - 1)}
        </strong>
      </span>
      {selCount > 0 && (
        <>
          <span className="edit-target-sep">/</span>
          <span className="edit-target-item">
            <span className="edit-target-label">選択</span>
            <strong>
              {selCount === 1 ? "オブジェクト 1" : `オブジェクト ${selCount}`}
            </strong>
          </span>
        </>
      )}
    </div>
  );
}
