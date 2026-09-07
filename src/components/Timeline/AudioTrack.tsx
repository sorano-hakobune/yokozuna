import { useMemo, useRef, useState, useEffect, useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { useProjectStore } from "@/stores/projectStore";
import type { SoundInstance } from "@/types/project";
import { createPortal } from "react-dom";
import { clampMenuPosition } from "@/components/ui/ContextMenu";

type Props = {
  zoom: number;
  duration: number;
};

/**
 * Composition-level audio row under the layer tracks.
 * Drag clips horizontally to move start frame; edges resize duration.
 */
export function AudioTrack({ zoom, duration }: Props) {
  const project = useProjectStore((s) => s.project);
  const currentFrame = useProjectStore((s) => s.currentFrame);
  const selectedSoundId = useProjectStore((s) => s.selectedSoundId);
  const setSelectedSoundId = useProjectStore((s) => s.setSelectedSoundId);
  const updateSound = useProjectStore((s) => s.updateSound);
  const removeSound = useProjectStore((s) => s.removeSound);
  const setCurrentFrame = useProjectStore((s) => s.setCurrentFrame);
  const editingSymbolId = useProjectStore((s) => s.editingSymbolId);

  const comp =
    project.compositions[project.activeCompositionId];
  const sounds = comp?.sounds ?? [];
  const assets = project.assets;

  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    soundId: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{
    soundId: string;
    mode: "move" | "resize-left" | "resize-right";
    originX: number;
    originStart: number;
    originDur: number;
  } | null>(null);

  const totalWidth = duration * zoom;

  const clips = useMemo(() => {
    return sounds.map((s) => {
      const asset = assets[s.assetId];
      return {
        sound: s,
        label: s.name || asset?.name || "音声",
        color: s.muted ? "#4b5563" : "#7c3aed",
      };
    });
  }, [sounds, assets]);

  if (editingSymbolId) {
    return null;
  }

  const onPointerDownClip = useCallback((
    e: ReactPointerEvent,
    sound: SoundInstance,
    mode: "move" | "resize-left" | "resize-right",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSoundId(sound.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      soundId: sound.id,
      mode,
      originX: e.clientX,
      originStart: sound.startFrame,
      originDur: sound.durationFrames,
    };
  }, [setSelectedSoundId]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.originX;
    const dFrames = Math.round(dx / zoom);
    if (drag.mode === "move") {
      const start = Math.max(
        0,
        Math.min(duration - 1, drag.originStart + dFrames),
      );
      updateSound(drag.soundId, { startFrame: start });
    } else if (drag.mode === "resize-right") {
      const dur = Math.max(1, drag.originDur + dFrames);
      updateSound(drag.soundId, { durationFrames: dur });
    } else {
      const start = Math.max(0, drag.originStart + dFrames);
      const end = drag.originStart + drag.originDur;
      const dur = Math.max(1, end - start);
      updateSound(drag.soundId, { startFrame: start, durationFrames: dur });
    }
  }, [zoom, duration, updateSound]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Context menu: outside click / Escape / position clamp
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
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
  }, [menu, setMenu]);

  useEffect(() => {
    if (!menu) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { left, top } = clampMenuPosition(menu.x, menu.y, rect.width, rect.height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [menu]);

  const renderMenu = () => {
    if (!menu) return null;
    const sound = sounds.find((s) => s.id === menu.soundId);
    if (!sound) return null;

    const items: Array<{ kind?: "item"; label: string; disabled?: boolean; action: () => void } | { kind: "sep" }> = [
      {
        kind: "item",
        label: sound.muted ? "ミュート解除" : "ミュート",
        action: () => {
          updateSound(sound.id, { muted: !sound.muted });
          setMenu(null);
        },
      },
      {
        kind: "item",
        label: "音量…",
        action: () => {
          // Use a simple dialog for volume - could be enhanced later
          const v = window.prompt(
            "音量 (0–100)",
            String(Math.round(sound.volume * 100)),
          );
          if (v != null && v !== "") {
            const n = Number(v);
            if (Number.isFinite(n)) {
              updateSound(sound.id, { volume: Math.max(0, Math.min(1, n / 100)) });
            }
          }
          setMenu(null);
        },
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "削除",
        action: () => {
          removeSound(sound.id);
          setMenu(null);
        },
      },
    ];

    return createPortal(
      <div
        ref={menuRef}
        className="yo-context-menu"
        style={{ left: menu.x, top: menu.y }}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((item, i) =>
          item.kind === "sep" ? (
            <div key={`sep-${i}`} className="yo-context-sep" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="yo-context-item"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) return;
                item.action();
                setMenu(null);
              }}
            >
              <span>{item.label}</span>
            </button>
          )
        )}
      </div>,
      document.body,
    );
  };

  return (
    <div className="audio-track-row">
      <div
        className="audio-track-lane"
        style={{ width: totalWidth, minWidth: totalWidth }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          // Click empty lane → jump playhead
          const rect = e.currentTarget.getBoundingClientRect();
          const frame = Math.max(
            0,
            Math.min(
              duration - 1,
              Math.round((e.clientX - rect.left) / zoom),
            ),
          );
          setCurrentFrame(frame);
          setSelectedSoundId(undefined);
        }}
      >
        <div
          className="current-frame-col"
          style={{ left: currentFrame * zoom, width: Math.max(2, zoom) }}
        />
        {clips.map(({ sound, label, color }) => {
          const left = sound.startFrame * zoom;
          const width = Math.max(4, sound.durationFrames * zoom);
          const selected = selectedSoundId === sound.id;
          return (
            <div
              key={sound.id}
              className={`audio-clip ${selected ? "is-selected" : ""} ${
                sound.muted ? "is-muted" : ""
              }`}
              style={{
                left,
                width,
                background: color,
              }}
              title={`${label} · F${sound.startFrame}–${
                sound.startFrame + sound.durationFrames - 1
              } · vol ${Math.round(sound.volume * 100)}%`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedSoundId(sound.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedSoundId(sound.id);
                setMenu({ x: e.clientX, y: e.clientY, soundId: sound.id });
              }}
              onPointerDown={(e) => onPointerDownClip(e, sound, "move")}
            >
              <span
                className="audio-clip-handle left"
                onPointerDown={(e) =>
                  onPointerDownClip(e, sound, "resize-left")
                }
              />
              <span className="audio-clip-name">{label}</span>
              <span
                className="audio-clip-handle right"
                onPointerDown={(e) =>
                  onPointerDownClip(e, sound, "resize-right")
                }
              />
            </div>
          );
        })}
      </div>
      {renderMenu()}
    </div>
  );
}
