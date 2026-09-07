import { useEffect } from "react";
import { downloadProjectJson } from "@/lib/project";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import { useProjectStore } from "@/stores/projectStore";
import { useProjectFileActions } from "./useProjectFileActions";

export function useEditorShortcuts() {
  const { openProject } = useProjectFileActions();
  const setSelectedTool = useProjectStore((state) => state.setSelectedTool);
  const selectedLayerId = useProjectStore((state) => state.selectedLayerId);
  const selectedElementId = useProjectStore((state) => state.selectedElementId);
  const selectedElementIds = useProjectStore(
    (state) => state.selectedElementIds,
  );
  const currentFrame = useProjectStore((state) => state.currentFrame);
  const copySelection = useProjectStore((state) => state.copySelection);
  const cutSelection = useProjectStore((state) => state.cutSelection);
  const pasteClipboard = useProjectStore((state) => state.pasteClipboard);
  const duplicateSelection = useProjectStore((state) => state.duplicateSelection);
  const removeElement = useProjectStore((state) => state.removeElement);
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const isDocumentDirty = useProjectStore((state) => state.isDocumentDirty);
  const insertFrames = useProjectStore((state) => state.insertFrames);
  const removeFrames = useProjectStore((state) => state.removeFrames);
  const addKeyframe = useProjectStore((state) => state.addKeyframe);
  const removeKeyframeStore = useProjectStore((state) => state.removeKeyframe);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const updateElement = useProjectStore((state) => state.updateElement);
  const convertSelectionToSymbol = useProjectStore(
    (state) => state.convertSelectionToSymbol,
  );
  const exitSymbolEdit = useProjectStore((state) => state.exitSymbolEdit);
  const editingSymbolId = useProjectStore((state) => state.editingSymbolId);
  const selectAllOnFrame = useProjectStore((state) => state.selectAllOnFrame);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const pathEditMode = useProjectStore((state) => state.pathEditMode);
  const setPathEditMode = useProjectStore((state) => state.setPathEditMode);
  const beginHistoryBatch = useProjectStore((state) => state.beginHistoryBatch);
  const endHistoryBatch = useProjectStore((state) => state.endHistoryBatch);
  const updateLayer = useProjectStore((state) => state.updateLayer);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;

      // Escape — leave path edit → leave symbol edit → clear selection
      if (event.key === "Escape") {
        if (pathEditMode) {
          event.preventDefault();
          setPathEditMode(false);
          return;
        }
        if (editingSymbolId) {
          event.preventDefault();
          exitSymbolEdit();
          return;
        }
        if (selectedElementIds.length > 0) {
          event.preventDefault();
          clearSelection();
          return;
        }
      }

      // F2 — Rename selected layer
      if (event.key === "F2" && selectedLayerId) {
        event.preventDefault();
        const state = useProjectStore.getState();
        const layers = state.editingSymbolId
          ? state.project.symbols[state.editingSymbolId]?.layers ?? []
          : state.project.compositions[state.project.activeCompositionId]
              ?.layers ?? [];
        const layer = layers.find((l) => l.id === selectedLayerId);
        if (!layer) return;
        const next = window.prompt("レイヤー名", layer.name);
        if (next === null) return;
        const trimmed = next.trim();
        if (trimmed && trimmed !== layer.name) {
          updateLayer(selectedLayerId, { name: trimmed });
        }
        return;
      }

      // F5 — Insert Frame / Shift+F5 — Remove Frame (Flash)
      if (event.key === "F5") {
        event.preventDefault();
        if (event.shiftKey) {
          removeFrames(currentFrame, 1, "all");
        } else {
          insertFrames(currentFrame, 1, "all");
        }
        return;
      }

      // F6 — Insert Keyframe / Shift+F6 — Remove Keyframe
      if (event.key === "F6") {
        event.preventDefault();
        if (event.shiftKey) {
          if (selectedLayerId) removeKeyframeStore(selectedLayerId, currentFrame);
        } else {
          if (selectedLayerId) addKeyframe(selectedLayerId, currentFrame);
        }
        return;
      }

      // F8 — Convert to Symbol (Flash)
      if (event.key === "F8") {
        event.preventDefault();
        if (!selectedElementId) return;
        const name = window.prompt("シンボル名", "Symbol 1");
        if (!name) return;
        const typeInput = window.prompt(
          "種類: graphic または movieClip",
          "graphic",
        );
        const symbolType =
          typeInput === "movieClip" ? "movieClip" : "graphic";
        queueMicrotask(() => {
          convertSelectionToSymbol(name, symbolType);
        });
        return;
      }

      // Arrow-key nudge for selection (Shift = 10px) — multi-select aware
      if (
        !hasModifier &&
        selectedElementIds.length > 0 &&
        (event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown")
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx =
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0;
        const dy =
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const state = useProjectStore.getState();
        const layers = state.editingSymbolId
          ? state.project.symbols[state.editingSymbolId]?.layers ?? []
          : state.project.compositions[state.project.activeCompositionId]
              ?.layers ?? [];
        beginHistoryBatch();
        for (const id of selectedElementIds) {
          for (const layer of layers) {
            if (layer.locked) continue;
            const el = getElementsAtFrame(layer.keyframes, currentFrame).find(
              (item) => item.id === id,
            );
            if (!el) continue;
            updateElement(layer.id, currentFrame, id, {
              x: el.x + dx,
              y: el.y + dy,
            });
            break;
          }
        }
        endHistoryBatch();
        return;
      }

      // Ctrl/Cmd+A — select all on current frame
      if (hasModifier && key === "a") {
        event.preventDefault();
        selectAllOnFrame();
        return;
      }

      if (hasModifier && key === "n") {
        event.preventDefault();
        if (
          isDocumentDirty() &&
          !window.confirm("未保存の変更があります。新規プロジェクトを作成しますか？")
        ) {
          return;
        }
        createNewProject();
        return;
      }
      if (hasModifier && key === "s") {
        event.preventDefault();
        downloadProjectJson(useProjectStore.getState().project).then(
          (result) => {
            if (result.status === "cancelled") return;
            const chosen = result.fileName.replace(/\.[^.]+$/, "");
            const state = useProjectStore.getState();
            if (chosen && chosen !== state.project.meta.name) {
              state.updateMeta({ name: chosen });
            }
            state.markProjectSaved();
          },
          (error) => {
            console.error("プロジェクトの保存に失敗しました", error);
          },
        );
        return;
      }
      if (hasModifier && key === "o") {
        event.preventDefault();
        openProject().catch((error) => {
          console.error("プロジェクトを開けませんでした", error);
        });
        return;
      }
      // Undo: Ctrl/Cmd+Z  /  Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
      if (hasModifier && key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (hasModifier && key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if (hasModifier && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (hasModifier && key === "c") {
        if (selectedElementIds.length > 0 || selectedElementId) {
          event.preventDefault();
          copySelection();
        }
        return;
      }
      if (hasModifier && key === "x") {
        if (selectedElementIds.length > 0 || selectedElementId) {
          event.preventDefault();
          cutSelection();
        }
        return;
      }
      if (hasModifier && key === "v") {
        event.preventDefault();
        pasteClipboard(selectedLayerId, currentFrame);
        return;
      }
      if (hasModifier && key === "d") {
        if (selectedElementIds.length > 0 || selectedElementId) {
          event.preventDefault();
          duplicateSelection();
        }
        return;
      }
      if (
        !hasModifier &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedElementIds.length > 0
      ) {
        event.preventDefault();
        const state = useProjectStore.getState();
        const layers = state.editingSymbolId
          ? state.project.symbols[state.editingSymbolId]?.layers ?? []
          : state.project.compositions[state.project.activeCompositionId]
              ?.layers ?? [];
        beginHistoryBatch();
        for (const id of [...selectedElementIds]) {
          for (const layer of layers) {
            if (layer.locked) continue;
            const el = getElementsAtFrame(layer.keyframes, currentFrame).find(
              (item) => item.id === id,
            );
            if (!el) continue;
            removeElement(layer.id, currentFrame, id);
            break;
          }
        }
        endHistoryBatch();
        return;
      }

      if (hasModifier) return;
      const toolByKey = {
        v: "select",
        r: "rectangle",
        c: "circle",
        l: "line",
        b: "freehand",
        t: "text",
        k: "paintbucket",
        i: "eyedropper",
        e: "eraser",
        h: "hand",
      } as const;
      const tool = toolByKey[key as keyof typeof toolByKey];
      if (tool) setSelectedTool(tool);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addKeyframe,
    beginHistoryBatch,
    clearSelection,
    convertSelectionToSymbol,
    copySelection,
    cutSelection,
    createNewProject,
    currentFrame,
    editingSymbolId,
    endHistoryBatch,
    exitSymbolEdit,
    insertFrames,
    openProject,
    pasteClipboard,
    pathEditMode,
    duplicateSelection,
    redo,
    removeElement,
    removeFrames,
    removeKeyframeStore,
    selectAllOnFrame,
    selectedElementId,
    selectedElementIds,
    selectedLayerId,
    setPathEditMode,
    setSelectedTool,
    undo,
    updateElement,
    updateLayer,
  ]);
}
