import { useState, useRef, useEffect, useCallback } from "react";
import type { EasingType, Keyframe, TweenType } from "@/types/project";
import { useProjectStore } from "@/stores/projectStore";
import { EASING_MENU_SHORT } from "@/lib/animation/easing";
import { createDefaultMotionPath } from "@/lib/animation/motionPath";
import { clampMenuPosition } from "@/components/ui/ContextMenu";

interface KeyframeMarkerProps {
  layerId: string;
  keyframe: Keyframe;
  zoom: number;
  duration: number;
  locked?: boolean;
  isCurrent?: boolean;
  hasNextKeyframe?: boolean;
}

const DRAG_THRESHOLD_PX = 4;

export function KeyframeMarker({
  layerId,
  keyframe,
  zoom,
  duration,
  locked = false,
  isCurrent,
  hasNextKeyframe,
}: KeyframeMarkerProps) {
  const removeKeyframe = useProjectStore((s) => s.removeKeyframe);
  const setKeyframeTween = useProjectStore((s) => s.setKeyframeTween);
  const setKeyframeMotionPath = useProjectStore((s) => s.setKeyframeMotionPath);
  const setCurrentFrame = useProjectStore((s) => s.setCurrentFrame);
  const moveKeyframe = useProjectStore((s) => s.moveKeyframe);
  const copyKeyframe = useProjectStore((s) => s.copyKeyframe);
  const captureKeyframeClipboard = useProjectStore((s) => s.captureKeyframeClipboard);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    trackLeft: number;
    originFrame: number;
    didDrag: boolean;
  } | null>(null);

  const [dragUi, setDragUi] = useState<{
    targetFrame: number;
    isCopy: boolean;
  } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { left, top } = clampMenuPosition(menuPos.x, menuPos.y, rect.width, rect.height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menuOpen, menuPos.x, menuPos.y]);

  const clampFrame = useCallback(
    (frame: number) =>
      Math.max(0, Math.min(Math.max(0, duration - 1), Math.round(frame))),
    [duration],
  );

  const frameFromClientX = useCallback(
    (clientX: number, trackLeft: number) =>
      clampFrame((clientX - trackLeft) / zoom),
    [clampFrame, zoom],
  );

  const endDrag = useCallback(
    (clientX: number, altKey: boolean) => {
      const session = dragRef.current;
      dragRef.current = null;
      setDragUi(null);

      if (!session || !session.didDrag) {
        // Click without drag → seek playhead
        setCurrentFrame(keyframe.frame);
        return;
      }

      const target = frameFromClientX(clientX, session.trackLeft);
      if (target === session.originFrame) return;

      if (altKey) {
        copyKeyframe(layerId, session.originFrame, target);
        setCurrentFrame(target);
      } else {
        moveKeyframe(layerId, session.originFrame, target);
        setCurrentFrame(target);
      }
    },
    [
      copyKeyframe,
      frameFromClientX,
      keyframe.frame,
      layerId,
      moveKeyframe,
      setCurrentFrame,
    ],
  );

  // Keep latest helpers in refs so the window listeners stay stable
  // (avoids re-subscribing on every store update → update-depth storms).
  const endDragRef = useRef(endDrag);
  const frameFromClientXRef = useRef(frameFromClientX);
  endDragRef.current = endDrag;
  frameFromClientXRef.current = frameFromClientX;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const session = dragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;

      const dx = e.clientX - session.startClientX;
      if (!session.didDrag && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      session.didDrag = true;

      const targetFrame = frameFromClientXRef.current(
        e.clientX,
        session.trackLeft,
      );
      setDragUi((prev) => {
        const isCopy = e.altKey;
        if (
          prev &&
          prev.targetFrame === targetFrame &&
          prev.isCopy === isCopy
        ) {
          return prev;
        }
        return { targetFrame, isCopy };
      });
    };

    const onUp = (e: PointerEvent) => {
      const session = dragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      endDragRef.current(e.clientX, e.altKey);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || locked) return;
    e.stopPropagation();
    e.preventDefault();

    const track = markerRef.current?.closest(".track") as HTMLElement | null;
    const trackLeft = track?.getBoundingClientRect().left ?? 0;

    dragRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      trackLeft,
      originFrame: keyframe.frame,
      didDrag: false,
    };
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const applyTween = (tween: TweenType, easing?: EasingType) => {
    setKeyframeTween(layerId, keyframe.frame, tween, easing);
    setMenuOpen(false);
  };

  const isDragging = dragUi !== null;
  const displayFrame = dragUi ? dragUi.targetFrame : keyframe.frame;
  // While dragging, keep original marker dimmed and show a ghost at target
  const showGhost =
    isDragging && dragUi !== null && dragUi.targetFrame !== keyframe.frame;

  return (
    <>
      <div
        ref={markerRef}
        className={`keyframe ${keyframe.tween !== "none" ? "has-tween" : ""} ${
          isCurrent ? "current" : ""
        } ${isDragging ? "dragging" : ""} ${locked ? "locked" : ""} ${
          (keyframe.elements?.length ?? 0) === 0 ? "is-empty" : "has-content"
        }`}
        style={{ left: keyframe.frame * zoom }}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
        title={
          locked
            ? `Frame ${keyframe.frame} (locked)`
            : `Frame ${keyframe.frame} · ドラッグで移動 / Alt+ドラッグでコピー`
        }
      />
      {showGhost && dragUi && (
        <div
          className={`keyframe keyframe-ghost ${
            dragUi.isCopy ? "is-copy" : "is-move"
          }`}
          style={{ left: displayFrame * zoom }}
          title={
            dragUi.isCopy
              ? `コピー → Frame ${dragUi.targetFrame}`
              : `移動 → Frame ${dragUi.targetFrame}`
          }
        />
      )}
      {menuOpen && (
        <div
          ref={menuRef}
          className="keyframe-context-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-section-label">トゥイーン</div>
          <button
            type="button"
            className={keyframe.tween === "motion" ? "active" : ""}
            disabled={!hasNextKeyframe}
            onClick={() => applyTween("motion", keyframe.easing ?? "linear")}
          >
            モーショントゥイーンを作成
          </button>
          <button
            type="button"
            className={keyframe.tween === "shape" ? "active" : ""}
            disabled={!hasNextKeyframe}
            onClick={() => applyTween("shape", keyframe.easing ?? "linear")}
          >
            シェイプトゥイーンを作成
          </button>
          <button
            type="button"
            className={keyframe.tween === "none" ? "active" : ""}
            onClick={() => applyTween("none")}
          >
            トゥイーンを削除
          </button>
          {keyframe.tween !== "none" && (
            <>
              <div className="menu-section-label">イージング</div>
              {EASING_MENU_SHORT.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={
                    (keyframe.easing ?? "linear") === value ? "active" : ""
                  }
                  onClick={() => applyTween(keyframe.tween, value)}
                >
                  {label}
                </button>
              ))}
            </>
          )}
          {keyframe.tween === "motion" && (
            <>
              <div className="menu-divider" />
              <div className="menu-section-label">モーションパス</div>
              <button
                type="button"
                onClick={() => {
                  if (keyframe.motionPath) {
                    setKeyframeMotionPath(layerId, keyframe.frame, undefined);
                  } else {
                    const el = keyframe.elements[0];
                    const from = el
                      ? { x: el.x, y: el.y }
                      : { x: 0, y: 0 };
                    setKeyframeMotionPath(
                      layerId,
                      keyframe.frame,
                      createDefaultMotionPath(from, {
                        x: from.x + 100,
                        y: from.y - 40,
                      }),
                    );
                  }
                  setMenuOpen(false);
                }}
              >
                {keyframe.motionPath ? "パスを削除" : "パスを作成"}
              </button>
              {keyframe.motionPath && (
                <button
                  type="button"
                  className={
                    keyframe.motionPath.orientToPath ? "active" : ""
                  }
                  onClick={() => {
                    setKeyframeMotionPath(layerId, keyframe.frame, {
                      ...keyframe.motionPath!,
                      orientToPath: !keyframe.motionPath!.orientToPath,
                    });
                    setMenuOpen(false);
                  }}
                >
                  パスに沿って回転
                </button>
              )}
            </>
          )}
          <div className="menu-divider" />
          <div className="menu-section-label">キーフレーム</div>
          <button
            type="button"
            onClick={() => {
              captureKeyframeClipboard(layerId, keyframe.frame);
              setMenuOpen(false);
            }}
          >
            キーフレームをコピー
          </button>
          <button
            type="button"
            onClick={() => {
              const state = useProjectStore.getState();
              const comp =
                state.project.compositions[state.project.activeCompositionId];
              const layer = comp?.layers.find((l) => l.id === layerId);
              const taken = new Set(layer?.keyframes.map((k) => k.frame) ?? []);
              let target = keyframe.frame + 1;
              const max = (comp?.duration ?? duration) - 1;
              while (target <= max && taken.has(target)) target += 1;
              if (target <= max) {
                copyKeyframe(layerId, keyframe.frame, target);
                setCurrentFrame(target);
              }
              setMenuOpen(false);
            }}
          >
            次の空きフレームへコピー
          </button>
          {keyframe.frame !== 0 && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                removeKeyframe(layerId, keyframe.frame);
                setMenuOpen(false);
              }}
            >
              キーフレームを削除
            </button>
          )}
        </div>
      )}
    </>
  );
}
