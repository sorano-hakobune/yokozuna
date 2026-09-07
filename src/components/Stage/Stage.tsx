import React, { useEffect, useRef, useState } from "react";
import { useProjectStore } from "@/stores/projectStore";
import {
  useActiveLayers,
  useCompositionDuration,
  useProjectSettings,
  useSelectedLayer,
} from "@/stores/projectSelectors";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import {
  createRectangleShape,
  createCircleShape,
  createLineShape,
  createFreehandShape,
  createTextShape,
  erasePathStroke,
} from "@/lib/draw";
import type { GuideLine, ShapeElement } from "@/types/project";

const EMPTY_GUIDES: GuideLine[] = [];
import { snapPoint, defaultGridSize } from "@/lib/stage/snap";
import { StageGrid, StageGuides } from "./StageGrid";
import {
  createImageAssetFromFile,
  isSvgFile,
  isSupportedImageFile,
  materializeSvgShapes,
  parseSvgToShapes,
  readSvgText,
} from "@/lib/project";
import {
  getCanvasCoordinates as getCanvasPoint,
  getViewportCoordinates as getViewportPoint,
} from "./stageGeometry";
import { hitTestTopElement, findHitElement } from "@/lib/stage/hitTest";
import { useStagePanZoom } from "./hooks/useStagePanZoom";
import { useStageContextMenu } from "./hooks/useStageContextMenu";
import { LayerStack } from "./parts/LayerStack";
import { DrawPreview } from "./parts/DrawPreview";
import { SelectionOverlays } from "./parts/SelectionOverlays";
import type {
  GuideDragSession,
  LayerMoveSession,
  MarqueeSession,
  TransformSession,
  VertexSession,
} from "./types/stageSession";
import { StageContextMenu } from "./StageContextMenu";
import {
  hitTestPathEdit,
  insertVertexOnEdge,
  isEditablePathShape,
  moveHandleToWorld,
  moveVertexToWorld,
  removeVertex,
} from "@/lib/selection/pathEdit";
import { ensureHandles } from "@/lib/draw/pathBezier";
import {
  groupScaleFromHandleDrag,
  hitTestGroupHandle,
  rotatePointAround,
} from "@/lib/selection/groupTransform";
import {
  hitTestMarquee,
  normalizeRect,
  resolveSelection,
  unionSelectionBounds,
} from "@/lib/selection/selectionBounds";
import {
  cursorForHandle,
  elementWorldTransform,
  getLocalBounds,
  hitTestHandle,
  scaleFromHandleDrag,
  type HandleId,
} from "./transformGeometry";

const FREEHAND_POINT_LIMIT = 4096;

const StageInner: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const stageCanvasRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewPoints, setPreviewPoints] = useState<
    { x: number; y: number }[]
  >([]);

  const transformSessionRef = useRef<TransformSession | null>(null);
  const marqueeRef = useRef<MarqueeSession | null>(null);
  const [marqueeUi, setMarqueeUi] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [activeHandle, setActiveHandle] = useState<HandleId | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleId | null>(null);
  /** Selected path vertex for keyboard delete */
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(
    null,
  );
  const vertexSessionRef = useRef<VertexSession | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const drawPointsRef = useRef<{ x: number; y: number }[]>([]);
  const eraserLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const eraserPointsRef = useRef<{ x: number; y: number }[]>([]);
  const previewFrameRef = useRef<number | null>(null);
  const previewLatestPointRef = useRef<{ x: number; y: number } | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const panStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  /** Hand tool: move all elements on one target layer (not canvasPan). */
  const layerMoveSessionRef = useRef<LayerMoveSession | null>(null);
  const isDrawingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const handleMouseUpRef = useRef<
    (e: React.PointerEvent<SVGSVGElement> | PointerEvent) => void
  >(() => {});

  const project = useProjectStore((s) => s.project);
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const onionSkinEnabled = useProjectStore((s) => s.onionSkinEnabled);
  const onionSkinBefore = useProjectStore((s) => s.onionSkinBefore);
  const onionSkinAfter = useProjectStore((s) => s.onionSkinAfter);
  const compositionDuration = useCompositionDuration();
  const selectedTool = useProjectStore((s) => s.selectedTool);
  const pathEditMode = useProjectStore((s) => s.pathEditMode);
  const setPathEditMode = useProjectStore((s) => s.setPathEditMode);
  const selectedElementId = useProjectStore((s) => s.selectedElementId);
  const selectedElementIds = useProjectStore((s) => s.selectedElementIds);
  const selectedLayerId = useProjectStore((s) => s.selectedLayerId);
  const setSelectedElementId = useProjectStore((s) => s.setSelectedElementId);
  const setSelectedElementIds = useProjectStore((s) => s.setSelectedElementIds);
  const toggleSelectedElementId = useProjectStore((s) => s.toggleSelectedElementId);
  const setSelectedLayerId = useProjectStore((s) => s.setSelectedLayerId);
  const updateElement = useProjectStore((s) => s.updateElement);
  const beginHistoryBatch = useProjectStore((s) => s.beginHistoryBatch);
  const endHistoryBatch = useProjectStore((s) => s.endHistoryBatch);
  const enterSymbolEdit = useProjectStore((s) => s.enterSymbolEdit);
  const editingSymbolId = useProjectStore((s) => s.editingSymbolId);
  const replaceShapeWithFragments = useProjectStore(
    (s) => s.replaceShapeWithFragments,
  );
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const historyBatchOpenRef = useRef(false);
  const canvasZoom = useProjectStore((s) => s.canvasZoom);
  const canvasPan = useProjectStore((s) => s.canvasPan);
  const setCanvasPan = useProjectStore((s) => s.setCanvasPan);
  const drawingStroke = useProjectStore((s) => s.drawingStroke);
  const drawingStrokeWidth = useProjectStore((s) => s.drawingStrokeWidth);
  const drawingFill = useProjectStore((s) => s.drawingFill);
  const setDrawingFill = useProjectStore((s) => s.setDrawingFill);
  const setDrawingStroke = useProjectStore((s) => s.setDrawingStroke);
  const copySelection = useProjectStore((s) => s.copySelection);
  const cutSelection = useProjectStore((s) => s.cutSelection);
  const pasteClipboard = useProjectStore((s) => s.pasteClipboard);
  const duplicateSelection = useProjectStore((s) => s.duplicateSelection);
  const reorderSelectionZ = useProjectStore((s) => s.reorderSelectionZ);
  const clipboard = useProjectStore((s) => s.clipboard);
  const { contextMenu, setContextMenu, handleContextMenu, handleDeleteSelection } =
    useStageContextMenu(svgRef);
  const setPointerPos = useProjectStore((s) => s.setPointerPos);
  const addAsset = useProjectStore((s) => s.addAsset);
  const addBitmapElement = useProjectStore((s) => s.addBitmapElement);

  const schedulePreviewUpdate = () => {
    if (previewFrameRef.current !== null) return;
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null;
      if (selectedTool === "freehand") {
        setPreviewPoints([...drawPointsRef.current]);
      } else if (selectedTool === "eraser") {
        setPreviewPoints([...eraserPointsRef.current]);
      } else if (drawStartRef.current && previewLatestPointRef.current) {
        setPreviewPoints([drawStartRef.current, previewLatestPointRef.current]);
      }
    });
  };

  const schedulePointerUpdate = (position: { x: number; y: number }) => {
    pointerPosRef.current = position;
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      if (pointerPosRef.current) setPointerPos(pointerPosRef.current);
    });
  };

  const settings = useProjectSettings();
  const layers = useActiveLayers();
  const activeLayer = useSelectedLayer();

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!activeLayer || activeLayer.locked || activeLayer.type === "folder") return;
    const files = Array.from(e.dataTransfer.files).filter(isSupportedImageFile);
    const cx = settings.width / 2;
    const cy = settings.height / 2;
    // Shift を押しながらドロップ → 強制ビットマップ。通常の SVG はパス変換を優先。
    const forceBitmap = e.shiftKey;
    for (const file of files) {
      try {
        if (isSvgFile(file) && !forceBitmap) {
          try {
            const text = await readSvgText(file);
            const parsed = parseSvgToShapes(text);
            if (parsed.hasVectors) {
              const shapes = materializeSvgShapes(parsed, cx, cy);
              for (const shape of shapes) {
                useProjectStore
                  .getState()
                  .addShapeToLayer(activeLayer.id, currentFrame, shape);
              }
              // Also keep a library copy for re-use
              addAsset(await createImageAssetFromFile(file));
              continue;
            }
          } catch (svgErr) {
            console.warn("SVG パス変換に失敗、ビットマップとして取り込み:", svgErr);
          }
        }
        const assetId = addAsset(await createImageAssetFromFile(file));
        addBitmapElement(activeLayer.id, currentFrame, assetId, cx, cy);
      } catch (error) {
        console.error("ドロップ画像の取り込みエラー:", error);
      }
    }
  };

  const getViewportCoordinates = (clientX: number, clientY: number) =>
    getViewportPoint(svgRef.current, clientX, clientY);

  const getCanvasCoordinates = (
    e: Pick<React.PointerEvent, "clientX" | "clientY">,
  ) => getCanvasPoint(svgRef.current, e.clientX, e.clientY, canvasPan);

  const snapOpts = () => {
    const s = useProjectStore.getState().project.settings;
    return {
      gridSize: defaultGridSize(s.gridSize),
      snapToGrid: !!s.snapToGrid,
      guides: s.guides ?? EMPTY_GUIDES,
      snapToGuides: s.snapToGuides !== false,
      guideThreshold: 8 / Math.max(canvasZoom, 0.15),
    };
  };

  /** Apply grid/guide snap when any snap mode is on (Alt temporarily disables). */
  const maybeSnap = (
    point: { x: number; y: number },
    e?: { altKey?: boolean },
  ) => {
    if (e?.altKey) return point;
    const o = snapOpts();
    if (!o.snapToGrid && !o.snapToGuides) return point;
    return snapPoint(point, o);
  };

  const updateSettings = useProjectStore((s) => s.updateSettings);
  const guideDragRef = useRef<GuideDragSession | null>(null);
  const [activeGuideId, setActiveGuideId] = useState<string | null>(null);

  const eraseStroke = (brushPoints: { x: number; y: number }[]) => {
    const latestProject = useProjectStore.getState().project;
    const latestComposition =
      latestProject.compositions[latestProject.activeCompositionId];
    if (!latestComposition) return;

    for (const layer of latestComposition.layers) {
      if (!layer.visible || layer.locked) continue;
      const elements = getElementsAtFrame(layer.keyframes, currentFrame);
      for (let i = elements.length - 1; i >= 0; i -= 1) {
        const element = elements[i];
        if (element.type !== "shape") continue;
        const shape = element as ShapeElement;
        const fragments = erasePathStroke(
          shape,
          brushPoints,
          drawingStrokeWidth,
        );
        if (fragments.length !== 1 || fragments[0].id !== shape.id) {
          replaceShapeWithFragments(
            layer.id,
            currentFrame,
            shape.id,
            fragments,
          );
        }
      }
    }
  };

  // Wheel zoom: non-passive listener + cursor-centered pan (no native scroll)
  useStagePanZoom(stageCanvasRef, svgRef);

  const handleWheel = (e: React.WheelEvent) => {
    // Fallback for React path; native listener above is authoritative
    e.preventDefault();
  };

  const releasePointer = (pointerId: number | null) => {
    if (pointerId == null) return;
    const node = svgRef.current;
    if (!node) return;
    try {
      if (node.hasPointerCapture(pointerId)) {
        node.releasePointerCapture(pointerId);
      }
    } catch {
      // Tauri/WebView throws InvalidStateError if the pointer already ended.
    }
  };

  const stopPreviewRaf = () => {
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
  };

  const closeHistoryBatch = () => {
    if (!historyBatchOpenRef.current) return;
    historyBatchOpenRef.current = false;
    endHistoryBatch();
  };

  const resetGesture = () => {
    isDrawingRef.current = false;
    isDraggingRef.current = false;
    activePointerIdRef.current = null;
    panStartRef.current = null;
    layerMoveSessionRef.current = null;
    transformSessionRef.current = null;
    vertexSessionRef.current = null;
    guideDragRef.current = null;
    setActiveGuideId(null);
    setActiveHandle(null);
    drawStartRef.current = null;
    drawPointsRef.current = [];
    eraserLastPointRef.current = null;
    eraserPointsRef.current = [];
    previewLatestPointRef.current = null;
    stopPreviewRaf();
    setIsDrawing(false);
    setIsDragging(false);
    setPreviewPoints([]);
    closeHistoryBatch();
  };

  const handleMouseDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();

    activePointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // SVG pointer capture is unreliable in some WebViews.
    }
    const coords = getCanvasCoordinates(e);

    // Middle mouse: viewport pan (all layers visually, does not mutate element data)
    if (e.button === 1) {
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: canvasPan.x,
        panY: canvasPan.y,
      };
      isDraggingRef.current = true;
      setIsDragging(true);
      return;
    }

    // Hand tool: move *only* the active layer's elements on the current frame.
    // Does not touch other layers or canvasPan.
    if (selectedTool === "hand") {
      const targetLayer = activeLayer;
      if (!targetLayer || targetLayer.locked || targetLayer.type === "folder") {
        // Locked or no active layer → ignore (do not pan other layers)
        releasePointer(e.pointerId);
        activePointerIdRef.current = null;
        return;
      }
      const elements = getElementsAtFrame(
        targetLayer.keyframes,
        currentFrame,
      );
      layerMoveSessionRef.current = {
        layerId: targetLayer.id,
        startPointer: { x: coords.x, y: coords.y },
        items: elements.map((el) => ({
          elementId: el.id,
          initialX: el.x ?? 0,
          initialY: el.y ?? 0,
        })),
      };
      isDraggingRef.current = true;
      setIsDragging(true);
      if (!historyBatchOpenRef.current) {
        historyBatchOpenRef.current = true;
        beginHistoryBatch();
      }
      return;
    }

    if (selectedTool === "eraser") {
      setSelectedElementId(undefined);
      eraserLastPointRef.current = coords;
      eraserPointsRef.current = [coords];
      setPreviewPoints([coords]);
      isDrawingRef.current = true;
      setIsDrawing(true);
      return;
    }

    // スポイト: クリックした要素の色を取得
    if (selectedTool === "eyedropper") {
      const hit = hitTestTopElement(coords, {
        layers,
        project,
        currentFrame,
        skipLocked: true,
      });
      const found = hit ? findHitElement(layers, currentFrame, hit) : null;
      let sampled = false;
      const el = found?.element;
      if (el?.type === "shape") {
        const shape = el as ShapeElement;
        // Shift = 線色を優先 / 通常は塗り（なければ線）
        if (e.shiftKey) {
          if (shape.stroke && shape.stroke !== "none") {
            setDrawingStroke(shape.stroke);
            sampled = true;
          } else if (shape.fill && shape.fill !== "none") {
            setDrawingFill(shape.fill);
            sampled = true;
          }
        } else {
          if (shape.fill && shape.fill !== "none") {
            setDrawingFill(shape.fill);
            sampled = true;
          } else if (shape.stroke && shape.stroke !== "none") {
            setDrawingStroke(shape.stroke);
            sampled = true;
          }
        }
      }
      // 何もヒットしなければ背景色を塗りにセット
      if (!sampled && !found) {
        const bg = project.settings.backgroundColor;
        if (bg) setDrawingFill(bg);
      }
      return;
    }

    // 塗りつぶし: クリックした図形の fill を現在の塗り色に
    if (selectedTool === "paintbucket") {
      const hit = hitTestTopElement(coords, {
        layers,
        project,
        currentFrame,
        skipLocked: true,
        shapesOnly: true,
      });
      const found = hit ? findHitElement(layers, currentFrame, hit) : null;
      if (found && found.element.type === "shape") {
        const shape = found.element as ShapeElement;
        // 線専用図形は stroke を更新、それ以外は fill
        if (
          shape.shapeType === "line" ||
          (shape.fill === "none" && shape.stroke && shape.stroke !== "none")
        ) {
          updateElement(found.layer.id, currentFrame, shape.id, {
            stroke: drawingStroke,
          });
        } else {
          updateElement(found.layer.id, currentFrame, shape.id, {
            fill: drawingFill,
          });
        }
        setSelectedLayerId(found.layer.id);
        setSelectedElementId(shape.id);
      }
      return;
    }

    // 選択ツール: パス頂点 → 変形ハンドル → グループ
    if (selectedTool === "select" && selectedElementIds.length > 0) {
      const items = resolveSelection(
        layers,
        currentFrame,
        selectedElementIds,
        project,
      );
      if (items.length === 1) {
        const { layerId, element: selEl } = items[0]!;
        const layer = layers.find((l) => l.id === layerId);
        if (
          layer &&
          !layer.locked &&
          pathEditMode &&
          isEditablePathShape(selEl)
        ) {
          const pathHit = hitTestPathEdit(
            coords,
            selEl,
            canvasZoom,
            selectedVertexIndex,
          );
          if (pathHit?.kind === "handleIn" || pathHit?.kind === "handleOut") {
            vertexSessionRef.current = {
              layerId,
              elementId: selEl.id,
              index: pathHit.index,
              kind: pathHit.kind,
              breakSmooth: e.altKey,
            };
            setSelectedVertexIndex(pathHit.index);
            setSelectedLayerId(layerId);
            isDraggingRef.current = true;
            setIsDragging(true);
            if (!historyBatchOpenRef.current) {
              historyBatchOpenRef.current = true;
              beginHistoryBatch();
            }
            return;
          }
          if (pathHit?.kind === "vertex") {
            // Alt/Option = delete vertex
            if (e.altKey) {
              const next = removeVertex(selEl, pathHit.index);
              if (next) {
                if (!historyBatchOpenRef.current) {
                  historyBatchOpenRef.current = true;
                  beginHistoryBatch();
                }
                updateElement(layerId, currentFrame, selEl.id, {
                  points: next,
                });
                endHistoryBatch();
                historyBatchOpenRef.current = false;
                setSelectedVertexIndex(null);
              }
              return;
            }
            // Double-click vertex → create handles for curve edit
            if (e.detail >= 2) {
              const withHandles = ensureHandles(
                (selEl.points ?? []).map((p) => ({ ...p })),
                pathHit.index,
                !!selEl.closePath,
              );
              updateElement(layerId, currentFrame, selEl.id, {
                points: withHandles,
              });
              setSelectedVertexIndex(pathHit.index);
              return;
            }
            vertexSessionRef.current = {
              layerId,
              elementId: selEl.id,
              index: pathHit.index,
              kind: "vertex",
            };
            setSelectedVertexIndex(pathHit.index);
            setSelectedLayerId(layerId);
            isDraggingRef.current = true;
            setIsDragging(true);
            if (!historyBatchOpenRef.current) {
              historyBatchOpenRef.current = true;
              beginHistoryBatch();
            }
            return;
          }
          if (pathHit?.kind === "edge") {
            // Click edge → insert vertex and start dragging it
            const next = insertVertexOnEdge(
              selEl,
              pathHit.index,
              pathHit.t,
            );
            const newIndex =
              selEl.closePath && pathHit.index === (selEl.points?.length ?? 0) - 1
                ? next.length - 1
                : pathHit.index + 1;
            if (!historyBatchOpenRef.current) {
              historyBatchOpenRef.current = true;
              beginHistoryBatch();
            }
            updateElement(layerId, currentFrame, selEl.id, { points: next });
            vertexSessionRef.current = {
              layerId,
              elementId: selEl.id,
              index: newIndex,
              kind: "vertex",
            };
            setSelectedVertexIndex(newIndex);
            setSelectedLayerId(layerId);
            isDraggingRef.current = true;
            setIsDragging(true);
            return;
          }
        }
        // Reuse selEl / layerId from items[0] (already declared above)
        const selected = selEl;
        if (layer && !layer.locked) {
          const asset =
            selected.type === "bitmap"
              ? project.assets[selected.assetId]
              : selected.type === "instance"
                ? project.symbols[selected.symbolId]
                : undefined;
          const bounds = getLocalBounds(selected, asset);
          const t = elementWorldTransform(selected);
          const handle = hitTestHandle(coords, bounds, t, canvasZoom);
          if (handle) {
            const grabAngle =
              (Math.atan2(coords.y - selected.y, coords.x - selected.x) *
                180) /
              Math.PI;
            transformSessionRef.current = {
              handle,
              elementId: selected.id,
              layerId,
              startPointer: { ...coords },
              initialX: selected.x,
              initialY: selected.y,
              initialRotation: selected.rotation ?? 0,
              initialScaleX: selected.scaleX || 1,
              initialScaleY: selected.scaleY || 1,
              rotationGrabOffset: (selected.rotation ?? 0) - (grabAngle + 90),
            };
            setSelectedLayerId(layerId);
            setActiveHandle(handle);
            isDraggingRef.current = true;
            setIsDragging(true);
            if (!historyBatchOpenRef.current) {
              historyBatchOpenRef.current = true;
              beginHistoryBatch();
            }
            return;
          }
        }
      } else if (items.length > 1) {
        const union = unionSelectionBounds(items, project);
        if (union) {
          const handle = hitTestGroupHandle(coords, union, canvasZoom);
          if (handle) {
            const grabAngle =
              (Math.atan2(coords.y - union.cy, coords.x - union.cx) * 180) /
              Math.PI;
            transformSessionRef.current = {
              handle,
              elementId: items[items.length - 1]!.element.id,
              layerId: items[items.length - 1]!.layerId,
              startPointer: { ...coords },
              initialX: items[items.length - 1]!.element.x,
              initialY: items[items.length - 1]!.element.y,
              initialRotation: 0,
              initialScaleX: 1,
              initialScaleY: 1,
              rotationGrabOffset:
                handle === "rotate" ? -(grabAngle + 90) : 0,
              multiItems: items.map(({ layerId, element }) => ({
                layerId,
                elementId: element.id,
                initialX: element.x,
                initialY: element.y,
                initialRotation: element.rotation ?? 0,
                initialScaleX: element.scaleX || 1,
                initialScaleY: element.scaleY || 1,
              })),
              groupCenter: { x: union.cx, y: union.cy },
              groupBounds: { ...union },
            };
            setActiveHandle(handle);
            isDraggingRef.current = true;
            setIsDragging(true);
            if (!historyBatchOpenRef.current) {
              historyBatchOpenRef.current = true;
              beginHistoryBatch();
            }
            return;
          }
        }
      }
    }

    // 文字ツール: クリック位置にテキストを作成（編集はプロンプト）
    if (selectedTool === "text") {
      if (!activeLayer || activeLayer.locked || activeLayer.type === "folder") {
        releasePointer(e.pointerId);
        activePointerIdRef.current = null;
        return;
      }
      const orient = useProjectStore.getState().textOrientation;
      const initial = orient === "vertical" ? "テキスト" : "テキスト";
      const entered = window.prompt("テキストを入力", initial);
      if (entered === null) {
        releasePointer(e.pointerId);
        activePointerIdRef.current = null;
        return;
      }
      const shape = createTextShape(coords.x, coords.y, entered || "テキスト", {
        fill: drawingFill,
        textOrientation: orient,
        fontSize: 24,
      });
      useProjectStore.getState().addShapeToLayer(activeLayer.id, currentFrame, shape);
      setSelectedLayerId(activeLayer.id);
      setSelectedElementId(shape.id);
      releasePointer(e.pointerId);
      activePointerIdRef.current = null;
      return;
    }

    // 描画ツール（選択・塗り・スポイト・文字以外）
    if (selectedTool !== "select") {
      if (!activeLayer || activeLayer.locked || activeLayer.type === "folder") {
        releasePointer(e.pointerId);
        activePointerIdRef.current = null;
        return;
      }
      isDrawingRef.current = true;
      setIsDrawing(true);
      const snappedStart = maybeSnap(coords, e);
      drawStartRef.current = { x: snappedStart.x, y: snappedStart.y };
      drawPointsRef.current = [coords];
      setPreviewPoints([coords]);
      setSelectedLayerId(activeLayer.id);
      return;
    }

    // 選択ツール: 要素ヒットテスト（前面から）
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    {
      const topHit = hitTestTopElement(coords, {
        layers,
        project,
        currentFrame,
        skipLocked: true,
      });
      const found = topHit ? findHitElement(layers, currentFrame, topHit) : null;
      if (found) {
        const { layer, element: el } = found;
        {
          // Double-click instance → enter symbol edit (Flash-style)
          const now = performance.now();
          const prev = lastClickRef.current;
          if (
            !additive &&
            !editingSymbolId &&
            el.type === "instance" &&
            prev &&
            prev.id === el.id &&
            now - prev.time < 350
          ) {
            lastClickRef.current = null;
            enterSymbolEdit(el.symbolId);
            return;
          }
          // Double-click path/line → enter vertex edit mode
          if (
            !additive &&
            selectedTool === "select" &&
            el.type === "shape" &&
            isEditablePathShape(el) &&
            prev &&
            prev.id === el.id &&
            now - prev.time < 450
          ) {
            lastClickRef.current = null;
            // Select without clearing pathEditMode mid-flight
            if (selectedElementId !== el.id) {
              setSelectedElementId(el.id);
            }
            setSelectedLayerId(layer.id);
            setPathEditMode(true);
            return;
          }
          // Double-click text → edit content
          if (
            !additive &&
            el.type === "shape" &&
            (el as ShapeElement).shapeType === "text" &&
            prev &&
            prev.id === el.id &&
            now - prev.time < 350
          ) {
            lastClickRef.current = null;
            const shape = el as ShapeElement;
            const next = window.prompt(
              "テキストを編集",
              shape.text ?? "",
            );
            if (next !== null) {
              const fontSize = shape.fontSize ?? 24;
              const orient = shape.textOrientation ?? "horizontal";
              const content = next;
              const width =
                orient === "vertical"
                  ? fontSize * 1.4
                  : Math.max(fontSize, Math.max(1, content.length) * fontSize * 0.6);
              const height =
                orient === "vertical"
                  ? Math.max(fontSize, Math.max(1, content.length) * fontSize * 1.1)
                  : fontSize * 1.4;
              updateElement(layer.id, currentFrame, shape.id, {
                text: content,
                width,
                height,
              });
            }
            return;
          }
          lastClickRef.current = { id: el.id, time: now };

          setSelectedLayerId(layer.id);
          if (additive) {
            toggleSelectedElementId(el.id);
            // If still selected after toggle, allow drag of full selection
            const nextIds = useProjectStore.getState().selectedElementIds;
            if (nextIds.includes(el.id) && nextIds.length > 0) {
              const items = resolveSelection(
                layers,
                currentFrame,
                nextIds,
                project,
              );
              transformSessionRef.current = {
                handle: "move",
                elementId: el.id,
                layerId: layer.id,
                startPointer: { ...coords },
                initialX: el.x,
                initialY: el.y,
                initialRotation: el.rotation ?? 0,
                initialScaleX: el.scaleX || 1,
                initialScaleY: el.scaleY || 1,
                rotationGrabOffset: 0,
                multiItems:
                  items.length > 1
                    ? items.map(({ layerId, element }) => ({
                        layerId,
                        elementId: element.id,
                        initialX: element.x,
                        initialY: element.y,
                        initialRotation: element.rotation ?? 0,
                        initialScaleX: element.scaleX || 1,
                        initialScaleY: element.scaleY || 1,
                      }))
                    : undefined,
              };
              setActiveHandle("move");
              isDraggingRef.current = true;
              setIsDragging(true);
              if (!historyBatchOpenRef.current) {
                historyBatchOpenRef.current = true;
                beginHistoryBatch();
              }
            }
            return;
          }

          // Keep multi-selection when clicking an already-selected item
          const wasMulti =
            selectedElementIds.length > 1 &&
            selectedElementIds.includes(el.id);
          if (!wasMulti) {
            setSelectedElementId(el.id);
          }
          setSelectedLayerId(layer.id);
          if (wasMulti) {
            const items = resolveSelection(
              layers,
              currentFrame,
              selectedElementIds,
              project,
            );
            transformSessionRef.current = {
              handle: "move",
              elementId: el.id,
              layerId: layer.id,
              startPointer: { ...coords },
              initialX: el.x,
              initialY: el.y,
              initialRotation: el.rotation ?? 0,
              initialScaleX: el.scaleX || 1,
              initialScaleY: el.scaleY || 1,
              rotationGrabOffset: 0,
              multiItems: items.map(({ layerId, element }) => ({
                layerId,
                elementId: element.id,
                initialX: element.x,
                initialY: element.y,
                initialRotation: element.rotation ?? 0,
                initialScaleX: element.scaleX || 1,
                initialScaleY: element.scaleY || 1,
              })),
            };
          } else {
            transformSessionRef.current = {
              handle: "move",
              elementId: el.id,
              layerId: layer.id,
              startPointer: { ...coords },
              initialX: el.x,
              initialY: el.y,
              initialRotation: el.rotation ?? 0,
              initialScaleX: el.scaleX || 1,
              initialScaleY: el.scaleY || 1,
              rotationGrabOffset: 0,
            };
          }
          setActiveHandle("move");
          isDraggingRef.current = true;
          setIsDragging(true);
          if (!historyBatchOpenRef.current) {
            historyBatchOpenRef.current = true;
            beginHistoryBatch();
          }
          return;
        }
      }
    }

    // Empty space → marquee selection (or clear if click without drag)
    if (!additive) {
      setSelectedElementIds([]);
    }
    marqueeRef.current = {
      start: { ...coords },
      current: { ...coords },
      additive,
    };
    setMarqueeUi({
      x0: coords.x,
      y0: coords.y,
      x1: coords.x,
      y1: coords.y,
    });
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleMouseMove = (
    e: React.PointerEvent<SVGSVGElement> | PointerEvent,
  ) => {
    if (
      activePointerIdRef.current !== null &&
      e.pointerId !== activePointerIdRef.current
    ) {
      return;
    }
    if (!panStartRef.current && !isDrawingRef.current) {
      const live = getCanvasCoordinates(e);
      const nextPointerPos = { x: Math.round(live.x), y: Math.round(live.y) };
      if (
        pointerPosRef.current?.x !== nextPointerPos.x ||
        pointerPosRef.current?.y !== nextPointerPos.y
      ) {
        schedulePointerUpdate(nextPointerPos);
      }
    }
    if (panStartRef.current) {
      const startViewport = getViewportCoordinates(
        panStartRef.current.x,
        panStartRef.current.y,
      );
      const currentViewport = getViewportCoordinates(e.clientX, e.clientY);
      setCanvasPan({
        x: panStartRef.current.panX + currentViewport.x - startViewport.x,
        y: panStartRef.current.panY + currentViewport.y - startViewport.y,
      });
      return;
    }

    const coords = getCanvasCoordinates(e);

    // Hand-tool layer move: update only the session layer's elements
    if (layerMoveSessionRef.current) {
      const session = layerMoveSessionRef.current;
      const layer = layers.find((l) => l.id === session.layerId);
      if (!layer || layer.locked) {
        return;
      }
      const deltaX = coords.x - session.startPointer.x;
      const deltaY = coords.y - session.startPointer.y;
      for (const item of session.items) {
        const snapped = maybeSnap(
          { x: item.initialX + deltaX, y: item.initialY + deltaY },
          e,
        );
        updateElement(session.layerId, currentFrame, item.elementId, {
          x: Math.round(snapped.x),
          y: Math.round(snapped.y),
        });
      }
      return;
    }
    if (selectedTool === "eraser" && isDrawingRef.current) {
      const previous = eraserLastPointRef.current;
      if (
        previous &&
        Math.hypot(coords.x - previous.x, coords.y - previous.y) >= 0.5
      ) {
        eraserPointsRef.current.push(coords);
        schedulePreviewUpdate();
      }
      eraserLastPointRef.current = coords;
      return;
    }
    if (isDrawingRef.current && selectedTool === "freehand") {
      const last = drawPointsRef.current[drawPointsRef.current.length - 1];
      if (!last || Math.hypot(coords.x - last.x, coords.y - last.y) >= 2) {
        if (drawPointsRef.current.length >= FREEHAND_POINT_LIMIT) {
          drawPointsRef.current = drawPointsRef.current.filter(
            (_, index) => index % 2 === 0,
          );
        }
        drawPointsRef.current.push(coords);
        schedulePreviewUpdate();
      }
      return;
    }
    if (isDrawingRef.current && drawStartRef.current) {
      previewLatestPointRef.current = coords;
      schedulePreviewUpdate();
      return;
    }
    // Hover cursor for transform handles when idle
    if (
      selectedTool === "select" &&
      !isDraggingRef.current &&
      selectedElementId
    ) {
      let nextHover: HandleId | null = null;
      for (const layer of layers) {
        if (!layer.visible || layer.locked) continue;
        const el = getElementsAtFrame(layer.keyframes, currentFrame).find(
          (item) => item.id === selectedElementId,
        );
        if (!el) continue;
        const asset =
          el.type === "bitmap"
            ? project.assets[el.assetId]
            : el.type === "instance"
              ? project.symbols[el.symbolId]
              : undefined;
        nextHover = hitTestHandle(
          coords,
          getLocalBounds(el, asset),
          elementWorldTransform(el),
          canvasZoom,
        );
        break;
      }
      setHoverHandle((prev) => (prev === nextHover ? prev : nextHover));
    } else {
      setHoverHandle((prev) => (prev === null ? prev : null));
    }

    // Marquee drag
    if (marqueeRef.current && isDraggingRef.current) {
      marqueeRef.current.current = { ...coords };
      setMarqueeUi({
        x0: marqueeRef.current.start.x,
        y0: marqueeRef.current.start.y,
        x1: coords.x,
        y1: coords.y,
      });
      return;
    }

    // Guide drag
    if (guideDragRef.current) {
      const gd = guideDragRef.current;
      const guides = [...(settings.guides ?? [])];
      const idx = guides.findIndex((g) => g.id === gd.id);
      if (idx >= 0) {
        const pos =
          gd.orientation === "vertical"
            ? maybeSnap({ x: coords.x, y: 0 }, e).x
            : maybeSnap({ x: 0, y: coords.y }, e).y;
        guides[idx] = { ...guides[idx]!, position: Math.round(pos) };
        updateSettings({ guides });
      }
      return;
    }

    // Path vertex / handle drag
    if (isDraggingRef.current && vertexSessionRef.current) {
      const vs = vertexSessionRef.current;
      const layer = layers.find((l) => l.id === vs.layerId);
      const el = layer
        ? getElementsAtFrame(layer.keyframes, currentFrame).find(
            (e) => e.id === vs.elementId,
          )
        : undefined;
      if (el && isEditablePathShape(el)) {
        if (vs.kind === "vertex") {
          const points = moveVertexToWorld(el, vs.index, coords);
          updateElement(vs.layerId, currentFrame, vs.elementId, { points });
        } else {
          const which = vs.kind === "handleIn" ? "in" : "out";
          const points = moveHandleToWorld(
            el,
            vs.index,
            which,
            coords,
            !!vs.breakSmooth,
          );
          updateElement(vs.layerId, currentFrame, vs.elementId, { points });
        }
      }
      return;
    }

    if (!isDraggingRef.current || !transformSessionRef.current) return;
    const session = transformSessionRef.current;

    // Multi-select transform
    if (session.multiItems && session.multiItems.length > 0) {
      if (session.handle === "move") {
        const deltaX = coords.x - session.startPointer.x;
        const deltaY = coords.y - session.startPointer.y;
        for (const item of session.multiItems) {
          const snapped = maybeSnap(
            { x: item.initialX + deltaX, y: item.initialY + deltaY },
            e,
          );
          updateElement(item.layerId, currentFrame, item.elementId, {
            x: Math.round(snapped.x),
            y: Math.round(snapped.y),
          });
        }
        return;
      }

      const cx = session.groupCenter?.x ?? 0;
      const cy = session.groupCenter?.y ?? 0;

      if (session.handle === "rotate") {
        const grabAngle =
          (Math.atan2(coords.y - cy, coords.x - cx) * 180) / Math.PI;
        let next = grabAngle + 90 + session.rotationGrabOffset;
        if (e.shiftKey) {
          next = Math.round(next / 15) * 15;
        }
        const delta = next; // absolute group rotation from start (offset baked)
        // rotationGrabOffset was set so initial angle maps to 0
        for (const item of session.multiItems) {
          const p = rotatePointAround(
            item.initialX,
            item.initialY,
            cx,
            cy,
            delta,
          );
          updateElement(item.layerId, currentFrame, item.elementId, {
            x: Math.round(p.x),
            y: Math.round(p.y),
            rotation: item.initialRotation + delta,
          });
        }
        return;
      }

      if (session.handle !== "marquee" && session.groupBounds) {
        const { scaleX, scaleY } = groupScaleFromHandleDrag({
          handle: session.handle,
          bounds: session.groupBounds,
          pointer: coords,
          uniform: e.shiftKey,
        });
        for (const item of session.multiItems) {
          updateElement(item.layerId, currentFrame, item.elementId, {
            x: Math.round(cx + (item.initialX - cx) * scaleX),
            y: Math.round(cy + (item.initialY - cy) * scaleY),
            scaleX: item.initialScaleX * scaleX,
            scaleY: item.initialScaleY * scaleY,
          });
        }
        return;
      }
    }

    const layer = layers.find((l) => l.id === session.layerId);
    if (!layer || layer.locked) return;
    const selected = getElementsAtFrame(layer.keyframes, currentFrame).find(
      (el) => el.id === session.elementId,
    );
    if (!selected) return;

    if (session.handle === "move") {
      const deltaX = coords.x - session.startPointer.x;
      const deltaY = coords.y - session.startPointer.y;
      const snapped = maybeSnap(
        { x: session.initialX + deltaX, y: session.initialY + deltaY },
        e,
      );
      updateElement(session.layerId, currentFrame, session.elementId, {
        x: Math.round(snapped.x),
        y: Math.round(snapped.y),
      });
      return;
    }

    if (session.handle === "rotate") {
      const grabAngle =
        (Math.atan2(coords.y - session.initialY, coords.x - session.initialX) *
          180) /
        Math.PI;
      let next = grabAngle + 90 + session.rotationGrabOffset;
      // Snap to 15° with Shift
      if (e.shiftKey) {
        next = Math.round(next / 15) * 15;
      }
      updateElement(session.layerId, currentFrame, session.elementId, {
        rotation: next,
      });
      return;
    }

    // Scale handles
    if (session.handle === "marquee") return;
    const asset =
      selected.type === "bitmap"
        ? project.assets[selected.assetId]
        : selected.type === "instance"
          ? project.symbols[selected.symbolId]
          : undefined;
    const bounds = getLocalBounds(selected, asset);
    const startT = {
      x: session.initialX,
      y: session.initialY,
      rotation: session.initialRotation,
      scaleX: session.initialScaleX,
      scaleY: session.initialScaleY,
    };
    const uniform =
      e.shiftKey ||
      (selected.type === "shape" &&
        (selected as ShapeElement).shapeType === "circle");
    const { scaleX, scaleY } = scaleFromHandleDrag({
      handle: session.handle,
      bounds,
      start: startT,
      pointer: coords,
      uniform,
    });
    updateElement(session.layerId, currentFrame, session.elementId, {
      scaleX,
      scaleY,
    });
  };

  const handleMouseUp = (
    e: React.PointerEvent<SVGSVGElement> | PointerEvent,
  ) => {
    if (activePointerIdRef.current === null) return;
    if (e.pointerId !== activePointerIdRef.current) return;

    const pointerId = activePointerIdRef.current;
    activePointerIdRef.current = null;
    releasePointer(pointerId);

    // Finish marquee selection
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      const dx = m.current.x - m.start.x;
      const dy = m.current.y - m.start.y;
      const dragged = Math.hypot(dx, dy) >= 3;
      if (dragged) {
        const rect = normalizeRect(m.start.x, m.start.y, m.current.x, m.current.y);
        const hits = hitTestMarquee(layers, currentFrame, project, rect);
        const hitIds = hits.map((h) => h.element.id);
        if (m.additive) {
          const merged = [...selectedElementIds];
          for (const id of hitIds) {
            if (!merged.includes(id)) merged.push(id);
          }
          setSelectedElementIds(merged);
        } else {
          setSelectedElementIds(hitIds);
        }
        if (hits.length > 0) {
          setSelectedLayerId(hits[hits.length - 1]!.layerId);
        }
      }
      marqueeRef.current = null;
      setMarqueeUi(null);
      isDraggingRef.current = false;
      setIsDragging(false);
      closeHistoryBatch();
      return;
    }

    const wasDrawing = isDrawingRef.current;
    const start = drawStartRef.current;
    const points = drawPointsRef.current.slice();
    const layer = activeLayer;
    const tool = selectedTool;
    const frame = currentFrame;
    const stroke = drawingStroke;
    const strokeWidth = drawingStrokeWidth;
    const fill = drawingFill;
    const eraserPoints = eraserPointsRef.current.slice();

    let newShape: ShapeElement | null = null;
    if (
      wasDrawing &&
      start &&
      layer &&
      tool !== "select" &&
      tool !== "eraser"
    ) {
      try {
        const coords = maybeSnap(getCanvasCoordinates(e), e);
        const { x: startX, y: startY } = start;
        const endX = coords.x;
        const endY = coords.y;

        switch (tool) {
          case "freehand":
            if (points.length >= 2) {
              newShape = createFreehandShape(points, {
                stroke,
                strokeWidth,
              });
            }
            break;
          case "rectangle": {
            const width = Math.max(4, Math.abs(endX - startX));
            const height = Math.max(4, Math.abs(endY - startY));
            const centerX = (startX + endX) / 2;
            const centerY = (startY + endY) / 2;
            newShape = createRectangleShape(centerX, centerY, width, height, {
              fill,
              stroke,
              strokeWidth,
            });
            break;
          }
          case "circle": {
            const radius = Math.max(
              4,
              Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2),
            );
            newShape = createCircleShape(startX, startY, radius, {
              fill,
              stroke,
              strokeWidth,
            });
            break;
          }
          case "line":
            newShape = createLineShape(startX, startY, endX, endY, {
              stroke,
              strokeWidth,
            });
            break;
          default:
            break;
        }
      } catch (error) {
        console.error("図形の確定に失敗しました:", error);
      }
    }

    const layerId = layer?.id;
    resetGesture();

    // Mutating the React tree during pointerup can leave Tauri/WebView
    // with a stuck pointer capture. Commit the shape after the event.
    if (newShape && layerId) {
      const shape = newShape;
      queueMicrotask(() => {
        useProjectStore.getState().addShapeToLayer(layerId, frame, shape);
      });
    }
    if (wasDrawing && tool === "eraser" && eraserPoints.length >= 2) {
      queueMicrotask(() => eraseStroke(eraserPoints));
    }
  };
  handleMouseUpRef.current = handleMouseUp;

  // Clear vertex selection when element selection changes
  useEffect(() => {
    setSelectedVertexIndex(null);
  }, [selectedElementId, selectedElementIds.join("|")]);

  // Delete selected path vertex (Alt+click also works)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (selectedVertexIndex === null || !selectedElementId) return;
      const items = resolveSelection(
        layers,
        currentFrame,
        selectedElementIds.length ? selectedElementIds : [selectedElementId],
        project,
      );
      const item = items.find((i) => i.element.id === selectedElementId);
      if (!item || !isEditablePathShape(item.element)) return;
      const next = removeVertex(item.element, selectedVertexIndex);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      updateElement(item.layerId, currentFrame, item.element.id, {
        points: next,
      });
      setSelectedVertexIndex(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    selectedVertexIndex,
    selectedElementId,
    selectedElementIds,
    layers,
    currentFrame,
    project,
    updateElement,
  ]);


  useEffect(() => {
    const finish = (e: PointerEvent) => {
      if (activePointerIdRef.current === null) return;
      handleMouseUpRef.current(e);
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      releasePointer(activePointerIdRef.current);
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
      if (pointerFrameRef.current !== null) {
        cancelAnimationFrame(pointerFrameRef.current);
      }
    };
  }, []);

  // Stage logical size is unchanged; overscan only expands the *workspace*
  // so objects placed outside the stage rect remain visible while editing.
  const overscan = Math.max(320, Math.round(Math.max(settings.width, settings.height) * 0.6));
  const worldW = settings.width + overscan * 2;
  const worldH = settings.height + overscan * 2;

  return (
    <div
      ref={stageCanvasRef}
      className="stage-canvas"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDragEnd={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      style={{ backgroundColor: "#73777a" }}
    >
      {isDragOver && (
        <div className="stage-drop-indicator">
          画像 / SVG をドロップ（SVG はパス変換 · Shift で画像のまま）
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`${-overscan} ${-overscan} ${worldW} ${worldH}`}
        role="application"
        aria-label="Vector stage"
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={handleMouseDown}
        onPointerMove={handleMouseMove}
        onPointerUp={handleMouseUp}
        onPointerCancel={handleMouseUp}
        onLostPointerCapture={(e) => {
          if (activePointerIdRef.current === e.pointerId) {
            handleMouseUp(e);
          }
        }}
        onPointerLeave={() => {
          pointerPosRef.current = null;
          if (pointerFrameRef.current !== null) {
            cancelAnimationFrame(pointerFrameRef.current);
            pointerFrameRef.current = null;
          }
          setPointerPos(null);
        }}
        onContextMenu={handleContextMenu}
        style={{
          width: worldW * canvasZoom,
          height: worldH * canvasZoom,
          boxShadow: "none",
          backgroundColor: "transparent",
          overflow: "visible",
          touchAction: "none",
          userSelect: "none",
          cursor:
            selectedTool === "hand"
              ? isDragging
                ? "grabbing"
                : "grab"
              : selectedTool === "eyedropper"
                ? "copy"
                : selectedTool === "paintbucket"
                  ? "cell"
                  : selectedTool === "text"
                    ? "text"
                    : selectedTool === "freehand"
                      ? "crosshair"
                      : selectedTool === "eraser"
                        ? "cell"
                        : selectedTool === "rectangle" ||
                            selectedTool === "circle" ||
                            selectedTool === "line"
                          ? "crosshair"
                          : pathEditMode
                            ? "default"
                            : selectedTool !== "select"
                              ? "crosshair"
                              : isDragging && activeHandle === "rotate"
                                ? "grabbing"
                                : isDragging && activeHandle === "move"
                                  ? "move"
                                  : isDragging && activeHandle
                                    ? cursorForHandle(activeHandle, 0)
                                    : cursorForHandle(hoverHandle, 0),
        }}
        data-tool={selectedTool}
        data-path-edit={pathEditMode ? "1" : "0"}
      >
        <g
          className="stage-viewport-root"
          transform={`translate(${canvasPan.x} ${canvasPan.y})`}
        >
          {/* Stage surface (logical size). Outside remains workspace gray. */}
          <rect
            x={0}
            y={0}
            width={settings.width}
            height={settings.height}
            fill={settings.backgroundColor || "#ffffff"}
          />
          <rect
            x={0}
            y={0}
            width={settings.width}
            height={settings.height}
            fill="none"
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={1 / Math.max(canvasZoom, 0.0001)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <StageGrid
            width={settings.width}
            height={settings.height}
            gridSize={defaultGridSize(settings.gridSize)}
            visible={!!settings.showGrid}
            zoom={canvasZoom}
          />
          <StageGuides
            guides={settings.guides ?? EMPTY_GUIDES}
            visible={settings.showGuides !== false}
            width={settings.width}
            height={settings.height}
            zoom={canvasZoom}
            activeId={activeGuideId}
            onPointerDownGuide={(guideId, ev) => {
              ev.stopPropagation();
              ev.preventDefault();
              const g = (settings.guides ?? []).find((x) => x.id === guideId);
              if (!g) return;
              guideDragRef.current = { id: g.id, orientation: g.orientation };
              setActiveGuideId(g.id);
              try {
                (ev.target as Element).setPointerCapture?.(ev.pointerId);
              } catch {
                /* ignore */
              }
            }}
          />
          <g key={layers.map((l) => l.id).join("|")}>
          <LayerStack
            layers={layers}
            project={project}
            currentFrame={currentFrame}
            compositionDuration={compositionDuration}
            onionSkinEnabled={onionSkinEnabled}
            onionSkinBefore={onionSkinBefore}
            onionSkinAfter={onionSkinAfter}
            stageWidth={settings.width}
            stageHeight={settings.height}
            selectedLayerId={selectedLayerId}
          />
          <SelectionOverlays
            layers={layers}
            project={project}
            currentFrame={currentFrame}
            selectedTool={selectedTool}
            selectedLayerId={selectedLayerId}
            selectedElementId={selectedElementId}
            selectedElementIds={selectedElementIds}
            canvasZoom={canvasZoom}
            pathEditMode={pathEditMode}
            activeHandle={activeHandle}
            hoverHandle={hoverHandle}
            marqueeUi={marqueeUi}
            selectedVertexIndex={selectedVertexIndex}
            vertexSession={vertexSessionRef.current}
          />
          <DrawPreview
            isDrawing={isDrawing}
            previewPoints={previewPoints}
            selectedTool={selectedTool}
            drawingStroke={drawingStroke}
            drawingStrokeWidth={drawingStrokeWidth}
          />
        </g>
        </g>
      </svg>
      {selectedTool === "select" &&
        !pathEditMode &&
        selectedElementIds.length === 1 &&
        selectedElementId &&
        (() => {
          for (const layer of layers) {
            const el = getElementsAtFrame(layer.keyframes, currentFrame).find(
              (e) => e.id === selectedElementId,
            );
            if (el && isEditablePathShape(el)) {
              return (
                <div className="path-edit-hint" role="status">
                  ダブルクリック、または右クリック「頂点を編集」でアンカーを表示
                  <button
                    type="button"
                    className="path-edit-hint-btn"
                    onClick={() => setPathEditMode(true)}
                  >
                    頂点を編集
                  </button>
                </div>
              );
            }
          }
          return null;
        })()}
      {contextMenu && (
        <StageContextMenu
          menu={contextMenu}
          hasSelection={
            selectedElementIds.length > 0 || Boolean(selectedElementId)
          }
          hasClipboard={Boolean(clipboard && clipboard.length > 0)}
          canEdit={Boolean(
            activeLayer && !activeLayer.locked && activeLayer.type !== "folder",
          )}
          onClose={() => setContextMenu(null)}
          onCopy={() => copySelection()}
          onCut={() => cutSelection()}
          onPaste={() => pasteClipboard()}
          onDelete={() => handleDeleteSelection()}
          onDuplicate={() => duplicateSelection()}
          onBringToFront={() => reorderSelectionZ("front")}
          onSendToBack={() => reorderSelectionZ("back")}
          canEditPathVertices={(() => {
            if (selectedElementIds.length !== 1 && !selectedElementId) return false;
            const id = selectedElementId ?? selectedElementIds[0];
            if (!id) return false;
            for (const layer of layers) {
              const el = getElementsAtFrame(layer.keyframes, currentFrame).find(
                (e) => e.id === id,
              );
              if (el && isEditablePathShape(el)) return true;
            }
            return false;
          })()}
          onEditPathVertices={() => {
            setPathEditMode(true);
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
};

export const Stage = React.memo(StageInner);
