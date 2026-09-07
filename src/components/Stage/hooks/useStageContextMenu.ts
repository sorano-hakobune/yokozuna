import { useCallback, useState, type RefObject } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { hitTestTopElement } from "@/lib/stage/hitTest";
import { getCanvasCoordinates as getCanvasPoint } from "../stageGeometry";
import type { StageContextMenuState } from "../StageContextMenu";

/**
 * Right-click context menu: hit-tests, re-targets selection when needed,
 * and deletes the current selection. Returns props for StageContextMenu.
 */
export function useStageContextMenu(
  svgRef: RefObject<SVGSVGElement | null>,
) {
  const [contextMenu, setContextMenu] = useState<StageContextMenuState | null>(
    null,
  );
  const setSelectedLayerId = useProjectStore((s) => s.setSelectedLayerId);
  const setSelectedElementIds = useProjectStore((s) => s.setSelectedElementIds);
  const removeElement = useProjectStore((s) => s.removeElement);
  const beginHistoryBatch = useProjectStore((s) => s.beginHistoryBatch);
  const endHistoryBatch = useProjectStore((s) => s.endHistoryBatch);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const state = useProjectStore.getState();
    const proj = state.project;
    const layers = state.editingSymbolId
      ? (proj.symbols[state.editingSymbolId]?.layers ?? [])
      : (proj.compositions[proj.activeCompositionId]?.layers ?? []);
    const coords = getCanvasPoint(
      svgRef.current,
      e.clientX,
      e.clientY,
      state.canvasPan,
    );
    const hit = hitTestTopElement(coords, {
      layers,
      project: proj,
      currentFrame: state.currentFrame,
    });
    // Locked layers are not selectable / not editable via context menu target
    if (hit && !hit.locked) {
      const ids = state.selectedElementIds;
      if (!ids.includes(hit.elementId)) {
        setSelectedLayerId(hit.layerId);
        setSelectedElementIds([hit.elementId]);
      }
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetElementId: hit?.elementId ?? null,
      targetLayerId: hit?.layerId ?? null,
    });
  };

  const handleDeleteSelection = useCallback(() => {
    const state = useProjectStore.getState();
    const ids =
      state.selectedElementIds.length > 0
        ? [...state.selectedElementIds]
        : state.selectedElementId
          ? [state.selectedElementId]
          : [];
    if (ids.length === 0) return;
    const targetLayers = state.editingSymbolId
      ? state.project.symbols[state.editingSymbolId]?.layers ?? []
      : state.project.compositions[state.project.activeCompositionId]?.layers ??
        [];
    beginHistoryBatch();
    for (const id of ids) {
      for (const layer of targetLayers) {
        if (layer.locked) continue;
        const el = getElementsAtFrame(layer.keyframes, state.currentFrame).find(
          (x) => x.id === id,
        );
        if (el) removeElement(layer.id, state.currentFrame, id);
      }
    }
    endHistoryBatch();
    setSelectedElementIds([]);
  }, [beginHistoryBatch, endHistoryBatch, removeElement, setSelectedElementIds]);

  return { contextMenu, setContextMenu, handleContextMenu, handleDeleteSelection };
}
