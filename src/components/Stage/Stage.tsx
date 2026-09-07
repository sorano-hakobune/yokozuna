import React, { useRef, useEffect, useState, useCallback } from "react";
import { useProjectStore } from "@/stores/projectStore";
import {
  useActiveLayers,
  useProjectSettings,
  useSelectedLayer,
} from "@/stores/projectSelectors";
import { getElementsAtFrame } from "@/lib/animation/interpolate";
import {
  drawShape,
  createRectangleShape,
  createCircleShape,
  createLineShape,
} from "@/lib/draw";
import type { ShapeElement, Element } from "@/types/project";

export const Stage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const dragStartRef = useRef<{
    x: number;
    y: number;
    elementId: string;
    initialX: number;
    initialY: number;
  } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const project = useProjectStore((s) => s.project);
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const selectedTool = useProjectStore((s) => s.selectedTool);
  const selectedElementId = useProjectStore((s) => s.selectedElementId);
  const setSelectedElementId = useProjectStore((s) => s.setSelectedElementId);
  const setSelectedLayerId = useProjectStore((s) => s.setSelectedLayerId);
  const addShapeToLayer = useProjectStore((s) => s.addShapeToLayer);
  const updateElement = useProjectStore((s) => s.updateElement);
  const canvasZoom = useProjectStore((s) => s.canvasZoom);
  const canvasPan = useProjectStore((s) => s.canvasPan);
  const setCanvasZoom = useProjectStore((s) => s.setCanvasZoom);
  const setCanvasPan = useProjectStore((s) => s.setCanvasPan);

  const settings = useProjectSettings();
  const layers = useActiveLayers();
  const activeLayer = useSelectedLayer();

  // 画像キャッシュ
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const loadImage = useCallback((src: string): HTMLImageElement | null => {
    if (imageCache.current.has(src)) {
      return imageCache.current.get(src)!;
    }
    const img = new Image();
    img.src = src;
    imageCache.current.set(src, img);
    return img;
  }, []);

  // 再描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, backgroundColor } = settings;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = backgroundColor || "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(canvasPan.x, canvasPan.y);
    ctx.scale(canvasZoom, canvasZoom);

    // 背面レイヤーから描画
    const sorted = [...layers].reverse();

    for (const layer of sorted) {
      if (!layer.visible) continue;

      const elements = getElementsAtFrame(layer.keyframes, currentFrame);

      for (const element of elements) {
        ctx.save();

        if (element.type === "shape") {
          drawShape(ctx, element as ShapeElement);

          // 選択枠
          if (element.id === selectedElementId) {
            ctx.save();
            ctx.translate(element.x, element.y);
            ctx.rotate((element.rotation * Math.PI) / 180);
            ctx.scale(element.scaleX, element.scaleY);
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 2 / Math.max(element.scaleX, element.scaleY);
            ctx.setLineDash([4, 4]);

            const shape = element as ShapeElement;
            if (shape.shapeType === "rectangle") {
              const w = shape.width ?? 100;
              const h = shape.height ?? 100;
              ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
            } else if (shape.shapeType === "circle") {
              const r = (shape.radius ?? 50) + 4;
              ctx.beginPath();
              ctx.arc(0, 0, r, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.restore();
          }
        } else if (element.type === "bitmap") {
          const asset = project.assets[element.assetId];
          if (asset?.src) {
            const img = loadImage(asset.src);
            if (img && img.complete && img.naturalWidth > 0) {
              ctx.translate(element.x, element.y);
              ctx.rotate((element.rotation * Math.PI) / 180);
              ctx.scale(element.scaleX, element.scaleY);
              ctx.globalAlpha = element.opacity;
              ctx.drawImage(img, -img.width / 2, -img.height / 2);

              if (element.id === selectedElementId) {
                ctx.strokeStyle = "#ef4444";
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(
                  -img.width / 2 - 4,
                  -img.height / 2 - 4,
                  img.width + 8,
                  img.height + 8
                );
              }
            } else if (img) {
              img.onload = () => {
                // 再描画トリガー（簡易）
                useProjectStore.setState((s) => ({ ...s }));
              };
            }
          }
        }

        ctx.restore();
      }
    }

    ctx.restore();
  }, [
    project,
    layers,
    currentFrame,
    selectedElementId,
    settings,
    canvasZoom,
    canvasPan,
    loadImage,
  ]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x =
      ((e.clientX - rect.left) * scaleX - canvasPan.x) / canvasZoom;
    const y =
      ((e.clientY - rect.top) * scaleY - canvasPan.y) / canvasZoom;

    return { x, y };
  };

  const isPointInShape = (
    px: number,
    py: number,
    shape: ShapeElement
  ): boolean => {
    const dx = px - shape.x;
    const dy = py - shape.y;

    switch (shape.shapeType) {
      case "rectangle": {
        const w = (shape.width ?? 100) * shape.scaleX;
        const h = (shape.height ?? 100) * shape.scaleY;
        return Math.abs(dx) <= w / 2 && Math.abs(dy) <= h / 2;
      }
      case "circle": {
        const r = (shape.radius ?? 50) * Math.max(shape.scaleX, shape.scaleY);
        return Math.sqrt(dx * dx + dy * dy) <= r;
      }
      case "line": {
        if (!shape.points || shape.points.length < 2) return false;
        const tol = (shape.strokeWidth ?? 2) + 4;
        const p0 = shape.points[0];
        const p1 = shape.points[1];
        const x1 = shape.x + p0.x;
        const y1 = shape.y + p0.y;
        const x2 = shape.x + p1.x;
        const y2 = shape.y + p1.y;
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const lenSq = C * C + D * D;
        let param = lenSq !== 0 ? (A * C + B * D) / lenSq : -1;
        param = Math.max(0, Math.min(1, param));
        const xx = x1 + param * C;
        const yy = y1 + param * D;
        return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2) <= tol;
      }
      default:
        return false;
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setCanvasZoom(Math.max(0.1, Math.min(5, canvasZoom * delta)));
    } else {
      setCanvasPan({
        x: canvasPan.x - e.deltaX,
        y: canvasPan.y - e.deltaY,
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);

    // 描画ツール
    if (selectedTool !== "select") {
      if (!activeLayer || activeLayer.locked) return;
      setIsDrawing(true);
      drawStartRef.current = { x: coords.x, y: coords.y };
      setSelectedLayerId(activeLayer.id);
      return;
    }

    // 選択ツール: ヒットテスト（前面から）
    for (const layer of layers) {
      if (!layer.visible || layer.locked) continue;
      const elements = getElementsAtFrame(layer.keyframes, currentFrame);
      // 前面の要素から
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === "shape" && isPointInShape(coords.x, coords.y, el as ShapeElement)) {
          setSelectedLayerId(layer.id);
          setSelectedElementId(el.id);
          setIsDragging(true);
          dragStartRef.current = {
            x: coords.x,
            y: coords.y,
            elementId: el.id,
            initialX: el.x,
            initialY: el.y,
          };
          return;
        }
      }
    }

    setSelectedElementId(undefined);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStartRef.current || !activeLayer) return;

    const coords = getCanvasCoordinates(e);
    const deltaX = coords.x - dragStartRef.current.x;
    const deltaY = coords.y - dragStartRef.current.y;
    const newX = Math.round(dragStartRef.current.initialX + deltaX);
    const newY = Math.round(dragStartRef.current.initialY + deltaY);

    // 現在フレームにキーフレームが無い場合は作成してから更新する必要があるが、
    // 簡易的に既存キーフレーム上の要素を更新（ensure は後で改善可）
    const kf = activeLayer.keyframes.find((k) => k.frame === currentFrame);
    if (kf) {
      updateElement(
        activeLayer.id,
        currentFrame,
        dragStartRef.current.elementId,
        { x: newX, y: newY }
      );
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing && drawStartRef.current && activeLayer) {
      const coords = getCanvasCoordinates(e);
      const { x: startX, y: startY } = drawStartRef.current;
      const endX = coords.x;
      const endY = coords.y;

      let newShape: ShapeElement;

      switch (selectedTool) {
        case "rectangle": {
          const width = Math.max(4, Math.abs(endX - startX));
          const height = Math.max(4, Math.abs(endY - startY));
          const centerX = (startX + endX) / 2;
          const centerY = (startY + endY) / 2;
          newShape = createRectangleShape(centerX, centerY, width, height);
          break;
        }
        case "circle": {
          const radius = Math.max(
            4,
            Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2)
          );
          newShape = createCircleShape(startX, startY, radius);
          break;
        }
        case "line":
          newShape = createLineShape(startX, startY, endX, endY);
          break;
        default:
          newShape = createRectangleShape(startX, startY, 100, 100);
      }

      addShapeToLayer(activeLayer.id, currentFrame, newShape);
      setIsDrawing(false);
      drawStartRef.current = null;
    }

    setIsDragging(false);
    dragStartRef.current = null;
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#18181b",
        overflow: "hidden",
        position: "relative",
        padding: "20px",
      }}
    >
      <canvas
        ref={canvasRef}
        width={settings.width}
        height={settings.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
          backgroundColor: settings.backgroundColor,
          cursor:
            selectedTool !== "select"
              ? "crosshair"
              : isDragging
                ? "grabbing"
                : "default",
        }}
      />
    </div>
  );
};
