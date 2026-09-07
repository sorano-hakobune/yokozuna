import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/projectStore";
import type { SoundInstance } from "@/types/project";

/**
 * Keep HTMLAudioElements in sync with the playhead while `isPlaying` is true.
 * Scrubbing (large frame jumps) seeks; sequential advance lets the element run.
 */
export function useAudioSync(isPlaying: boolean) {
  const playersRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const lastFrameRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    const stopAll = () => {
      for (const audio of playersRef.current.values()) {
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
      }
    };

    if (!isPlaying) {
      stopAll();
      wasPlayingRef.current = false;
      lastFrameRef.current = useProjectStore.getState().currentFrame;
      return;
    }

    const tick = () => {
      const state = useProjectStore.getState();
      const frame = state.currentFrame;
      const fps = Math.max(1, state.project.settings.fps || 24);
      const comp =
        state.project.compositions[state.project.activeCompositionId];
      const sounds: SoundInstance[] = comp?.sounds ?? [];
      const assets = state.project.assets;

      const activeIds = new Set<string>();
      const last = lastFrameRef.current;
      const jumped =
        last == null ||
        Math.abs(frame - last) > 2 ||
        !wasPlayingRef.current;

      for (const sound of sounds) {
        if (sound.muted || sound.volume <= 0) continue;
        const end = sound.startFrame + sound.durationFrames;
        if (frame < sound.startFrame || frame >= end) continue;

        const asset = assets[sound.assetId];
        if (!asset?.src || asset.type !== "audio") continue;

        activeIds.add(sound.id);
        let audio = playersRef.current.get(sound.id);
        if (!audio) {
          audio = new Audio();
          audio.preload = "auto";
          playersRef.current.set(sound.id, audio);
        }
        if (audio.src !== asset.src) {
          audio.src = asset.src;
        }
        audio.volume = Math.max(0, Math.min(1, sound.volume));

        const offsetSec = (frame - sound.startFrame) / fps;
        const needSeek =
          jumped ||
          audio.paused ||
          Math.abs(audio.currentTime - offsetSec) > 0.35;

        if (needSeek) {
          try {
            audio.currentTime = Math.max(0, offsetSec);
          } catch {
            /* ignore seek errors before metadata */
          }
        }
        if (audio.paused) {
          void audio.play().catch(() => {
            /* autoplay policy — user already clicked play */
          });
        }
      }

      // Pause instances no longer under the playhead
      for (const [id, audio] of playersRef.current) {
        if (!activeIds.has(id) && !audio.paused) {
          audio.pause();
        }
      }

      // Drop players for deleted sounds
      for (const id of [...playersRef.current.keys()]) {
        if (!sounds.some((s) => s.id === id)) {
          const audio = playersRef.current.get(id);
          if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
          }
          playersRef.current.delete(id);
        }
      }

      lastFrameRef.current = frame;
      wasPlayingRef.current = true;
    };

    // Run immediately and on each store frame change via rAF poll
    tick();
    let raf = 0;
    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const audio of playersRef.current.values()) {
        try {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        } catch {
          /* ignore */
        }
      }
      playersRef.current.clear();
    };
  }, []);
}
