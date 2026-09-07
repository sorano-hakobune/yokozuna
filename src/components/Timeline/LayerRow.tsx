import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Layer } from "@/types/project";
import { useProjectStore } from "@/stores/projectStore";
import { createImageAssetFromFile } from "@/lib/project";
import { KeyframeMarker } from "./KeyframeMarker";

interface LayerRowProps {
  layer: Layer;
  zoom: number;
  currentFrame: number;
}

export function LayerRow({ layer, zoom, currentFrame }: LayerRowProps) {
  const addKeyframe = useProjectStore((s) => s.addKeyframe);
  const insertFrames = useProjectStore((s) => s.insertFrames);
  const removeFrames = useProjectStore((s) => s.removeFrames);
  const setCurrentFrame = useProjectStore((s) => s.setCurrentFrame);
  const setSelectedLayerId = useProjectStore((s) => s.setSelectedLayerId);
  const addAsset = useProjectStore((s) => s.addAsset);
  const addBitmapElement = useProjectStore((s) => s.addBitmapElement);
  const pasteKeyframeClipboard = useProjectStore((s) => s.pasteKeyframeClipboard);
  const keyframeClipboard = useProjectStore((s) => s.keyframeClipboard);
  const project = useProjectStore((s) => s.project);
  const [isDragOver, setIsDragOver] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    frame: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const lastClickRef = useRef<{ frame: number; time: number } | null>(null);

  const sortedKeyframes = useMemo(
    () => [...layer.keyframes].sort((a, b) => a.frame - b.frame),
    [layer.keyframes],
  );

  const tweenSpans = useMemo(() => {
    const spans: {
      start: number;
      end: number;
      easing?: string;
      tween: string;
    }[] = [];
    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      const kf = sortedKeyframes[i]!;
      if (kf.tween !== "none") {
        spans.push({
          start: kf.frame,
          end: sortedKeyframes[i + 1]!.frame,
          easing: kf.easing,
          tween: kf.tween,
        });
      }
    }
    return spans;
  }, [sortedKeyframes]);

  /** Visual hold ranges between keyframes (non-tween static frames). */
  const holdSpans = useMemo(() => {
    const spans: { start: number; end: number; empty: boolean }[] = [];
    const duration =
      project.compositions[project.activeCompositionId]?.duration ??
      project.settings.duration;
    for (let i = 0; i < sortedKeyframes.length; i++) {
      const kf = sortedKeyframes[i]!;
      const next = sortedKeyframes[i + 1];
      const end = next ? next.frame : duration;
      if (end > kf.frame + 1 && kf.tween === "none") {
        spans.push({
          start: kf.frame,
          end,
          empty: (kf.elements?.length ?? 0) === 0,
        });
      }
    }
    return spans;
  }, [sortedKeyframes, project]);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const frameFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.round(x / zoom));
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (layer.locked) return;
    if ((e.target as HTMLElement).closest(".keyframe")) return;

    const frame = frameFromEvent(e);
    setSelectedLayerId(layer.id);
    setCurrentFrame(frame);

    const now = performance.now();
    const prev = lastClickRef.current;
    if (prev && prev.frame === frame && now - prev.time < 350) {
      // Double-click → insert keyframe (Flash F6 feel)
      addKeyframe(layer.id, frame);
      lastClickRef.current = null;
      return;
    }
    lastClickRef.current = { frame, time: now };
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if ((e.target as HTMLElement).closest(".keyframe")) return;
    const frame = frameFromEvent(e);
    setSelectedLayerId(layer.id);
    setCurrentFrame(frame);
    setMenu({ x: e.clientX, y: e.clientY, frame });
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (layer.locked) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const duration =
      project.compositions[project.activeCompositionId]?.duration ??
      project.settings.duration;
    const frame = Math.max(
      0,
      Math.min(duration - 1, Math.round((e.clientX - rect.left) / zoom)),
    );
    const files = Array.from(e.dataTransfer.files).filter(
      (file) =>
        file.type.startsWith("image/") ||
        file.name.toLowerCase().endsWith(".svg"),
    );

    for (const file of files) {
      try {
        const assetId = addAsset(await createImageAssetFromFile(file));
        addBitmapElement(
          layer.id,
          frame,
          assetId,
          project.settings.width / 2,
          project.settings.height / 2,
        );
      } catch (error) {
        console.error("タイムラインへの画像取り込みエラー:", error);
      }
    }
  };

  return (
    <div
      className={`track ${layer.locked ? "locked" : ""} ${isDragOver ? "drag-over" : ""} track-type-${layer.type}`}
      onClick={handleTrackClick}
      onContextMenu={handleContextMenu}
      onDragOver={(e) => {
        if (!layer.locked) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {holdSpans.map((span) => (
        <div
          key={`hold-${span.start}-${span.end}`}
          className={`hold-span ${span.empty ? "is-empty" : ""}`}
          style={{
            left: span.start * zoom,
            width: Math.max(0, (span.end - span.start) * zoom),
          }}
          title={
            span.empty
              ? `空白キーフレーム保持 F${span.start}–${span.end - 1}`
              : `フレーム保持 F${span.start}–${span.end - 1}`
          }
        />
      ))}
      {tweenSpans.map((span) => (
        <div
          key={`tween-${span.start}-${span.end}`}
          className={`tween-span ${span.tween === "shape" ? "is-shape" : "is-motion"}`}
          style={{
            left: span.start * zoom,
            width: Math.max(0, (span.end - span.start) * zoom),
          }}
          title={
            span.tween === "shape"
              ? `シェイプトゥイーン · ${span.easing ?? "linear"}`
              : `モーショントゥイーン · ${span.easing ?? "linear"}`
          }
        />
      ))}
      <div
        className="current-frame-col"
        style={{ left: currentFrame * zoom, width: Math.max(2, zoom) }}
      />
      {sortedKeyframes.map((kf) => (
        <KeyframeMarker
          key={`${layer.id}-${kf.frame}`}
          layerId={layer.id}
          keyframe={kf}
          zoom={zoom}
          locked={layer.locked}
          duration={
            project.compositions[project.activeCompositionId]?.duration ??
            project.settings.duration
          }
          hasNextKeyframe={sortedKeyframes.some((k) => k.frame > kf.frame)}
        />
      ))}
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="keyframe-context-menu"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="menu-section-label">フレーム {menu.frame}</div>
            <button
              type="button"
              onClick={() => {
                insertFrames(menu.frame, 1, "all");
                setMenu(null);
              }}
            >
              フレームを挿入 (F5)
            </button>
            <button
              type="button"
              disabled={layer.locked}
              onClick={() => {
                addKeyframe(layer.id, menu.frame);
                setMenu(null);
              }}
            >
              キーフレームを挿入 (F6)
            </button>
            <button
              type="button"
              disabled={layer.locked}
              onClick={() => {
                addKeyframe(layer.id, menu.frame, []);
                setMenu(null);
              }}
            >
              空白キーフレームを挿入
            </button>
            <button
              type="button"
              disabled={layer.locked || !keyframeClipboard}
              onClick={() => {
                pasteKeyframeClipboard(layer.id, menu.frame);
                setMenu(null);
              }}
            >
              キーフレームを貼り付け
            </button>
            <div className="menu-divider" />
            <button
              type="button"
              className="danger"
              onClick={() => {
                removeFrames(menu.frame, 1, "all");
                setMenu(null);
              }}
            >
              フレームを削除 (Shift+F5)
            </button>
            <button
              type="button"
              disabled={layer.locked}
              onClick={() => {
                insertFrames(menu.frame, 1, "layer", layer.id);
                setMenu(null);
              }}
            >
              このレイヤーにのみフレーム挿入
            </button>
            <button
              type="button"
              className="danger"
              disabled={layer.locked}
              onClick={() => {
                removeFrames(menu.frame, 1, "layer", layer.id);
                setMenu(null);
              }}
            >
              このレイヤーのフレームを削除
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
